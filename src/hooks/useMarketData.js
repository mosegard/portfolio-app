import { useState, useCallback, useMemo } from 'react';
import { compressMarketData, decompressMarketData } from '../utils';

const CACHE_KEY = 'marketDataCache_v2';
const STALE_THRESHOLD_ACTIVE = 60 * 1000;
const STALE_THRESHOLD_INACTIVE = 24 * 60 * 60 * 1000;

export default function useMarketData(txs, settings, uniqueTickers) {

    // 1. LAZY INITIALIZATION
    const [marketData, setMarketData] = useState(() => {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) {
                const compressedStore = JSON.parse(raw);
                const inflated = {};

                Object.keys(compressedStore).forEach(ticker => {
                    const item = compressedStore[ticker];
                    if (item && item.h) {
                        inflated[ticker] = {
                            history: decompressMarketData(item.h),
                            lastUpdated: item.u || Date.now(),
                            currency: item.c,
                            price: item.p,
                            previousClose: item.pc,
                            lastTradeTime: item.lt,
                            ...item
                        };
                    }
                });
                console.log(`[MarketData] Loaded ${Object.keys(inflated).length} tickers from cache.`);
                return inflated;
            }
        } catch (e) {
            console.error("[MarketData] Cache load failed", e);
        }
        return {};
    });

    const [loading, setLoading] = useState(false);

    // 2. DERIVED STATE
    const lastUpdate = useMemo(() => {
        const times = Object.values(marketData)
            .map(d => d.lastUpdated)
            .filter(t => t > 0);
        return times.length ? new Date(Math.max(...times)) : null;
    }, [marketData]);

    // 3. Save Helper
    const saveToCache = useCallback((newDataMap) => {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            let store = raw ? JSON.parse(raw) : {};

            Object.keys(newDataMap).forEach(ticker => {
                store[ticker] = newDataMap[ticker];
            });

            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify(store));
            } catch (e) {
                if (e.name === 'QuotaExceededError') {
                    const activeSet = new Set([...uniqueTickers, settings.benchmarkTicker]);
                    const keys = Object.keys(store);
                    for (const key of keys) {
                        if (!activeSet.has(key) && !key.includes('DKK=X')) {
                            delete store[key];
                        }
                    }
                    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
                }
            }
        } catch (err) {
            console.error("[MarketData] Save failed", err);
        }
    }, [uniqueTickers, settings.benchmarkTicker]);

    // 4. Fetch Logic
    const fetchMarketData = useCallback(async (force = false) => {
        const currentHoldings = new Set();
        const holdingMap = {};
        txs.forEach(t => {
            if (!holdingMap[t.ticker]) holdingMap[t.ticker] = 0;
            if (t.type === 'BUY') holdingMap[t.ticker] += t.qty;
            if (t.type === 'SELL') holdingMap[t.ticker] -= t.qty;
        });
        Object.entries(holdingMap).forEach(([t, qty]) => {
            if (Math.abs(qty) > 0.001) currentHoldings.add(t);
        });

        const activeSet = new Set(currentHoldings);
        if (settings.benchmarkTicker) activeSet.add(settings.benchmarkTicker);

        const usedCurrencies = [...new Set(txs.map(t => t.currency).filter(c => c && c !== 'DKK'))];
        usedCurrencies.forEach(c => activeSet.add(`${c}DKK=X`));

        const allTickers = [
            ...uniqueTickers,
            ...usedCurrencies.map(c => `${c}DKK=X`),
            ...((settings.benchmarkTicker ? [settings.benchmarkTicker] : []))
        ];
        const uniqueList = [...new Set(allTickers)].filter(Boolean);

        if (uniqueList.length === 0) return;

        const now = Date.now();
        const targets = [];

        uniqueList.forEach(ticker => {
            const cachedItem = marketData[ticker];
            const lastUpd = cachedItem?.lastUpdated || 0;
            const age = now - lastUpd;
            const isActive = activeSet.has(ticker);

            let shouldFetch = false;
            if (force) shouldFetch = true;
            else if (!cachedItem) shouldFetch = true;
            else if (isActive && age > STALE_THRESHOLD_ACTIVE) shouldFetch = true;
            else if (!isActive && age > STALE_THRESHOLD_INACTIVE) shouldFetch = true;

            if (shouldFetch) {
                targets.push({ ticker, isActive });
            }
        });

        if (targets.length === 0) {
            console.log("[MarketData] All data is fresh.");
            return;
        }

        console.log(`[MarketData] Fetching ${targets.length} tickers...`, targets.map(t => t.ticker));
        setLoading(true);

        const nowSec = Math.floor(Date.now() / 1000);
        let globalStart = nowSec - (2 * 365 * 24 * 60 * 60);
        if (txs.length > 0) {
            const firstTx = txs[0].date.getTime() / 1000;
            globalStart = firstTx - (30 * 24 * 60 * 60);
        }

        const newCompressedData = {};
        const newInflatedData = {};

        await Promise.all(targets.map(async ({ ticker }) => {
            try {
                let myStart = globalStart;
                const firstTxForTicker = txs.find(t => t.ticker === ticker);
                if (firstTxForTicker) {
                    myStart = (firstTxForTicker.date.getTime() / 1000) - (30 * 24 * 60 * 60);
                }

                const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${Math.floor(myStart)}&period2=${nowSec}&interval=1d&events=div`;
                const res = await fetch(url);
                const json = await res.json();

                if (json.chart?.result) {
                    const result = json.chart.result[0];
                    const meta = result.meta;
                    const quotes = result.indicators.quote[0];
                    const dates = result.timestamp || [];

                    const cleanHistory = dates.map((t, i) => ({
                        date: new Date(t * 1000).toISOString().split('T')[0],
                        close: quotes.close[i] ? Number(quotes.close[i].toFixed(2)) : null
                    })).filter(x => x.close != null);

                    // --- STRICT REGULAR MARKET LOGIC ---
                    // We now strictly use regularMarketPrice.
                    // No checks for postMarket or preMarket.
                    const livePrice = meta.regularMarketPrice;
                    const lastTradeTime = meta.regularMarketTime;

                    let prevClose = meta.chartPreviousClose || meta.previousClose;

                    // Logic to ensure "History" doesn't duplicate "Today"
                    // If Yahoo returns today's candle in history, use the one before it as prevClose
                    if (cleanHistory.length >= 2) {
                        const lastCandle = cleanHistory[cleanHistory.length - 1];
                        const secondLastCandle = cleanHistory[cleanHistory.length - 2];
                        const isLastCandleToday = Math.abs(lastCandle.close - livePrice) / (livePrice || 1) < 0.0001;
                        if (isLastCandleToday) prevClose = secondLastCandle.close; else prevClose = lastCandle.close;
                    } else if (cleanHistory.length === 1) prevClose = cleanHistory[0].close;

                    const nowTs = Date.now();

                    newCompressedData[ticker] = {
                        h: compressMarketData(cleanHistory),
                        c: meta.currency,
                        p: livePrice,
                        pc: prevClose,
                        lt: lastTradeTime,
                        u: nowTs
                    };

                    newInflatedData[ticker] = {
                        history: cleanHistory,
                        currency: meta.currency,
                        price: livePrice,
                        previousClose: prevClose,
                        lastTradeTime: lastTradeTime,
                        lastUpdated: nowTs
                    };
                }
            } catch (e) {
                console.warn(`[MarketData] Failed to fetch ${ticker}`, e);
            }
        }));

        if (Object.keys(newInflatedData).length > 0) {
            setMarketData(prev => ({ ...prev, ...newInflatedData }));
            saveToCache(newCompressedData);
        }
        setLoading(false);

    }, [txs, settings, uniqueTickers, marketData, saveToCache]);

    return { marketData, loading, lastUpdate, fetchMarketData };
}