import { useState, useCallback, useEffect, useMemo } from 'react';
import { compressMarketData, decompressMarketData } from '../utils';

// Constants
const CACHE_KEY = 'marketDataCache_v2';
const STALE_THRESHOLD_ACTIVE = 60 * 1000; // 60 seconds
const STALE_THRESHOLD_INACTIVE = 24 * 60 * 60 * 1000; // 24 hours

export default function useMarketData(txs, settings, uniqueTickers) {
    const [marketData, setMarketData] = useState({});
    const [loading, setLoading] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(null);

    // 1. Load & Decompress on Mount
    useEffect(() => {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) {
                const compressedStore = JSON.parse(raw);
                const inflated = {};
                
                Object.keys(compressedStore).forEach(ticker => {
                    const item = compressedStore[ticker];
                    inflated[ticker] = {
                        ...item,
                        history: decompressMarketData(item.h),
                        lastUpdated: item.u
                    };
                });
                
                setMarketData(inflated);
                
                const times = Object.values(inflated).map(d => d.lastUpdated).filter(t => t > 0);
                if (times.length) setLastUpdate(new Date(Math.max(...times)));
            }
        } catch (e) {
            console.error("Cache load failed", e);
        }
    }, []);

    // 2. Safe Storage with Eviction Policy (NOW MEMOIZED)
    const saveToCache = useCallback((newDataMap) => {
        try {
            // Load current compressed state (source of truth)
            const raw = localStorage.getItem(CACHE_KEY);
            let store = raw ? JSON.parse(raw) : {};

            // Merge new data
            Object.keys(newDataMap).forEach(ticker => {
                store[ticker] = newDataMap[ticker];
            });

            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify(store));
            } catch (e) {
                if (e.name === 'QuotaExceededError') {
                    console.warn("Storage full! Evicting old inactive tickers...");
                    
                    // Identify Active Tickers
                    const activeTickers = new Set(uniqueTickers);
                    if (settings.benchmarkTicker) activeTickers.add(settings.benchmarkTicker);

                    // Sort by Last Updated (Oldest first)
                    const sortedKeys = Object.keys(store).sort((a, b) => {
                        return (store[a].u || 0) - (store[b].u || 0);
                    });

                    let freed = false;
                    for (const key of sortedKeys) {
                        // Don't delete active tickers or currency pairs
                        if (!activeTickers.has(key) && !key.includes('DKK=X')) {
                            delete store[key];
                            freed = true;
                            try {
                                localStorage.setItem(CACHE_KEY, JSON.stringify(store));
                                console.log(`Evicted ${key} to save space.`);
                                break; 
                            } catch (e2) { continue; }
                        }
                    }
                    
                    if (!freed) console.error("Cache is full and only contains active tickers.");
                }
            }
        } catch (err) {
            console.error("Critical cache error", err);
        }
    }, [uniqueTickers, settings.benchmarkTicker]); // <--- Dependencies for saveToCache

    // 3. The Fetcher
    const fetchMarketData = useCallback(async (force = false) => {
        // Calculate current holdings
        const currentHoldings = new Set();
        const holdingMap = {};
        txs.forEach(t => {
             if(!holdingMap[t.ticker]) holdingMap[t.ticker] = 0;
             if(t.type === 'BUY') holdingMap[t.ticker] += t.qty;
             if(t.type === 'SELL') holdingMap[t.ticker] -= t.qty;
        });
        Object.entries(holdingMap).forEach(([t, qty]) => {
            if(Math.abs(qty) > 0.001) currentHoldings.add(t);
        });

        const activeSet = new Set(currentHoldings);
        if (settings.benchmarkTicker) activeSet.add(settings.benchmarkTicker);

        const usedCurrencies = [...new Set(txs.map(t => t.currency).filter(c => c && c !== 'DKK'))];
        usedCurrencies.forEach(c => activeSet.add(`${c}DKK=X`));

        const allTickers = [...uniqueTickers, ...usedCurrencies.map(c => `${c}DKK=X`), ...((settings.benchmarkTicker ? [settings.benchmarkTicker] : []))];
        const uniqueList = [...new Set(allTickers)];

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

        if (targets.length === 0) return;

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
                const res = await fetch(`${settings.proxyUrl}${encodeURIComponent(url)}`);
                const json = await res.json();

                if (json.chart?.result) {
                    const result = json.chart.result[0];
                    const meta = result.meta;
                    const quotes = result.indicators.quote[0];
                    const dates = result.timestamp;

                    const cleanHistory = dates.map((t, i) => ({
                        date: new Date(t * 1000).toISOString().split('T')[0],
                        close: quotes.close[i] ? Number(quotes.close[i].toFixed(2)) : null
                    })).filter(x => x.close != null);

                    let livePrice = meta.regularMarketPrice;
                    let lastTradeTime = meta.regularMarketTime;
                    if (meta.postMarketPrice && meta.postMarketTime > lastTradeTime) {
                        livePrice = meta.postMarketPrice; lastTradeTime = meta.postMarketTime;
                    } else if (meta.preMarketPrice && meta.preMarketTime > lastTradeTime) {
                        livePrice = meta.preMarketPrice; lastTradeTime = meta.preMarketTime;
                    }

                    let prevClose = meta.chartPreviousClose || meta.previousClose;
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
                console.warn(`Failed to fetch ${ticker}`, e);
            }
        }));

        if (Object.keys(newInflatedData).length > 0) {
            setMarketData(prev => ({ ...prev, ...newInflatedData }));
            setLastUpdate(new Date());
            
            // This is now safe because saveToCache is memoized
            saveToCache(newCompressedData);
        }

        setLoading(false);

    }, [txs, settings, uniqueTickers, marketData, saveToCache]); // <--- Added saveToCache

    return { marketData, loading, lastUpdate, fetchMarketData };
}