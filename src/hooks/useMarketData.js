import { useState, useCallback, useEffect, useMemo } from 'react';

export default function useMarketData(txs, settings, uniqueTickers) {
    const [marketData, setMarketData] = useState(() => JSON.parse(localStorage.getItem('marketDataCache') || '{}'));
    const [loading, setLoading] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(() => {
        try {
            const cache = JSON.parse(localStorage.getItem('marketDataCache') || '{}');
            const timestamps = Object.values(cache).map(d => d.lastUpdated).filter(t => t > 0);
            if (timestamps.length > 0) return new Date(Math.max(...timestamps));
        } catch { }
        return null;
    });

    const uniqueTickersCount = uniqueTickers.length;
    const uniqueTickersKey = useMemo(() => uniqueTickers.join(','), [uniqueTickers]);

    const fetchMarketData = useCallback(async (silent = false) => {
        const currentTxs = txs;
        const currentSettings = settings;
        const currentTickers = uniqueTickers;

        const usedCurrencies = [...new Set(currentTxs.map(t => t.currency).filter(c => c && c !== 'DKK'))];
        const bench = currentSettings.benchmarkTicker ? [currentSettings.benchmarkTicker] : [];
        const allTickers = [...currentTickers, ...usedCurrencies.map(c => `${c}DKK=X`), ...bench];

        if (allTickers.length === 0) return;

        try {
            if (!silent) setLoading(true);
            const now = Math.floor(Date.now() / 1000);
            let globalStart = now - (2 * 365 * 24 * 60 * 60); // Default 2 years back
            
            // Optimization: If we have transactions, start fetching from 30 days before the first one
            if (currentTxs.length > 0) {
                const firstTx = currentTxs[0].date.getTime() / 1000;
                globalStart = firstTx - (30 * 24 * 60 * 60);
            }

            const incomingData = {};

            await Promise.all(allTickers.map(async (ticker) => {
                try {
                    let myStart = globalStart;
                    if (currentTickers.includes(ticker)) {
                        const firstTxForTicker = currentTxs.find(t => t.ticker === ticker);
                        if (firstTxForTicker) {
                            myStart = (firstTxForTicker.date.getTime() / 1000) - (30 * 24 * 60 * 60);
                        }
                    }

                    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${Math.floor(myStart)}&period2=${now}&interval=1d&events=div`;
                    const res = await fetch(`${currentSettings.proxyUrl}${encodeURIComponent(url)}`);
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
                            livePrice = meta.postMarketPrice;
                            lastTradeTime = meta.postMarketTime;
                        } else if (meta.preMarketPrice && meta.preMarketTime > lastTradeTime) {
                            livePrice = meta.preMarketPrice;
                            lastTradeTime = meta.preMarketTime;
                        }

                        let prevClose = meta.chartPreviousClose || meta.previousClose;

                        // Fallback logic for previous close if missing
                        if (cleanHistory.length >= 2) {
                            const lastCandle = cleanHistory[cleanHistory.length - 1];
                            const secondLastCandle = cleanHistory[cleanHistory.length - 2];
                            const isLastCandleToday = Math.abs(lastCandle.close - livePrice) / (livePrice || 1) < 0.0001;
                            if (isLastCandleToday) prevClose = secondLastCandle.close;
                            else prevClose = lastCandle.close;
                        } else if (cleanHistory.length === 1) {
                            prevClose = cleanHistory[0].close;
                        }

                        incomingData[ticker] = {
                            history: cleanHistory,
                            currency: meta.currency,
                            price: livePrice,
                            previousClose: prevClose,
                            lastTradeTime: lastTradeTime,
                            lastUpdated: Date.now()
                        };
                    }
                } catch (e) {
                    console.warn('Fetch failed', ticker, e);
                }
            }));

            setMarketData(prev => {
                const updated = { ...prev, ...incomingData };
                try {
                    localStorage.setItem('marketDataCache', JSON.stringify(updated));
                } catch (e) { console.warn('Storage full', e); }
                return updated;
            });
            setLastUpdate(new Date());

        } finally {
            if (!silent) setLoading(false);
        }
    }, [txs, settings, uniqueTickers]);

    // Auto-refresh logic
    useEffect(() => {
        if (uniqueTickersCount === 0 && !settings.benchmarkTicker) return;

        const checkAndFetch = () => {
            const now = Date.now();
            let isStale = true;
            if (lastUpdate && (now - lastUpdate.getTime() < 60000)) {
                isStale = false;
            }
            if (isStale) {
                console.log("Data is stale or missing, fetching...");
                fetchMarketData(true);
            }
        };

        checkAndFetch();
        const interval = setInterval(() => fetchMarketData(true), 60000);
        return () => clearInterval(interval);
    }, [uniqueTickersKey, uniqueTickersCount, settings.benchmarkTicker, fetchMarketData, lastUpdate]);

    return { marketData, loading, lastUpdate, fetchMarketData };
}