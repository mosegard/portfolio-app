import React, { useState, useMemo, useEffect } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, ReferenceLine, ReferenceArea, ComposedChart, Scatter
} from 'recharts';
import Papa from 'papaparse';

// Components
import ErrorBoundary from './components/ErrorBoundary';
import ModalPortal from './components/ModalPortal';
import NumberInput from './components/NumberInput';
import FlatpickrDate from './components/FlatpickrDate';

// Utilities
import {
    MONTHS_DK, CSV_COLUMNS, TYPE_OPTIONS, CURRENCY_OPTIONS, TAX_LIMITS,
    calculateDanishTax, toPrettyDate, toIso, fromIso, parseDanishNumber,
    parseDanishDate, getLocalISO, formatDanishNumber, formatCurrency,
    formatCurrencyNoDecimals, normalizeDate, formatNumber2, displayDateToIso,
    determineType, normalizeCurrency, normalizeCsvRow, normalizeAllRows,
    validateData, rowsToTransactions, utf8_to_b64, b64_to_utf8
} from './utils';
import usePortfolioEngine from './hooks/usePortfolioEngine';

function App() {
    const [lastUpdate, setLastUpdate] = useState(null);
    const [showMoversModal, setShowMoversModal] = useState(false);
    const [config, setConfig] = useState({
        askAccount: '',
        currencies: {},
        hidden: []
    });
    const [rows, setRows] = useState([]);
    const [view, setView] = useState('dashboard');
    const [filterAccount, setFilterAccount] = useState('All');
    const [taxYear, setTaxYear] = useState(new Date().getFullYear().toString());
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    const [marketData, setMarketData] = useState(() => JSON.parse(localStorage.getItem('marketDataCache') || '{}'));
    const [settings, setSettings] = useState(() => {
        let s = { proxyUrl: 'https://corsproxy.io/?', married: true, anonymityBlur: true, benchmarkTicker: '' };
        try {
            const stored = JSON.parse(localStorage.getItem('portfolio_settings') || '{}');
            s = { ...s, ...stored };
        } catch { }
        if (typeof s.anonymityBlur === 'undefined') s.anonymityBlur = true;
        return s;
    });
    const [loading, setLoading] = useState(false);

    const [ghConfig, setGhConfig] = useState({ owner: '', repo: 'portfolio', path: 'portfolio-data.csv', token: '' });
    const [showSettings, setShowSettings] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [fileSha, setFileSha] = useState(null);
    const [schemaErrors, setSchemaErrors] = useState([]);

    // Restore persisted GitHub settings
    useEffect(() => {
        try {
            const saved = localStorage.getItem('gh_config');
            if (saved) setGhConfig(JSON.parse(saved));
        } catch { }
    }, []);

    // Persist settings (including anonymityBlur) to localStorage on change
    useEffect(() => {
        try {
            localStorage.setItem('portfolio_settings', JSON.stringify(settings));
        } catch { }
    }, [settings]);

    const [filters, setFilters] = useState({});
    const [splitParams, setSplitParams] = useState({ ticker: '', num: 2, den: 1, dateIso: '', startDateIso: '', endDateIso: '' });
    const [graphRange, setGraphRange] = useState('ALL');
    const [customRange, setCustomRange] = useState({ startIso: '', endIso: '' });
    const [chartSelection, setChartSelection] = useState({ start: null, end: null, chart: null, dragging: false });
    const [fullscreenChart, setFullscreenChart] = useState(null);
    const [selectedTickers, setSelectedTickers] = useState([]);

    const [winSize, setWinSize] = useState({ w: window.innerWidth, h: window.innerHeight });
    useEffect(() => {
        const onResize = () => setWinSize({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        if (!chartSelection.dragging) return;
        const onWinMouseUp = () => {
            setChartSelection(s => (s.start != null && s.end != null)
                ? { ...s, dragging: false }
                : { start: null, end: null, chart: null, dragging: false });
        };
        window.addEventListener('mouseup', onWinMouseUp);
        const prevSelect = document.body.style.userSelect;
        document.body.style.userSelect = 'none';
        return () => {
            window.removeEventListener('mouseup', onWinMouseUp);
            document.body.style.userSelect = prevSelect;
        };
    }, [chartSelection.dragging]);

    const [showGainModal, setShowGainModal] = useState(false);
    const [showLiquidationModal, setShowLiquidationModal] = useState(false);
    const [showAllocationModal, setShowAllocationModal] = useState(false);
    const [allocationMode, setAllocationMode] = useState('currency');

    const getFxRate = (cur) => {
        const C = (cur || '').toUpperCase();
        if (!C || C === 'DKK') return 1;
        const fxM = marketData[`${C}DKK=X`] || {};
        return (fxM.price ?? fxM.previousClose ?? 1);
    };

    // Position value helpers (restored)
    const getPositionValue = (p) => {
        if (!p || Math.abs(p.qty) < 0.01) return 0;
        const m = marketData[p.ticker] || {};
        const price = m.price ?? m.previousClose ?? 0;
        const fxRate = getFxRate(p.cur);
        return p.qty * price * fxRate;
    };

    const getPositionValueWithPrev = (p) => {
        if (!p || Math.abs(p.qty) < 0.01) {
            const fxRate = getFxRate(p?.cur);
            return { val: 0, prevVal: 0, price: 0, prevClose: 0, fxRate };
        }
        const m = marketData[p.ticker] || {};
        const price = m.price ?? m.previousClose ?? 0;
        const prevClose = m.previousClose ?? price;
        const fxRate = getFxRate(p.cur);
        const val = p.qty * price * fxRate;
        const prevVal = p.qty * prevClose * fxRate;
        return { val, prevVal, price, prevClose, fxRate };
    };

    // Anonymity blur state (restored)
    const [blurActive, setBlurActive] = useState(false);
    useEffect(() => {
        if (!settings.anonymityBlur) return;
        const onBlur = () => setBlurActive(true);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('blur', onBlur);
        };
    }, [settings.anonymityBlur]);
    useEffect(() => {
        if (settings.anonymityBlur && document.hasFocus() === false) setBlurActive(true);
    }, [settings.anonymityBlur]);
    // Derived data used by the calculation engine
    const txs = useMemo(() => rowsToTransactions(rows), [rows]);
    const uniqueTickers = useMemo(() => [...new Set(txs.map(t => t.ticker).filter(t => t && !['DKK', 'USD', 'EUR', 'GBP', 'SEK', 'NOK'].includes(t)))], [txs]);
    const accounts = useMemo(() => [...new Set(rows.map(r => r['Account']).filter(Boolean))].sort(), [rows]);
    const years = useMemo(() => {
        const yr = new Set(txs.map(t => t.date.getFullYear().toString()));
        yr.add(new Date().getFullYear().toString());
        return [...yr].sort().reverse();
    }, [txs]);

    // Market data fetcher (restored)
    // Market data fetcher (Updated for Extended Hours)
    const fetchMarketData = async (silent = false) => {
        try {
            if (!silent) setLoading(true);

            const now = Math.floor(Date.now() / 1000);
            let globalStart = now - (2 * 365 * 24 * 60 * 60);
            if (txs.length > 0) {
                const firstTx = txs[0].date.getTime() / 1000;
                globalStart = firstTx - (30 * 24 * 60 * 60);
            }

            const usedCurrencies = [...new Set(txs.map(t => t.currency).filter(c => c && c !== 'DKK'))];
            const bench = settings.benchmarkTicker ? [settings.benchmarkTicker] : [];
            const allTickers = [...uniqueTickers, ...usedCurrencies.map(c => `${c}DKK=X`), ...bench];

            if (allTickers.length === 0) {
                if (!silent) setLoading(false);
                return;
            }

            const newMData = { ...marketData };

            await Promise.all(allTickers.map(async (ticker) => {
                try {
                    let myStart = globalStart;
                    if (uniqueTickers.includes(ticker)) {
                        const firstTxForTicker = txs.find(t => t.ticker === ticker);
                        if (firstTxForTicker) {
                            myStart = (firstTxForTicker.date.getTime() / 1000) - (30 * 24 * 60 * 60);
                        }
                    }
                    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${Math.floor(myStart)}&period2=${now}&interval=1d&events=div`;
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

                        // --- EXTENDED HOURS LOGIC START ---
                        let livePrice = meta.regularMarketPrice;
                        let lastTradeTime = meta.regularMarketTime;

                        // Check if Post-Market (After hours) is newer and exists
                        if (meta.postMarketPrice && meta.postMarketTime > lastTradeTime) {
                            livePrice = meta.postMarketPrice;
                            lastTradeTime = meta.postMarketTime;
                        }
                        // Check if Pre-Market is newer and exists
                        else if (meta.preMarketPrice && meta.preMarketTime > lastTradeTime) {
                            livePrice = meta.preMarketPrice;
                            lastTradeTime = meta.preMarketTime;
                        }
                        // --- EXTENDED HOURS LOGIC END ---

                        let prevClose = meta.chartPreviousClose || meta.previousClose;

                        // Fallback logic if history exists but regularMarketPrice is stale
                        if (cleanHistory.length >= 2) {
                            const lastCandle = cleanHistory[cleanHistory.length - 1];
                            const secondLastCandle = cleanHistory[cleanHistory.length - 2];

                            // If the last candle in history is essentially the current price, use the one before it as prevClose
                            const isLastCandleToday = Math.abs(lastCandle.close - livePrice) / (livePrice || 1) < 0.0001;
                            if (isLastCandleToday) {
                                prevClose = secondLastCandle.close;
                            } else {
                                // Otherwise, the last candle IS the previous close
                                prevClose = lastCandle.close;
                            }
                        } else if (cleanHistory.length === 1) {
                            prevClose = cleanHistory[0].close;
                        }

                        newMData[ticker] = {
                            ...newMData[ticker],
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

            setMarketData(newMData);
            setLastUpdate(new Date());

            try {
                localStorage.setItem('marketDataCache', JSON.stringify(newMData));
            } catch (e) {
                console.warn('Storage full', e);
            }
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const calc = usePortfolioEngine(txs, marketData, settings, config, years);


    const splitCandidates = useMemo(() => {
        const candidates = [];
        const buys = txs.filter(t => (t.type === 'BUY') && marketData[t.ticker] && marketData[t.ticker].history);
        buys.forEach(tx => {
            const mData = marketData[tx.ticker];
            const dStr = getLocalISO(tx.date);
            const hit = mData.history.find(h => h.date === dStr) || mData.history.filter(h => h.date < dStr).pop();
            if (!hit) return;
            const ratio = tx.price / hit.close;
            if (ratio > 1.8) {
                const likelyRatio = Math.round(ratio);
                const exists = candidates.find(c => c.ticker === tx.ticker);
                if (!exists && likelyRatio > 1) {
                    candidates.push({
                        ticker: tx.ticker,
                        date: dStr,
                        yourPrice: tx.price,
                        marketPrice: hit.close,
                        suggestedNum: likelyRatio,
                        suggestedDen: 1,
                        ratio: ratio
                    });
                }
            }
        });
        return candidates.sort((a, b) => b.ratio - a.ratio);
    }, [txs, marketData]);

    const loadFromGithub = async () => {
        if (!ghConfig.token) return;
        setStatusMsg('Loading...');
        try {
            const headers = { 'Authorization': `token ${ghConfig.token}` };
            const repoBase = `https://api.github.com/repos/${ghConfig.owner}/${ghConfig.repo}/contents/`;
            const [resData, resSettings] = await Promise.all([
                fetch(`${repoBase}${ghConfig.path}`, { headers }),
                fetch(`${repoBase}portfolio-settings.csv`, { headers })
            ]);
            if (!resData.ok) throw new Error('Repo Error');
            const dataJson = await resData.json();
            setFileSha(dataJson.sha);
            const dataCsv = b64_to_utf8(dataJson.content);

            Papa.parse(dataCsv, {
                header: true, skipEmptyLines: true,
                complete: (r) => {
                    const normalized = normalizeAllRows(r.data);
                    setRows(normalized);
                    const errs = validateData(normalized);
                    setSchemaErrors(errs);
                }
            });

            if (resSettings.ok) {
                const setJson = await resSettings.json();
                const setCsv = b64_to_utf8(setJson.content);
                Papa.parse(setCsv, {
                    header: true, skipEmptyLines: true,
                    complete: (r) => {
                        const newConfig = { askAccount: '', currencies: {}, hidden: [] };
                        r.data.forEach(row => {
                            const type = (row['Type'] || '').trim().toUpperCase();
                            const key = (row['Key'] || '').trim();
                            const val = (row['Value'] || '').trim();
                            if (type === 'ASK') newConfig.askAccount = val;
                            if (type === 'CURRENCY') newConfig.currencies[key] = val;
                            if (type === 'HIDDEN') newConfig.hidden.push(key);
                        });
                        setConfig(newConfig);
                        console.log("Settings loaded:", newConfig);
                    }
                });
            } else { console.log("No settings file found, using defaults."); }
            setStatusMsg('Loaded');
            setTimeout(() => setStatusMsg(''), 2000);
        } catch (e) {
            console.error(e);
            setStatusMsg('Error Loading');
        }
    };

    const saveToGithub = async () => {
        if (!ghConfig.token) { setShowSettings(true); return; }
        setStatusMsg('Saving...');
        const sorted = [...rows].sort((a, b) => (parseDanishDate(a['Date']) || 0) - (parseDanishDate(b['Date']) || 0));
        const csv = Papa.unparse(sorted, { columns: CSV_COLUMNS });
        try {
            const res = await fetch(`https://api.github.com/repos/${ghConfig.owner}/${ghConfig.repo}/contents/${ghConfig.path}`, {
                method: 'PUT', headers: { 'Authorization': `token ${ghConfig.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'Update', content: utf8_to_b64(csv), sha: fileSha })
            });
            const d = await res.json();
            setFileSha(d.content.sha);
            setStatusMsg('Saved!');
        } catch (e) { setStatusMsg('Err'); }
        setTimeout(() => setStatusMsg(''), 2000);
    };

    const handleFileUpload = (e) => {
        Papa.parse(e.target.files[0], {
            header: true,
            skipEmptyLines: true,
            complete: (r) => {
                const normalized = normalizeAllRows(r.data);
                setRows(normalized);
                const errs = validateData(normalized);
                setSchemaErrors(errs);
                if (errs.length > 0) setStatusMsg('Data Warnings Found');
            }
        });
    };

    const updateRow = (idx, k, v) => setRows(prev => {
        const n = [...prev];
        let newVal = v;
        if (k === 'Type') newVal = determineType(v, n[idx]['Ticker'], n[idx]['Qty']);
        if (k === 'Currency') newVal = normalizeCurrency(v);
        n[idx] = { ...n[idx], [k]: newVal };
        return n;
    });

    // ----------------------------------------------------------------------------------
    // RENDER FUNCTIONS (UI)
    // ----------------------------------------------------------------------------------
    // NOTE: In a future refactor, these should be moved to separate component files.
    // For now, they live here to access 'calc' and 'marketData' easily.

    // 2. HOLDINGS
    const renderHoldings = () => {
        let list = Object.values(calc.portfolio).filter(p => Math.abs(p.qty) > 0.01);

        // Sort by value (værdi) descending
        list = list.slice().sort((a, b) => {
            const mA = marketData[a.ticker] || {};
            const mB = marketData[b.ticker] || {};
            const priceA = mA.price || 0;
            const priceB = mB.price || 0;
            const fxA = (marketData[`${a.cur}DKK=X`] || {}).price || 1;
            const fxB = (marketData[`${b.cur}DKK=X`] || {}).price || 1;
            const valA = a.qty * priceA * fxA;
            const valB = b.qty * priceB * fxB;
            return valB - valA;
        });

        const now = new Date();

        // --- CALCULATE TOTALS ---
        let totalVal = 0;
        let totalCost = 0;
        let totalUnrealized = 0;

        // Buckets for the "Total Day" row
        let dayGain_Active = 0;
        let prevVal_Active = 0;
        let activeCount = 0;

        let dayGain_All = 0;
        let prevVal_All = 0;

        list.forEach(p => {
            const m = marketData[p.ticker] || {};
            const { val, price, prevClose, fxRate } = getPositionValueWithPrev(p);

            // 1. Calculate Value & Cost (Always Total)
            const cost = p.qty * p.avg;
            totalVal += val;
            totalCost += cost;

            // 2. Check if "Active Today"
            const lastTrade = new Date((m.lastTradeTime || 0) * 1000);
            const isToday = lastTrade.getDate() === now.getDate() &&
                lastTrade.getMonth() === now.getMonth() &&
                lastTrade.getFullYear() === now.getFullYear();

            // 3. Calculate Day Gain for this specific stock
            let dailyGainVal = 0;
            if (price > 0 && prevClose > 0) {
                const dailyDiff = price - prevClose;
                dailyGainVal = dailyDiff * p.qty * fxRate;
            }
            const prevVal = val - dailyGainVal;

            // 4. Add to "All" bucket (fallback for weekends)
            dayGain_All += dailyGainVal;
            prevVal_All += prevVal;

            // 5. Add to "Active" bucket (if today)
            if (isToday) {
                activeCount++;
                dayGain_Active += dailyGainVal;
                prevVal_Active += prevVal;
            }
        });

        totalUnrealized = totalVal - totalCost;
        const totalUnrealizedPct = totalCost > 0 ? (totalUnrealized / totalCost) * 100 : 0;

        // DECIDE WHICH TOTAL TO SHOW
        // If activeCount > 0, show ONLY active sum (Green/Red). 
        // Else show ALL sum (Grey) to indicate "Last known change".
        const showActiveTotal = activeCount > 0;
        const finalTotalDayGain = showActiveTotal ? dayGain_Active : dayGain_All;
        const finalTotalPrevVal = showActiveTotal ? prevVal_Active : prevVal_All;
        const finalTotalDayPct = finalTotalPrevVal > 0 ? (finalTotalDayGain / finalTotalPrevVal) * 100 : 0;

        return (
            <div className="p-6 md:p-8 relative">
                <div className="card">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                                <tr>
                                    <th className="px-1 py-3 whitespace-nowrap">Ticker</th>
                                    <th className="px-1 py-3 text-right whitespace-nowrap hidden xl:table-cell">Antal</th>
                                    <th className="px-1 py-3 text-right whitespace-nowrap hidden sm:table-cell">Pris</th>
                                    <th className="px-1 py-3 text-right whitespace-nowrap">Dagsgevinst</th>
                                    <th className="px-1 py-3 text-right whitespace-nowrap">Dag %</th>
                                    <th className="px-1 py-3 text-right whitespace-nowrap hidden lg:table-cell">Værdi</th>
                                    <th className="px-1 py-3 text-right whitespace-nowrap">Gevinst/Tab</th>
                                    <th className="px-1 py-3 text-right whitespace-nowrap hidden sm:table-cell">%</th>
                                </tr>
                            </thead>

                            {/* TOTALS ROW */}
                            <tbody>
                                <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold text-gray-800">
                                    <td className="px-1 py-3 whitespace-nowrap flex items-center gap-2">
                                        Total
                                        {showActiveTotal && <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 rounded-full font-normal">Active</span>}
                                    </td>
                                    <td className="px-1 py-3 text-right whitespace-nowrap hidden xl:table-cell"></td>
                                    <td className="px-1 py-3 text-right whitespace-nowrap hidden sm:table-cell"></td>

                                    {/* Conditional Styling for Total Day Gain */}
                                    <td className={`px-1 py-3 text-right whitespace-nowrap ${!showActiveTotal ? 'text-gray-400' : (finalTotalDayGain >= 0 ? 'text-green-600' : 'text-red-600')
                                        }`}>
                                        {formatCurrency(finalTotalDayGain)}
                                    </td>
                                    <td className={`px-1 py-3 text-right whitespace-nowrap ${!showActiveTotal ? 'text-gray-400' : (finalTotalDayPct >= 0 ? 'text-green-600' : 'text-red-600')
                                        }`}>
                                        {formatNumber2(finalTotalDayPct)}%
                                    </td>

                                    <td className="px-1 py-3 text-right whitespace-nowrap hidden lg:table-cell">{formatCurrency(totalVal)}</td>
                                    <td className={`px-1 py-3 text-right whitespace-nowrap ${totalUnrealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(totalUnrealized)}</td>
                                    <td className={`px-1 py-3 text-right whitespace-nowrap hidden sm:table-cell ${totalUnrealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatNumber2(totalUnrealizedPct)}%</td>
                                </tr>
                            </tbody>

                            <tbody className="divide-y">
                                {list.map(p => {
                                    const m = marketData[p.ticker] || {};
                                    const { val, price, prevClose, fxRate } = getPositionValueWithPrev(p);
                                    const gain = val - (p.qty * p.avg);
                                    const costBasis = (p.qty * p.avg);
                                    const pct = costBasis > 0 ? (gain / costBasis) * 100 : null;

                                    const lastTradeTime = m.lastTradeTime || 0;
                                    const lastTradeDate = new Date(lastTradeTime * 1000);
                                    const nowSec = Math.floor(Date.now() / 1000);
                                    const diffSeconds = nowSec - lastTradeTime;

                                    // Is this specific stock from today?
                                    const isStockToday = lastTradeDate.getDate() === now.getDate() &&
                                        lastTradeDate.getMonth() === now.getMonth() &&
                                        lastTradeDate.getFullYear() === now.getFullYear();

                                    // "Pulse" dot logic (active recently)
                                    const isMarketOpen = lastTradeTime > 0 && diffSeconds < 2700;

                                    let dailyGainVal = 0;
                                    let dailyPct = 0;
                                    let debugTitle = "No Data";

                                    if (price > 0 && prevClose > 0) {
                                        const dailyDiff = price - prevClose;
                                        dailyGainVal = dailyDiff * p.qty * fxRate;
                                        dailyPct = (dailyDiff / prevClose) * 100;
                                        debugTitle = `Live: ${price}\nPrev: ${prevClose}`;
                                    }

                                    return (
                                        <tr key={p.ticker + p.acc} className="hover:bg-gray-50">
                                            { /* TICKER */}
                                            <td className="px-1 py-3 font-medium text-gray-900 flex items-center gap-2 whitespace-nowrap">
                                                <span
                                                    className={`w-2.5 h-2.5 rounded-full ${isMarketOpen ? 'bg-green-500 animate-pulse shadow-[0_0_5px_rgba(34,197,94,0.6)]' : 'bg-gray-300'}`}
                                                    title={isMarketOpen ? `Active (${Math.floor(diffSeconds / 60)}m ago)` : `Closed (${Math.floor(diffSeconds / 3600)}h ago)`}
                                                ></span>
                                                {p.ticker}
                                            </td>

                                            { /* Quantity */}
                                            <td className="px-1 py-3 text-right whitespace-nowrap hidden xl:table-cell">{formatDanishNumber(p.qty, 10)}</td>

                                            { /* Price */}
                                            <td className="px-1 py-3 text-right font-mono font-medium text-blue-700 whitespace-nowrap hidden sm:table-cell">
                                                {price > 0 ? <span>{formatNumber2(price)}</span> : <span className="text-red-300 text-xs">...</span>}
                                            </td>

                                            { /* Daily Gain (Greys out if not today) */}
                                            <td className={`px-1 py-3 text-right font-medium whitespace-nowrap ${!isStockToday ? 'text-gray-400' : (dailyGainVal >= 0 ? 'text-green-600' : 'text-red-600')
                                                }`}>
                                                {price > 0 ? formatCurrency(dailyGainVal) : '-'}
                                            </td>

                                            { /* Daily % (Greys out if not today) */}
                                            <td
                                                className={`px-1 py-3 text-right border-b border-dotted border-gray-200 cursor-help whitespace-nowrap ${!isStockToday ? 'text-gray-400' : (dailyPct >= 0 ? 'text-green-600' : 'text-red-600')
                                                    }`}
                                                title={debugTitle}
                                            >
                                                {price > 0 ? `${formatNumber2(dailyPct)}%` : '-'}
                                            </td>

                                            { /* Value */}
                                            <td className="px-1 py-3 text-right font-bold whitespace-nowrap hidden lg:table-cell">{formatCurrency(val)}</td>
                                            <td className={`px-1 py-3 text-right whitespace-nowrap ${gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(gain)}</td>
                                            <td className={`px-1 py-3 text-right whitespace-nowrap hidden sm:table-cell ${gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>{pct === null ? '—' : `${formatNumber2(pct)}%`}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                {/* Last Update Indicator */}
                <div className="absolute right-6 bottom-2 md:right-8 md:bottom-4 flex items-center gap-2 text-xs font-mono bg-gray-50 px-2 py-1 rounded border border-gray-100 shadow">
                    {loading ? (
                        <>
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
                            <span className="text-blue-600 font-medium">Opdaterer...</span>
                        </>
                    ) : (
                        <span className="text-gray-400">
                            Sidst opdateret: {lastUpdate ? lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Aldrig'}
                        </span>
                    )}
                </div>
            </div>
        );
    };


    // --- VIEW RENDERERS ---
    const renderTaxReport = () => {
        // Ensure default values exist for new loss fields
        const r = calc.reports[taxYear] || {
            rubrik66: 0, rubrik38: 0, rubrik345: 0, rubrik61: 0, rubrik63: 0, withheldTax: 0,
            askGain: 0, askTax: 0, paidTax: 0, paidAskTax: 0, breakdown: { stocks: [], etfs: [], dividends: [] },
            utilizedLossNormal: 0, carriedLossNormal: 0, utilizedLossAsk: 0, carriedLossAsk: 0
        };

        const currentYearStr = new Date().getFullYear().toString();
        const isCurrentYear = taxYear === currentYearStr;

        // --- 1. CALCULATIONS ---
        const shareIncome = (r.rubrik66 || 0) + (r.rubrik38 || 0) + (r.rubrik61 || 0) + (r.rubrik63 || 0);

        // Taxable Income = Gross Income - Utilized Loss
        const taxableIncome = Math.max(0, shareIncome - r.utilizedLossNormal);

        // Tax Limits (27% bracket limit)
        const limitBase = TAX_LIMITS[taxYear];
        const limitActual = limitBase * (settings.married ? 2 : 1);

        let taxBill = calculateDanishTax(taxableIncome, limitActual);

        // Capital Income Tax (Rubrik 345)
        const kapIncomeTax = (r.rubrik345 || 0) * 0.42;
        taxBill += kapIncomeTax;

        const taxToPay = Math.max(0, taxBill - (r.withheldTax || 0) - (r.paidTax || 0));
        const askTaxToPay = Math.max(0, (r.askTax || 0) - (r.paidAskTax || 0));

        // Progress Bar Calc
        const progressPct = Math.min(100, Math.max(0, (taxableIncome / limitActual) * 100));

        // --- Additional Planning Metrics (27% bracket & years to sell off) ---
        const unrealized = calc.unrealizedStockGain || 0;
        const remaining27Room = Math.max(0, limitActual - taxableIncome);
        const sellAt27Amount = Math.min(Math.max(0, unrealized), remaining27Room);
        const additionalTaxAt27 = sellAt27Amount * 0.27;
        const portionAt42Now = Math.max(0, unrealized - sellAt27Amount);
        const additionalTaxAt42 = portionAt42Now * 0.42;
        const optimalLiquidationTax = Math.max(0, unrealized) * 0.27; // Simplified: all realized under 27% over several years
        const yearsToSellAll = (() => {
            if (unrealized <= 0) return 0;
            if (remaining27Room >= unrealized) return 1; // all within this year's 27% bracket
            const remainingAfterThisYear = unrealized - remaining27Room;
            const extraYears = Math.ceil(remainingAfterThisYear / limitActual);
            return 1 + extraYears; // current year + future years
        })();

        return (
            <div className="p-6 md:p-8 space-y-6 max-w-6xl mx-auto animate-in fade-in duration-300">

                {/* 1. SUMMARIES ROW */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                    {/* LEFT: NORMAL TAX (Frie Midler) */}
                    <div className="card flex flex-col h-full relative overflow-hidden">

                        {/* 1. Header & Hero Value */}
                        <div className="flex justify-between items-end mb-2">
                            <div>
                                <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                    <i className="ph ph-briefcase text-blue-600"></i>Aktieindkomst
                                </h3>
                            </div>
                            <div className="text-right">
                                <div className={`text-xl font-bold leading-none ${taxableIncome >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                                    {formatCurrencyNoDecimals(taxableIncome)}
                                </div>
                            </div>
                        </div>
                        {/* 2. Minimalist Single-Line Bar */}
                        <div className="mb-8 flex items-center gap-3">
                            {/* The Bar Track */}
                            <div className="relative h-2.5 flex-1 bg-slate-100 rounded-full overflow-hidden">

                                {/* Safe Zone (Blue) */}
                                <div
                                    className="absolute top-0 left-0 h-full bg-blue-600 transition-all duration-500 ease-out"
                                    style={{
                                        width: `${Math.min(100, (Math.min(taxableIncome, limitActual) / Math.max(taxableIncome, limitActual)) * 100)}%`,
                                        zIndex: 2
                                    }}
                                />

                                {/* Danger Zone (Orange) - Appears if limit exceeded */}
                                {taxableIncome > limitActual && (
                                    <div
                                        className="absolute top-0 left-0 h-full bg-orange-500 transition-all duration-500 ease-out"
                                        style={{
                                            width: '100%',
                                            // Visual trick: Clip the left side based on where the limit is
                                            clipPath: `inset(0 0 0 ${Math.min(100, (limitActual / taxableIncome) * 100)}%)`
                                        }}
                                    />
                                )}

                                {/* Subtle white separator line to mark the 27/42 cut-off point */}
                                <div
                                    className="absolute top-0 bottom-0 w-[2px] bg-white z-10 opacity-50 mix-blend-overlay"
                                    style={{
                                        left: `${taxableIncome > limitActual ? (limitActual / taxableIncome) * 100 : 100}%`
                                    }}
                                />
                            </div>

                            {/* The Percentage Label */}
                            <span className={`text-xs font-bold font-mono min-w-[3.5rem] text-right ${taxableIncome > limitActual ? 'text-orange-500' : 'text-blue-600'}`}>
                                {taxableIncome > 0 ? ((taxBill / taxableIncome) * 100).toFixed(1) : '0.0'}%
                            </span>
                        </div>

                        {/* 3. Rubrik List */}
                        <div className="space-y-3 mb-6 flex-1">
                            {[
                                { label: 'Gevinst/tab aktier', rubrik: '66', val: r.rubrik66 },
                                { label: 'Gevinst/tab ETF', rubrik: '38', val: r.rubrik38 },
                                { label: 'Udbytte (DK)', rubrik: '61', val: r.rubrik61 },
                                { label: 'Udbytte (Udland)', rubrik: '63', val: r.rubrik63 },
                            ].map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center text-sm border-b border-gray-50 pb-2 last:border-0">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-gray-100 text-gray-600 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded text-xs">
                                            R{item.rubrik}
                                        </span>
                                        <span className="text-gray-600">{item.label}</span>
                                    </div>
                                    <span className={`font-mono font-medium ${item.val < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                        {item.val !== 0 ? formatCurrencyNoDecimals(item.val) : '—'}
                                    </span>
                                </div>
                            ))}

                            {/* Utilized Loss */}
                            {r.utilizedLossNormal > 0 && (
                                <div className="flex justify-between items-center text-sm pt-2 text-green-700 bg-green-50 p-2 rounded border border-green-50">
                                    <div className="flex items-center gap-2">
                                        <i className="ph ph-arrow-u-down-left"></i>
                                        <span>Fradrag fra tidligere års tab</span>
                                    </div>
                                    <span className="font-mono font-bold">-{formatCurrencyNoDecimals(r.utilizedLossNormal)}</span>
                                </div>
                            )}

                            {/* Carried Loss */}
                            {r.carriedLossNormal > 0 && shareIncome < 0 && (
                                <div className="flex justify-between items-center text-sm pt-2 text-gray-500 italic">
                                    <span>Tab til fremførsel (næste år)</span>
                                    <span className="font-mono">{formatCurrencyNoDecimals(r.carriedLossNormal)}</span>
                                </div>
                            )}

                            {/* Capital Income */}
                            {r.rubrik345 !== 0 && (
                                <div className="flex justify-between items-center text-sm pt-2 mt-2 border-t border-gray-50 border-dashed">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-purple-100 text-purple-700 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded text-xs">R345</span>
                                        <span className="text-gray-600">Kapitalindkomst</span>
                                    </div>
                                    <span className="font-mono font-medium text-gray-900">{formatCurrencyNoDecimals(r.rubrik345)}</span>
                                </div>
                            )}
                        </div>

                        {/* 4. Summary Footer */}
                        <div className="bg-gray-50 -mx-5 -mb-5 p-5 border-t border-gray-50 rounded-b-xl mt-auto">
                            <div className="space-y-1 text-sm mb-3">
                                <div className="flex justify-between text-gray-500">
                                    <span>Beregnet skat</span>
                                    <span>{formatCurrencyNoDecimals(taxBill)}</span>
                                </div>
                                <div className="flex justify-between text-green-600">
                                    <span>Betalt udbytteskat</span>
                                    <span>-{formatCurrencyNoDecimals(r.withheldTax || 0)}</span>
                                </div>
                                {(r.paidTax || 0) > 0 && (
                                    <div className="flex justify-between text-green-600">
                                        <span>Allerede betalt</span>
                                        <span>-{formatCurrencyNoDecimals(r.paidTax)}</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                                <span className="font-bold text-gray-900">Restskat</span>
                                <span className={`font-bold text-xl ${taxToPay > 0 ? 'text-blue-600' : 'text-green-600'}`}>
                                    {formatCurrencyNoDecimals(taxToPay)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: ASK (Aktiesparekonto) */}
                    <div className="card flex flex-col h-full">
                        {/* Header */}
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                    <i className="ph ph-bank text-teal-600"></i> Aktiesparekonto
                                </h3>
                            </div>
                            <div className="text-right">
                                {/* Taxable ASK is Gain - Utilized Loss */}
                                <div className={`text-xl font-bold ${r.askGain >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatCurrencyNoDecimals(Math.max(0, r.askGain - r.utilizedLossAsk))}</div>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="flex-1">
                            {r.askGain === 0 && r.askTax === 0 && r.utilizedLossAsk === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full pb-10 text-gray-400 text-sm italic">
                                    <i className="ph ph-prohibit text-2xl mb-2 text-gray-300"></i>
                                    Ingen aktivitet på ASK.
                                </div>
                            ) : (
                                <div className="space-y-3 mb-6 mt-8">
                                    <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="bg-teal-50 text-teal-700 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded text-xs">Lager</span>
                                            <span className="text-gray-600">Gevinst/tab</span>
                                        </div>
                                        <span className="font-mono font-medium text-gray-900">{formatCurrencyNoDecimals(r.askGain)}</span>
                                    </div>

                                    {/* --- NEW: UTILIZED ASK LOSS --- */}
                                    {r.utilizedLossAsk > 0 && (
                                        <div className="flex justify-between items-center text-sm text-green-700 bg-green-50 p-2 rounded border border-green-50">
                                            <div className="flex items-center gap-2">
                                                <i className="ph ph-arrow-u-down-left"></i>
                                                <span>Modregnet tab</span>
                                            </div>
                                            <span className="font-mono font-bold">-{formatCurrencyNoDecimals(r.utilizedLossAsk)}</span>
                                        </div>
                                    )}

                                    {/* --- NEW: CARRIED ASK LOSS --- */}
                                    {r.carriedLossAsk > 0 && r.askGain < 0 && (
                                        <div className="flex justify-between items-center text-sm text-gray-500 italic pb-2">
                                            <span>Tab til fremførsel</span>
                                            <span className="font-mono">{formatCurrencyNoDecimals(r.carriedLossAsk)}</span>
                                        </div>
                                    )}


                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="bg-gray-50 -mx-5 -mb-5 p-5 border-t border-teal-50 rounded-b-xl mt-auto">
                            <div className="space-y-1 text-sm mb-3">
                                <div className="flex justify-between text-gray-500">
                                    <span>Beregnet skat</span>
                                    <span>{formatCurrencyNoDecimals(r.askTax)}</span>
                                </div>
                                {(r.paidAskTax || 0) > 0 && (
                                    <div className="flex justify-between text-green-600">
                                        <span>Allerede betalt</span>
                                        <span>-{formatCurrencyNoDecimals(r.paidAskTax)}</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                                <span className="font-bold text-teal-900">Restskat</span>
                                <span className="font-bold text-xl text-teal-700">{formatCurrencyNoDecimals(askTaxToPay)}</span>
                            </div>


                        </div>
                    </div>
                </div>

                {/* Additional Tax if All Sold (Standalone) */}
                {isCurrentYear && (
                    <div className="card">
                        <div className="mb-2 flex items-center justify-between">
                            <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                <i className="ph ph-magic-wand text-purple-600"></i>
                                Urealiserede gevinster
                            </h3>
                            <div className="text-right">
                                <div className={`text-xl font-bold leading-none ${unrealized >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                                    {formatCurrencyNoDecimals(unrealized)}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Tile: Sell Everything Now */}
                            <div className="p-4 rounded border border-gray-50 bg-white">
                                <div className="text-xs font-bold text-gray-500 uppercase">Ekstra Skat</div>
                                <div className="mt-1 text-2xl font-bold text-purple-700">{formatCurrencyNoDecimals(calc.liquidationNormalTax)}</div>
                            </div>

                            {/* Tile: Optimal Liquidation (27%) */}
                            <div className="p-4 rounded border border-gray-50 bg-white">
                                <div className="text-xs font-bold text-gray-500 uppercase">Ekstra skat - ved 27%</div>
                                <div className="mt-1 text-2xl font-bold text-blue-700">{formatCurrencyNoDecimals(optimalLiquidationTax)}</div>
                            </div>

                            {/* Tile: Years to Complete */}
                            <div className="p-4 rounded border border-gray-50 bg-white">
                                <div className="text-xs font-bold text-gray-500 uppercase">År - ved 27%</div>
                                <div className="mt-1 text-2xl font-bold text-gray-900">{yearsToSellAll}</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. DETAILS SECTION (Full Width) */}
                <div className="card">
                    <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                        <i className="ph ph-list-magnifying-glass"></i> Transaktionsdetaljer
                    </h3>

                    <div className="space-y-10">
                        {/* Stocks Table */}
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-gray-100 pb-2">Aktier (Realisationsprincip)</h4>
                            {r.breakdown.stocks.length === 0 ? (
                                <p className="text-sm text-gray-400 italic">Ingen realiserede aktiegevinster.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-gray-500 bg-gray-50">
                                            <tr>
                                                <th className="py-2 px-3 rounded-l font-medium">Dato</th>
                                                <th className="py-2 px-3 font-medium">Papir</th>
                                                <th className="py-2 px-3 text-right font-medium">Antal</th>
                                                <th className="py-2 px-3 text-right font-medium">Køb</th>
                                                <th className="py-2 px-3 text-right font-medium">Salg</th>
                                                <th className="py-2 px-3 rounded-r text-right font-medium">Gevinst</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {r.breakdown.stocks.map((s, i) => (
                                                <tr key={i} className="hover:bg-gray-50">
                                                    <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{s.date}</td>
                                                    <td className="py-2 px-3 font-medium text-gray-900">{s.ticker} <span className="text-gray-400 font-normal text-xs ml-1">({s.account})</span></td>
                                                    <td className="py-2 px-3 text-right font-mono text-gray-600">{formatNumber2(s.qty)}</td>
                                                    <td className="py-2 px-3 text-right font-mono text-gray-600">{formatCurrency(s.costBasis)}</td>
                                                    <td className="py-2 px-3 text-right font-mono text-gray-600">{formatCurrency(s.proceeds)}</td>
                                                    <td className={`py-2 px-3 text-right font-mono font-bold ${s.gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {formatCurrency(s.gain)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Dividends Table */}
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-gray-100 pb-2">Udbytter</h4>
                            {r.breakdown.dividends.length === 0 ? (
                                <p className="text-sm text-gray-400 italic">Ingen udbytter.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-gray-500 bg-gray-50">
                                            <tr>
                                                <th className="py-2 px-3 rounded-l font-medium">Dato</th>
                                                <th className="py-2 px-3 font-medium">Papir</th>
                                                <th className="py-2 px-3 text-right font-medium">Brutto</th>
                                                <th className="py-2 px-3 rounded-r text-right font-medium">Tilbageholdt Skat</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {r.breakdown.dividends.map((d, i) => (
                                                <tr key={i} className="hover:bg-gray-50">
                                                    <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{d.date}</td>
                                                    <td className="py-2 px-3 font-medium text-gray-900">{d.ticker}</td>
                                                    <td className="py-2 px-3 text-right font-mono text-gray-900">{formatCurrency(d.amount)}</td>
                                                    <td className="py-2 px-3 text-right font-mono text-gray-500">{formatCurrency(d.withheldTax)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* ETF Table */}
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-gray-100 pb-2">ETF (Lagerbeskattet)</h4>
                            {r.breakdown.etfs.length === 0 ? (
                                <p className="text-sm text-gray-400 italic">Ingen ETF'er.</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {r.breakdown.etfs.map((e, i) => (
                                        <div key={i} className="border border-gray-100 rounded p-3 hover:bg-gray-50">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-bold text-gray-900 text-sm">{e.ticker} <span className="font-normal text-gray-400 text-xs">({e.account})</span></span>
                                                <span className={`font-mono font-bold text-sm ${e.gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(e.gain)}</span>
                                            </div>
                                            <div className="text-[10px] text-gray-500 font-mono flex justify-between">
                                                <span>Ultimo: {formatCurrencyNoDecimals(e.ultimoVal)}</span>
                                                <span>Primo: {formatCurrencyNoDecimals(e.primoVal)}</span>
                                                <span>Netto Køb: {formatCurrencyNoDecimals(e.netFlows)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        );
    };

    // 1. DASHBOARD
    const renderDashboard = () => {

        const series = calc.totalValueGraph || [];

        // 1. FILTER DATA BASED ON RANGE
        const getFilteredData = (dataset, isGrowth = false) => {
            if (dataset.length === 0) return [];
            if (graphRange === 'ALL') return dataset;

            // Custom zoom range
            if (graphRange === 'CUSTOM' && customRange.startIso && customRange.endIso) {
                const startIso = customRange.startIso <= customRange.endIso ? customRange.startIso : customRange.endIso;
                const endIso = customRange.startIso <= customRange.endIso ? customRange.endIso : customRange.startIso;
                let sliced = dataset.filter(d => d.date >= startIso && d.date <= endIso);
                if (isGrowth && sliced.length > 0) {
                    const baseVal = sliced[0].value;
                    const baseMult = (baseVal / 100) + 1;
                    return sliced.map(d => {
                        const curMult = (d.value / 100) + 1;
                        const newVal = ((curMult / baseMult) - 1) * 100;
                        return { ...d, value: newVal };
                    });
                }
                return sliced;
            }

            const now = new Date();
            let startDate = new Date();
            let endDate = null;

            if (graphRange === '1M') {
                startDate.setMonth(now.getMonth() - 1);
            } else if (graphRange === 'YTD') {
                startDate = new Date(now.getFullYear(), 0, 1); // Jan 1st this year
            } else if (!isNaN(Number(graphRange))) {
                // Specific year selected
                startDate = new Date(Number(graphRange), 0, 1);
                endDate = new Date(Number(graphRange), 11, 31);
            }

            const isoStart = getLocalISO(startDate);
            let sliced = dataset.filter(d => d.date >= isoStart);
            if (endDate) {
                const isoEnd = getLocalISO(endDate);
                sliced = sliced.filter(d => d.date <= isoEnd);
            }

            // For Growth Graph: Re-base to 0% at start of period
            if (isGrowth && sliced.length > 0) {
                const baseVal = sliced[0].value;
                // Convert % back to multiplier: 50% -> 1.5
                const baseMult = (baseVal / 100) + 1;

                return sliced.map(d => {
                    const curMult = (d.value / 100) + 1;
                    // Relative return: (Current / Base) - 1
                    const newVal = ((curMult / baseMult) - 1) * 100;
                    return { ...d, value: newVal };
                });
            }

            return sliced;
        };

        const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f43f5e', '#84cc16'];

        const isMulti = (selectedTickers || []).length > 1;
        const isSingle = (selectedTickers || []).length === 1;
        const sel = selectedTickers || [];

        const mergeByDate = (seriesMap) => {
            const dateSet = new Set();
            Object.values(seriesMap).forEach(arr => arr.forEach(d => dateSet.add(d.date)));
            const dates = Array.from(dateSet).sort();
            const maps = {};
            Object.keys(seriesMap).forEach(t => { maps[t] = new Map(seriesMap[t].map(d => [d.date, d.value])); });
            const latestCache = {};
            const findLatest = (t, date) => {
                const m = seriesMap[t];
                if (!m || m.length === 0) return undefined;
                // Simple linear search backwards; arrays are sorted by date
                for (let i = m.length - 1; i >= 0; i--) { if (m[i].date <= date) return m[i].value; }
                return undefined;
            };
            return dates.map(d => {
                const row = { date: d };
                Object.keys(seriesMap).forEach(t => {
                    const v = maps[t].get(d);
                    row[t] = (v !== undefined) ? v : findLatest(t, d);
                });
                return row;
            });
        };

        const baseValue = isSingle ? (calc.holdingGraphsByTicker[sel[0]]?.value || []) : isMulti ? mergeByDate(Object.fromEntries(sel.map(t => [t, calc.holdingGraphsByTicker[t]?.value || []]))) : calc.totalValueGraph;
        const baseGrowth = isSingle ? (calc.holdingGraphsByTicker[sel[0]]?.growth || []) : isMulti ? mergeByDate(Object.fromEntries(sel.map(t => [t, calc.holdingGraphsByTicker[t]?.growth || []]))) : calc.growthGraphData;
        const displayValueData = getFilteredData(baseValue, false);
        const displayGrowthData = getFilteredData(baseGrowth, true);

        // Benchmark options (Yahoo Finance tickers)
        const BENCHMARKS = [
            { label: 'Ingen', ticker: '' },
            { label: 'All Country World', ticker: 'SPYY.DE' },
            { label: 'Developed World', ticker: 'URTH' },
            { label: 'Europe', ticker: 'XEU.TO' },
            { label: 'S&P 500', ticker: '^GSPC' },
            { label: 'NASDAQ 100', ticker: '^NDX' },
            { label: 'Dow Jones', ticker: '^DJI' },
            { label: 'DK C25', ticker: '^OMXC25' },
            { label: 'Nvidia', ticker: 'NVDA' }
        ];
        const benchLabel = (BENCHMARKS.find(b => b.ticker === settings.benchmarkTicker) || BENCHMARKS[0]).label;

        // Build benchmark growth series aligned to displayGrowthData
        let mergedGrowthData = displayGrowthData;
        if (settings.benchmarkTicker) {
            const hist = (marketData[settings.benchmarkTicker]?.history || []).slice();
            if (hist.length > 0 && displayGrowthData.length > 0) {
                // Create date->close map for fast lookup
                const closeMap = new Map(hist.map(h => [h.date, h.close]));
                // Determine base price: closest available on or before first display date
                const startIso = displayGrowthData[0].date;
                let basePrice = null;
                // Try exact date, else search backwards in history
                if (closeMap.has(startIso)) basePrice = closeMap.get(startIso);
                if (basePrice == null) {
                    // find latest hist before startIso
                    let candidate = null;
                    for (let i = hist.length - 1; i >= 0; i--) {
                        if (hist[i].date <= startIso) { candidate = hist[i].close; break; }
                    }
                    basePrice = candidate ?? hist[0].close;
                }
                if (basePrice && basePrice > 0) {
                    // Compose merged growth data with benchmark % return
                    mergedGrowthData = displayGrowthData.map(d => {
                        // Find latest close on or before this date
                        let price = closeMap.get(d.date);
                        if (price == null) {
                            // find latest before
                            let p = null;
                            for (let i = hist.length - 1; i >= 0; i--) {
                                if (hist[i].date <= d.date) { p = hist[i].close; break; }
                            }
                            price = p ?? basePrice;
                        }
                        const benchRet = ((price / basePrice) - 1) * 100;
                        return { ...d, benchmark: benchRet };
                    });
                }
            }
        }

        const formatAxisDate = (dateStr) => {
            if (!dateStr) return '';
            // dateStr is "YYYY-MM-DD"
            const [y, m, d] = dateStr.split('-');
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
            const monthName = monthNames[parseInt(m, 10) - 1];
            const day = parseInt(d, 10); // Removes leading zero (01 -> 1)

            // Logic: If range is ALL, show year. If 1M or YTD, hide year.
            if (graphRange === 'ALL') {
                return `${day}. ${monthName} ${y}`;
            } else {
                return `${day}. ${monthName}`;
            }
        };

        // 2. CALCULATE TICKS & YEAR LINES
        // We only show Year Lines if we are in 'ALL' mode or have lots of data
        const showYearLines = graphRange === 'ALL';

        const firstDate = series.length ? series[0].date : null;
        const lastDate = series.length ? series[series.length - 1].date : null;
        const firstYear = firstDate ? parseInt(firstDate.slice(0, 4), 10) : null;
        const lastYear = lastDate ? parseInt(lastDate.slice(0, 4), 10) : null;

        let yearTicks = [];
        if (firstYear != null && lastYear != null) {
            for (let y = firstYear + 1; y <= lastYear; y++) {
                yearTicks.push(`${y}-01-01`);
            }
        }

        // Range Selector Component (always dropdown)
        const RangeSelector = () => {
            // Only show '1M', 'ALL' (as 'altid'), and years
            const baseRanges = ['1M', 'ALL'];
            const options = graphRange === 'CUSTOM' ? ['CUSTOM', ...baseRanges, ...years] : [...baseRanges, ...years];
            const dropdownClass = "px-3 py-1 text-xs font-bold rounded-md bg-gray-100 border border-gray-100";
            return (
                <select
                    className={dropdownClass}
                    value={graphRange}
                    onChange={e => setGraphRange(e.target.value)}
                >
                    {options.map(r => (
                        <option key={r} value={r}>
                            {r === '1M' ? '1M' : r === 'ALL' ? 'Altid' : r === 'CUSTOM' ? 'ZOOM' : r}
                        </option>
                    ))}
                </select>
            );
        };

        const TickerSelector = () => {
            const btnClass = "px-3 py-1 text-xs font-bold rounded-md bg-gray-100 border border-gray-100 flex items-center gap-1";
            const tickers = uniqueTickers;
            const [open, setOpen] = useState(false);
            const [query, setQuery] = useState("");
            const boxRef = React.useRef(null);
            useEffect(() => {
                if (!open) return;
                const onClick = (e) => {
                    if (!boxRef.current) return;
                    if (!boxRef.current.contains(e.target)) setOpen(false);
                };
                window.addEventListener('mousedown', onClick);
                return () => window.removeEventListener('mousedown', onClick);
            }, [open]);

            const selected = selectedTickers;
            const label = selected.length === 0 ? 'Alle' : selected.length === 1 ? selected[0] : `${selected.length} valgt`;
            const filtered = query
                ? tickers.filter(t => t.toLowerCase().includes(query.toLowerCase()))
                : tickers;

            const toggleTicker = (t) => {
                setSelectedTickers(prev => {
                    const has = prev.includes(t);
                    if (has) return prev.filter(x => x !== t);
                    return [...prev, t];
                });
            };

            const clearAll = () => setSelectedTickers([]);

            return (
                <div className="relative" ref={boxRef}>
                    <button type="button" className={btnClass} onClick={() => setOpen(o => !o)} title="Vælg flere tickers">
                        <span>{label}</span>
                        <i className="ph ph-caret-down text-gray-500"></i>
                    </button>
                    {open && (
                        <div className="absolute top-full left-0 mt-1 z-40 w-56 bg-white border border-gray-100 rounded-md shadow-lg">
                            <div className="p-2 border-b border-gray-100">
                                <input
                                    type="text"
                                    className="w-full px-2 py-1 text-xs border border-gray-100 rounded-md"
                                    placeholder="Søg…"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                />
                            </div>
                            <div className="max-h-48 overflow-auto">
                                <button className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2" onClick={clearAll}>
                                    <input type="checkbox" readOnly checked={selected.length === 0} className="rounded" />
                                    <span>Alle</span>
                                </button>
                                {filtered.map((t, i) => (
                                    <button key={t} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2" onClick={() => toggleTicker(t)}>
                                        <input type="checkbox" readOnly checked={selected.includes(t)} className="rounded" />
                                        <span className="flex-1">{t}</span>
                                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>
                                    </button>
                                ))}
                            </div>
                            <div className="p-2 border-t border-gray-100 flex items-center justify-between">
                                <button className="px-2 py-1 text-xs rounded-md border border-gray-100 hover:bg-gray-100" onClick={clearAll}>Nulstil</button>
                                <button className="px-2 py-1 text-xs rounded-md bg-gray-800 text-white hover:bg-gray-700" onClick={() => setOpen(false)}>Færdig</button>
                            </div>
                        </div>
                    )}
                </div>
            );
        };

        // 1. HELPER: Convert Date String (YYYY-MM-DD) to Unix Timestamp (number)
        const toUnix = (dateStr) => new Date(dateStr).getTime();

        // 2. PREPARE DATA: Convert date strings to numbers for the charts
        // We do this here so we don't mess up your original calculation logic
        const numericValueData = displayValueData.map(d => ({ ...d, date: toUnix(d.date) }));
        const numericGrowthData = mergedGrowthData.map(d => ({ ...d, date: toUnix(d.date) }));

        // 3. PREPARE TICKS: Convert your yearTicks to numbers
        const numericYearTicks = yearTicks.map(dateStr => toUnix(dateStr));

        // 3b. Prepare BUY/SELL markers from transactions mapped to chart domains

        // 4. FORMATTER: Handles the timestamp coming from the chart
        const formatAxisDateNumeric = (timestamp) => {
            const date = new Date(timestamp);
            // Convert back to YYYY-MM-DD to reuse your existing logic, or format directly here
            const dateStr = date.toISOString().split('T')[0];
            return formatAxisDate(dateStr);
        };

        const historicalGain = Object.values(calc.reports).reduce((acc, r) => acc + (r.rubrik66 || 0) + (r.rubrik38 || 0) + (r.rubrik345 || 0) + (r.rubrik61 || 0) + (r.rubrik63 || 0) + (r.askGain || 0), 0);
        const allTimeGain = historicalGain + (calc.unrealizedStockGain || 0);

        const currentYearReport = calc.reports[new Date().getFullYear().toString()] || {};

        // --- PREPARE BREAKDOWN DATA ---
        const bd = Object.values(calc.reports).reduce((acc, r) => ({
            stocks: acc.stocks + (r.rubrik66 || 0),
            etfs: acc.etfs + (r.rubrik38 || 0),
            divs: acc.divs + (r.rubrik61 || 0) + (r.rubrik63 || 0),
            capital: acc.capital + (r.rubrik345 || 0),
            ask: acc.ask + (r.askGain || 0),
        }), { stocks: 0, etfs: 0, divs: 0, capital: 0, ask: 0 });

        const liq = calc.liquidation;
        const lifetimeNetInvested = calc.yearlyStats.reduce((sum, y) => sum + (y.flow || 0), 0);

        return (
            <div className="p-6 md:p-8 space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">

                {/* --- VALUE ALLOCATION MODAL --- */}
                {showAllocationModal && (
                    <ModalPortal onBackdropClick={() => setShowAllocationModal(false)}>
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                    <i className="ph ph-wallet text-blue-600"></i> Værdi – Allokering
                                </h3>
                                <button onClick={() => setShowAllocationModal(false)} className="text-gray-400 hover:text-gray-700"><i className="ph ph-x text-lg"></i></button>
                            </div>
                            <div className="p-4 space-y-4">
                                <div className="flex items-center gap-2">
                                    <button className={`px-3 py-1 rounded text-sm border ${allocationMode === 'currency' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-700'}`} onClick={() => setAllocationMode('currency')}>Valuta</button>
                                    <button className={`px-3 py-1 rounded text-sm border ${allocationMode === 'country' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-700'}`} onClick={() => setAllocationMode('country')}>Land</button>
                                    <button className={`px-3 py-1 rounded text-sm border ${allocationMode === 'ticker' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-700'}`} onClick={() => setAllocationMode('ticker')}>Ticker</button>
                                </div>

                                {(() => {
                                    const mapCurrencyToCountry = (cur) => {
                                        const C = (cur || '').toUpperCase();
                                        if (C === 'DKK') return 'Danmark';
                                        if (C === 'USD') return 'USA';
                                        if (C === 'EUR') return 'Eurozone';
                                        if (C === 'GBP') return 'Storbritannien';
                                        if (C === 'SEK') return 'Sverige';
                                        if (C === 'NOK') return 'Norge';
                                        return C || 'Ukendt';
                                    };

                                    // Build allocation map
                                    const alloc = new Map();
                                    let total = 0;
                                    Object.values(calc.portfolio).forEach(p => {
                                        if (Math.abs(p.qty) < 0.01) return;
                                        const val = getPositionValue(p);
                                        total += val;
                                        let key = '';
                                        if (allocationMode === 'currency') key = p.cur || 'DKK';
                                        else if (allocationMode === 'country') key = mapCurrencyToCountry(p.cur);
                                        else key = p.ticker;
                                        alloc.set(key, (alloc.get(key) || 0) + val);
                                    });

                                    const items = Array.from(alloc.entries()).map(([label, val]) => ({ label, val })).sort((a, b) => b.val - a.val);

                                    if (items.length === 0) {
                                        return <div className="text-center text-gray-400 italic py-8">Ingen aktive beholdninger.</div>;
                                    }

                                    return (
                                        <div className="space-y-3">
                                            {items.map((it, i) => {
                                                const pct = total > 0 ? (it.val / total) * 100 : 0;
                                                return (
                                                    <div key={i} className="space-y-1">
                                                        <div className="flex justify-between text-sm">
                                                            <span className="text-gray-700 font-medium">{it.label}</span>
                                                            <span className="font-mono text-gray-900">{formatCurrencyNoDecimals(it.val)} ({pct.toFixed(1)}%)</span>
                                                        </div>
                                                        <div className="h-2 bg-gray-100 rounded overflow-hidden">
                                                            <div className="h-full bg-blue-500" style={{ width: `${pct.toFixed(1)}%` }}></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </ModalPortal>
                )}

                {/* --- NEW: LIQUIDATION MODAL (Using Structured Breakdown) --- */}
                {showLiquidationModal && (
                    <ModalPortal onBackdropClick={() => setShowLiquidationModal(false)}>
                        <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                    <i className="ph ph-money text-emerald-600"></i> Likvidationsværdi
                                </h3>
                                <button onClick={() => setShowLiquidationModal(false)} className="text-gray-400 hover:text-gray-700"><i className="ph ph-x text-lg"></i></button>
                            </div>

                            <div className="p-4 space-y-4">
                                {/* 1. Net Cash Result */}
                                <div className="text-center p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                                    <div className="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-1">Netto Udbetaling (Estimat)</div>
                                    <div className="text-3xl font-bold text-emerald-700 tracking-tight">
                                        {formatCurrencyNoDecimals(liq.netResult)}
                                    </div>
                                    <div className="text-[10px] text-emerald-600 mt-1">
                                        Værdi i dag minus estimeret restskat
                                    </div>
                                </div>

                                {/* 2. Tax Breakdown List */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase border-b border-gray-100 pb-1 mb-2">Skatteomkostninger</h4>

                                    {liq.taxBreakdown.map((item, i) => (
                                        <div key={i} className="flex justify-between items-center text-sm group">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.bg} ${item.color}`}>
                                                    <i className={`ph ${item.icon}`}></i>
                                                </div>
                                                <span className={`text-gray-700 ${item.italic ? 'italic text-gray-500' : ''}`}>{item.label}</span>
                                            </div>
                                            <span className="font-mono font-medium text-gray-900">
                                                -{formatCurrencyNoDecimals(item.val)}
                                            </span>
                                        </div>
                                    ))}

                                    <div className="border-t border-gray-200 mt-4 pt-3 flex justify-between items-center">
                                        <span className="font-bold text-gray-900">Total Skattebyrde</span>
                                        <span className="font-bold text-lg text-red-600 font-mono">
                                            -{formatCurrencyNoDecimals(liq.totalTaxBurden)}
                                        </span>
                                    </div>
                                </div>

                                {/* 3. Metrics */}
                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <div className="bg-gray-50 p-2 rounded border border-gray-100">
                                        <div className="text-[10px] text-gray-500 uppercase">Effektiv Skat</div>
                                        <div className="text-lg font-bold text-gray-800">{liq.effectiveTaxRate.toFixed(1)}%</div>
                                    </div>
                                    <div className="bg-gray-50 p-2 rounded border border-gray-100">
                                        <div className="text-[10px] text-gray-500 uppercase">Netto Indskud</div>
                                        <div className="text-lg font-bold text-gray-800" title="Total indsat minus total hævet">
                                            {formatCurrencyNoDecimals(liq.lifetimeNetInvested)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ModalPortal>
                )}

                {/* --- BREAKDOWN MODAL --- */}
                {showGainModal && (
                    <ModalPortal onBackdropClick={() => setShowGainModal(false)}>
                        <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                    <i className="ph ph-chart-pie-slice text-blue-600"></i> Gevinstfordeling
                                </h3>
                                <button onClick={() => setShowGainModal(false)} className="text-gray-400 hover:text-gray-700"><i className="ph ph-x text-lg"></i></button>
                            </div>
                            <div className="p-4 space-y-3">
                                {[
                                    { label: 'Realiseret Aktiegevinst', val: bd.stocks, icon: 'ph-trend-up', color: 'text-blue-600', bg: 'bg-blue-50' },
                                    { label: 'Lagerbeskattet (ETF)', val: bd.etfs, icon: 'ph-buildings', color: 'text-purple-600', bg: 'bg-purple-50' },
                                    { label: 'Udbytter', val: bd.divs, icon: 'ph-coins', color: 'text-green-600', bg: 'bg-green-50' },
                                    { label: 'Kapitalindkomst', val: bd.capital, icon: 'ph-bank', color: 'text-orange-600', bg: 'bg-orange-50' },
                                    { label: 'Aktiesparekonto', val: bd.ask, icon: 'ph-piggy-bank', color: 'text-teal-600', bg: 'bg-teal-50' },
                                    { label: 'Urealiseret (Aktier)', val: calc.unrealizedStockGain, icon: 'ph-hourglass', color: 'text-gray-600', bg: 'bg-gray-100', italic: true }
                                ].map((item, i) => (
                                    <div key={i} className="flex justify-between items-center text-sm group">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.bg} ${item.color}`}>
                                                <i className={`ph ${item.icon}`}></i>
                                            </div>
                                            <span className={`text-gray-700 ${item.italic ? 'italic text-gray-500' : ''}`}>{item.label}</span>
                                        </div>
                                        <span className={`font-mono font-medium ${item.val >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                                            {formatCurrencyNoDecimals(item.val)}
                                        </span>
                                    </div>
                                ))}
                                <div className="border-t border-gray-200 mt-4 pt-3 flex justify-between items-center">
                                    <span className="font-bold text-gray-900">Total</span>
                                    <span className={`font-bold text-lg ${allTimeGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {formatCurrencyNoDecimals(allTimeGain)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </ModalPortal>
                )}

                {/* --- FULLSCREEN CHART MODAL --- */}
                {fullscreenChart && (
                    <ModalPortal onBackdropClick={() => setFullscreenChart(null)} backdropClassName="fixed inset-0 z-50 flex items-center justify-center p-0 bg-black/60">
                        <div className="w-screen h-screen bg-white flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="h-12 px-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                                <div className="flex items-center gap-2">
                                    <i className="ph ph-arrows-in text-blue-600"></i>
                                    <span className="font-bold text-sm text-gray-800">{fullscreenChart === 'growth' ? 'Afkast (%)' : 'Porteføljens Værdi'}</span>
                                    {fullscreenChart === 'growth' && (!isMulti && settings.benchmarkTicker) && (() => {
                                        const last = numericGrowthData[numericGrowthData.length - 1];
                                        const diff = (last?.value ?? 0) - (last?.benchmark ?? 0);
                                        if (!isFinite(diff)) return null;
                                        return (
                                            <span className={`ml-2 text-xs font-mono px-2 py-0.5 rounded ${diff >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>vs {benchLabel}: {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%</span>
                                        );
                                    })()}
                                </div>
                                <div className="flex items-center gap-2">
                                    <RangeSelector />
                                    <TickerSelector />
                                    {/* Benchmark Selector */}
                                    <select
                                        className="px-3 py-1 text-xs font-bold rounded-md bg-gray-100 border border-gray-200"
                                        value={settings.benchmarkTicker}
                                        onChange={e => { setSettings(s => ({ ...s, benchmarkTicker: e.target.value })); fetchMarketData(true); }}
                                    >
                                        {BENCHMARKS.map(b => (<option key={b.ticker} value={b.ticker}>{b.label}</option>))}
                                    </select>
                                    <button className="px-2 py-1 text-xs rounded-md border border-gray-200 hover:bg-gray-100" onClick={() => setFullscreenChart(null)}>Luk</button>
                                </div>
                            </div>
                            <div className={`flex-1 relative ${chartSelection.dragging ? 'select-none' : ''}`}>
                                <ResponsiveContainer key={`${winSize.w}x${winSize.h}`} width="100%" height="100%">
                                    {fullscreenChart === 'growth' ? (
                                        <AreaChart data={numericGrowthData}
                                            onMouseDown={(e) => { const se = e && e.sourceEvent; if (se && se.preventDefault) se.preventDefault(); if (e && e.activeLabel != null) setChartSelection({ start: e.activeLabel, end: null, chart: 'growth', dragging: true }); }}
                                            onMouseMove={(e) => { if (chartSelection.dragging && chartSelection.chart === 'growth' && e && e.activeLabel != null) setChartSelection(s => ({ ...s, end: e.activeLabel })); }}
                                            onMouseUp={() => { if (chartSelection.dragging && chartSelection.chart === 'growth' && chartSelection.start != null && chartSelection.end != null) setChartSelection(s => ({ ...s, dragging: false })); else setChartSelection({ start: null, end: null, chart: null, dragging: false }); }}
                                            onMouseLeave={() => { setChartSelection(s => s.dragging ? (s.start != null && s.end != null) ? { ...s, dragging: false } : { start: null, end: null, chart: null, dragging: false } : s); }}
                                        >
                                            <defs>
                                                <linearGradient id="colorGrowthFs" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                            <XAxis dataKey="date" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatAxisDateNumeric} ticks={graphRange === 'ALL' ? numericYearTicks : null} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} minTickGap={30} />
                                            <YAxis width={60} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                                            <Tooltip formatter={(v) => `${v.toFixed(2)}%`} labelFormatter={formatAxisDateNumeric} />
                                            <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="3 3" />
                                            {showYearLines && numericYearTicks.map(timestamp => (<ReferenceLine key={timestamp} x={timestamp} stroke="#e5e7eb" />))}
                                            {(chartSelection.chart === 'growth' && chartSelection.start != null && chartSelection.end != null && !isMulti) && (
                                                <ReferenceArea x1={Math.min(chartSelection.start, chartSelection.end)} x2={Math.max(chartSelection.start, chartSelection.end)} strokeOpacity={0.1} fill="#10b981" fillOpacity={0.1} />
                                            )}
                                            {isMulti
                                                ? sel.map((t, i) => (
                                                    <Area key={`gfs-${t}`} type="monotone" dataKey={t} stroke={COLORS[i % COLORS.length]} strokeWidth={1} fill="none" isAnimationActive={false} />
                                                ))
                                                : <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={1} fill="url(#colorGrowthFs)" isAnimationActive={false} />}
                                            {(!isMulti && settings.benchmarkTicker) && (
                                                <Area type="monotone" dataKey="benchmark" stroke="#f59e0b" strokeWidth={1} fill="none" isAnimationActive={false} />
                                            )}
                                            {/* Buy/Sell markers (fullscreen) */}
                                        </AreaChart>
                                    ) : (
                                        <AreaChart data={numericValueData}
                                            onMouseDown={(e) => { const se = e && e.sourceEvent; if (se && se.preventDefault) se.preventDefault(); if (e && e.activeLabel != null) setChartSelection({ start: e.activeLabel, end: null, chart: 'value', dragging: true }); }}
                                            onMouseMove={(e) => { if (chartSelection.dragging && chartSelection.chart === 'value' && e && e.activeLabel != null) setChartSelection(s => ({ ...s, end: e.activeLabel })); }}
                                            onMouseUp={() => { if (chartSelection.dragging && chartSelection.chart === 'value' && chartSelection.start != null && chartSelection.end != null) setChartSelection(s => ({ ...s, dragging: false })); else setChartSelection({ start: null, end: null, chart: null, dragging: false }); }}
                                            onMouseLeave={() => { setChartSelection(s => s.dragging ? (s.start != null && s.end != null) ? { ...s, dragging: false } : { start: null, end: null, chart: null, dragging: false } : s); }}
                                        >
                                            <defs>
                                                <linearGradient id="colorValFs" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                            <XAxis dataKey="date" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatAxisDateNumeric} ticks={graphRange === 'ALL' ? numericYearTicks : null} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} minTickGap={30} />
                                            <YAxis width={60} axisLine={false} tickLine={false} domain={['dataMin', 'dataMax']} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                                            <Tooltip formatter={(v) => formatCurrency(v)} labelFormatter={formatAxisDateNumeric} />
                                            {showYearLines && numericYearTicks.map(timestamp => (<ReferenceLine key={timestamp} x={timestamp} stroke="#e5e7eb" />))}
                                            {(chartSelection.chart === 'value' && chartSelection.start != null && chartSelection.end != null && !isMulti) && (
                                                <ReferenceArea x1={Math.min(chartSelection.start, chartSelection.end)} x2={Math.max(chartSelection.start, chartSelection.end)} strokeOpacity={0.1} fill="#2563eb" fillOpacity={0.1} />
                                            )}
                                            {isMulti
                                                ? sel.map((t, i) => (
                                                    <Area key={`vfs-${t}`} type="monotone" dataKey={t} stroke={COLORS[i % COLORS.length]} strokeWidth={1} fill="none" isAnimationActive={false} />
                                                ))
                                                : <>
                                                    <Area type="step" dataKey="invested" stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 4" fill="none" isAnimationActive={false} />
                                                    <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={1} fill="url(#colorValFs)" isAnimationActive={false} />
                                                </>}
                                            {/* Buy/Sell markers (fullscreen) */}
                                        </AreaChart>
                                    )}
                                </ResponsiveContainer>
                                {/* Selection overlay in fullscreen */}
                                {fullscreenChart === 'growth' && chartSelection.chart === 'growth' && chartSelection.start != null && chartSelection.end != null && !isMulti && (() => {
                                    const startTs = Math.min(chartSelection.start, chartSelection.end);
                                    const endTs = Math.max(chartSelection.start, chartSelection.end);
                                    const inRange = numericGrowthData.filter(d => d.date >= startTs && d.date <= endTs);
                                    if (inRange.length < 2) return null;
                                    const startVal = inRange[0].value;
                                    const endVal = inRange[inRange.length - 1].value;
                                    const abs = endVal - startVal;
                                    return (
                                        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur rounded-md border border-gray-200 shadow-sm px-3 py-2 flex items-center gap-2">
                                            <div className={`text-sm font-mono ${abs >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{abs >= 0 ? '+' : ''}{abs.toFixed(2)}%</div>
                                            <button className="text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-100" onClick={() => {
                                                const toIso = (ts) => new Date(ts).toISOString().split('T')[0];
                                                setCustomRange({ startIso: toIso(startTs), endIso: toIso(endTs) });
                                                setGraphRange('CUSTOM');
                                                setChartSelection({ start: null, end: null, chart: null, dragging: false });
                                            }}>Zoom ind</button>
                                            <button className="text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-100" onClick={() => setChartSelection({ start: null, end: null, chart: null, dragging: false })}>Ryd</button>
                                        </div>
                                    );
                                })()}
                                {fullscreenChart === 'value' && chartSelection.chart === 'value' && chartSelection.start != null && chartSelection.end != null && !isMulti && (() => {
                                    const startTs = Math.min(chartSelection.start, chartSelection.end);
                                    const endTs = Math.max(chartSelection.start, chartSelection.end);
                                    const inRange = numericValueData.filter(d => d.date >= startTs && d.date <= endTs);
                                    if (inRange.length < 2) return null;
                                    const startVal = inRange[0].value;
                                    const endVal = inRange[inRange.length - 1].value;
                                    const abs = endVal - startVal;
                                    const pct = startVal > 0 ? (abs / startVal) * 100 : 0;
                                    return (
                                        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur rounded-md border border-gray-200 shadow-sm px-3 py-2 flex items-center gap-2">
                                            <div className={`text-sm font-mono ${abs >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{abs >= 0 ? '+' : ''}{formatCurrencyNoDecimals(abs)}</div>
                                            <div className={`text-xs font-mono ${pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>({pct.toFixed(2)}%)</div>
                                            <button className="text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-100" onClick={() => {
                                                const toIso = (ts) => new Date(ts).toISOString().split('T')[0];
                                                setCustomRange({ startIso: toIso(startTs), endIso: toIso(endTs) });
                                                setGraphRange('CUSTOM');
                                                setChartSelection({ start: null, end: null, chart: null, dragging: false });
                                            }}>Zoom ind</button>
                                            <button className="text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-100" onClick={() => setChartSelection({ start: null, end: null, chart: null, dragging: false })}>Ryd</button>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </ModalPortal>
                )}

                {/* 1. TOP CARDS */}
                <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-6">
                    {/* Value */}
                    <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm flex flex-col justify-between min-w-0 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group" onClick={() => setShowAllocationModal(true)}>
                        <div className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                            <i className="ph ph-wallet"></i>Værdi
                        </div>
                        <div className="mt-2">
                            <div className="text-3xl font-bold text-gray-900 tracking-tight break-words" style={{ wordBreak: 'break-word' }}>{formatCurrencyNoDecimals(calc.currentVal)}</div>
                        </div>
                    </div>
                    {/* Liquidation */}
                    <div
                        onClick={() => setShowLiquidationModal(true)}
                        className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm flex flex-col justify-between min-w-0 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group"
                    >
                        <div className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                            <i className="ph ph-bank"></i>Værdi efter skat
                        </div>
                        <div className="mt-2 flex justify-between items-end">
                            <div className="text-3xl font-bold text-gray-900 tracking-tight break-words">
                                {formatCurrencyNoDecimals(calc.currentVal - calc.currentTax)}
                            </div>
                        </div>
                    </div>
                    {/* All Time Gain */}
                    <div
                        onClick={() => setShowGainModal(true)}
                        className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm flex flex-col justify-between min-w-0 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group relative"
                    >
                        <div className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                            <i className="ph ph-trend-up"></i>Samlet gevinst
                        </div>
                        <div className="mt-2 flex justify-between items-end">
                            <div className={`text-3xl font-bold tracking-tight ${allTimeGain >= 0 ? 'text-emerald-600' : 'text-rose-600'} break-words`} style={{ wordBreak: 'break-word' }}>
                                {formatCurrencyNoDecimals(allTimeGain)}
                            </div>
                        </div>
                    </div>
                    {/* Today's Increase */}
                    <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm flex flex-col justify-between min-w-0 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group" onClick={() => setShowMoversModal(true)}>
                        {/* --- MOVERS MODAL --- */}
                        {showMoversModal && (
                            <ModalPortal onBackdropClick={() => setShowMoversModal(false)}>
                                <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                            <i className="ph ph-arrow-up-right text-blue-600"></i> Top 3 bevægelser i dag
                                        </h3>
                                        <button onClick={() => setShowMoversModal(false)} className="text-gray-400 hover:text-gray-700"><i className="ph ph-x text-lg"></i></button>
                                    </div>
                                    <div className="p-4 space-y-3">
                                        {(() => {
                                            if (!calc.portfolio || !marketData) return <div className="text-center text-gray-400 italic py-8">Ingen aktive bevægelser i dag.</div>;
                                            const now = new Date();
                                            // Merge tickers from different accounts by summing their values
                                            const tickerMap = {};
                                            Object.values(calc.portfolio).forEach(p => {
                                                const m = marketData[p.ticker] || {};
                                                const lastTrade = new Date((m.lastTradeTime || 0) * 1000);
                                                const isToday = lastTrade.getDate() === now.getDate() &&
                                                    lastTrade.getMonth() === now.getMonth() &&
                                                    lastTrade.getFullYear() === now.getFullYear();
                                                if (!isToday) return;
                                                const { val, prevVal, price, prevClose, fxRate } = getPositionValueWithPrev(p);
                                                const absMove = val - prevVal;
                                                const pctMove = prevVal > 0 ? (absMove / prevVal) * 100 : 0;
                                                if (!tickerMap[p.ticker]) {
                                                    tickerMap[p.ticker] = {
                                                        ticker: p.ticker,
                                                        absMove: 0,
                                                        val: 0,
                                                        prevVal: 0,
                                                        price,
                                                        prevClose,
                                                        fxRate,
                                                        totalPctMove: 0,
                                                        totalPrevVal: 0
                                                    };
                                                }
                                                tickerMap[p.ticker].absMove += absMove;
                                                tickerMap[p.ticker].val += val;
                                                tickerMap[p.ticker].prevVal += prevVal;
                                                tickerMap[p.ticker].totalPrevVal += prevVal;
                                            });
                                            // Calculate pctMove for each merged ticker
                                            Object.values(tickerMap).forEach(t => {
                                                t.pctMove = t.totalPrevVal > 0 ? (t.absMove / t.totalPrevVal) * 100 : 0;
                                            });
                                            const movers = Object.values(tickerMap)
                                                .sort((a, b) => Math.abs(b.absMove) - Math.abs(a.absMove))
                                                .slice(0, 3);
                                            if (movers.length === 0) return <div className="text-center text-gray-400 italic py-8">Ingen aktive bevægelser i dag.</div>;
                                            return movers.map(m => (
                                                <div key={m.ticker} className="flex justify-between items-center border-b last:border-0 border-gray-100 py-2">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-gray-800 text-lg">{m.ticker}</span>
                                                        <span className="text-xs text-gray-500">{formatCurrencyNoDecimals(m.absMove)} ({m.pctMove >= 0 ? '+' : ''}{m.pctMove.toFixed(2)}%)</span>
                                                    </div>
                                                    <div className={`font-mono font-bold text-right ${m.absMove >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrencyNoDecimals(m.absMove)}</div>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                </div>
                            </ModalPortal>
                        )}
                        <div className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                            <i className="ph ph-arrow-up-right"></i>Gevinst/Tab i dag
                        </div>
                        <div className="mt-2">
                            {(() => {
                                let todayGain = 0;
                                let todayPct = 0;
                                let activeCount = 0; // To track if anything is open

                                if (calc.portfolio && marketData) {
                                    let totalVal = 0;
                                    let totalPrevVal = 0;
                                    const now = new Date();

                                    Object.values(calc.portfolio).forEach(p => {
                                        const m = marketData[p.ticker] || {};

                                        // 1. Check if active today
                                        const lastTrade = new Date((m.lastTradeTime || 0) * 1000);
                                        const isToday = lastTrade.getDate() === now.getDate() &&
                                            lastTrade.getMonth() === now.getMonth() &&
                                            lastTrade.getFullYear() === now.getFullYear();

                                        // 2. Only calculate if active today (or if we have no data, skip)
                                        if (isToday) {
                                            activeCount++;
                                            const { val, prevVal } = getPositionValueWithPrev(p);

                                            totalVal += val;
                                            totalPrevVal += prevVal;
                                        }
                                    });

                                    if (activeCount > 0) {
                                        todayGain = totalVal - totalPrevVal;
                                        todayPct = totalPrevVal > 0 ? (todayGain / totalPrevVal) * 100 : 0;
                                    }
                                }

                                return (
                                    <>
                                        <div className={`text-3xl font-bold tracking-tight ${activeCount === 0 ? 'text-gray-400' : (todayGain >= 0 ? 'text-emerald-600' : 'text-rose-600')} break-words`} style={{ wordBreak: 'break-word' }}>
                                            {activeCount > 0 ? formatCurrencyNoDecimals(todayGain) : "0 kr."}
                                            <span className={`text-lg font-bold ml-2 align-middle ${activeCount === 0 ? 'text-gray-400' : (todayPct >= 0 ? 'text-emerald-600' : 'text-rose-600')}`}>
                                                {activeCount > 0 ? `${todayPct.toFixed(2)}%` : ""}
                                            </span>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>

                {/* Performance by Year: Above graphs on small screens, right of graphs on large screens */}
                <div className="block lg:hidden mt-8">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-gray-50">
                            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Afkast pr. år</h3>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {calc.yearlyStats.map(stat => (
                                <div key={stat.year} className="p-4 hover:bg-gray-50 transition-colors">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-bold text-gray-900 text-lg">{stat.year}</span>
                                        <span className={`font-bold text-lg ${stat.return >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{stat.return > 0 ? '+' : ''}{stat.return.toFixed(2)}%</span>
                                    </div>
                                    {/* Gain Row */}
                                    <div className="flex justify-between items-center text-xs text-gray-500 mb-1">
                                        <span>Gevinst/Tab</span>
                                        <span className={`font-mono font-medium ${stat.gainAbs >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{stat.gainAbs > 0 ? '+' : ''}{formatCurrencyNoDecimals(stat.gainAbs)}</span>
                                    </div>
                                    {/* Flow Row */}
                                    <div className="flex justify-between items-center text-xs text-gray-500">
                                        <span>Kapitalstrøm</span>
                                        <span className="font-mono font-medium cursor-help border-b border-dotted border-gray-300" title={`In: ${formatCurrencyNoDecimals(stat.breakdown.in)}\nOut: ${formatCurrencyNoDecimals(stat.breakdown.out)}`}>{stat.flow > 0 ? '+' : ''}{formatCurrencyNoDecimals(stat.flow)}</span>
                                    </div>
                                </div>
                            ))}
                            {calc.yearlyStats.length === 0 && (
                                <div className="p-8 text-center text-gray-400 italic">Ingen data tilgængelig</div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* LEFT: GRAPHS */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* GROWTH GRAPH */}
                        <div className="bg-white p-4 rounded-xl shadow-sm">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-gray-800 text-sm uppercase">Afkast (%)</h3>
                                <div className="flex items-center gap-2">
                                    <RangeSelector />
                                    <TickerSelector />
                                    {/* Benchmark Selector */}
                                    <select
                                        className="px-3 py-1 text-xs font-bold rounded-md bg-gray-100 border border-gray-200"
                                        value={settings.benchmarkTicker}
                                        onChange={e => { setSettings(s => ({ ...s, benchmarkTicker: e.target.value })); fetchMarketData(true); }}
                                    >
                                        {BENCHMARKS.map(b => (<option key={b.ticker} value={b.ticker}>{b.label}</option>))}
                                    </select>
                                    {(!isMulti && settings.benchmarkTicker) && (() => {
                                        const last = numericGrowthData[numericGrowthData.length - 1];
                                        const diff = (last?.value ?? 0) - (last?.benchmark ?? 0);
                                        if (!isFinite(diff)) return null;
                                        return (
                                            <span className={`text-xs font-mono px-2 py-0.5 rounded ${diff >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>vs {benchLabel}: {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%</span>
                                        );
                                    })()}
                                    <button title="Fuld skærm"
                                        className="px-2 py-1 text-xs rounded-md border border-gray-200 hover:bg-gray-100"
                                        onClick={() => setFullscreenChart('growth')}
                                    >
                                        <i className="ph ph-arrows-out"></i>
                                    </button>
                                </div>
                            </div>
                            <div className={`relative h-64 w-full ${chartSelection.dragging ? 'select-none' : ''}`}>
                                <ResponsiveContainer width="100%" height="100%">
                                    {/* Use numericGrowthData */}
                                    <AreaChart data={numericGrowthData}
                                        onMouseDown={(e) => {
                                            const se = e && e.sourceEvent; if (se && se.preventDefault) se.preventDefault();
                                            if (e && e.activeLabel != null) {
                                                setChartSelection({ start: e.activeLabel, end: null, chart: 'growth', dragging: true });
                                            }
                                        }}
                                        onMouseMove={(e) => {
                                            if (chartSelection.dragging && chartSelection.chart === 'growth' && e && e.activeLabel != null) {
                                                setChartSelection(s => ({ ...s, end: e.activeLabel }));
                                            }
                                        }}
                                        onMouseUp={() => {
                                            if (chartSelection.dragging && chartSelection.chart === 'growth' && chartSelection.start != null && chartSelection.end != null) {
                                                setChartSelection(s => ({ ...s, dragging: false }));
                                            } else {
                                                setChartSelection({ start: null, end: null, chart: null, dragging: false });
                                            }
                                        }}
                                        onMouseLeave={() => {
                                            setChartSelection(s => s.dragging
                                                ? (s.start != null && s.end != null) ? { ...s, dragging: false } : { start: null, end: null, chart: null, dragging: false }
                                                : s);
                                        }}
                                    >
                                        <defs>
                                            <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />

                                        {/* XAXIS */}
                                        <XAxis
                                            dataKey="date"
                                            type="number"
                                            domain={['dataMin', 'dataMax']}
                                            tickFormatter={formatAxisDateNumeric}
                                            ticks={graphRange === 'ALL' ? numericYearTicks : null}
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fontSize: 10, fill: '#9ca3af' }}
                                            minTickGap={30}
                                        />

                                        <YAxis width={45} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: '#9ca3af' }} />

                                        {/* TOOLTIP */}
                                        <Tooltip formatter={(v) => `${v.toFixed(2)}%`} labelFormatter={formatAxisDateNumeric} />

                                        <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="3 3" />

                                        {/* REFERENCE LINES */}
                                        {showYearLines && numericYearTicks.map(timestamp => (
                                            <ReferenceLine key={timestamp} x={timestamp} stroke="#e5e7eb" />
                                        ))}

                                        {/* Selection area */}
                                        {(chartSelection.chart === 'growth' && chartSelection.start != null && chartSelection.end != null && !isMulti) && (
                                            <ReferenceArea x1={Math.min(chartSelection.start, chartSelection.end)} x2={Math.max(chartSelection.start, chartSelection.end)} strokeOpacity={0.1} fill="#10b981" fillOpacity={0.1} />
                                        )}
                                        {isMulti
                                            ? sel.map((t, i) => (
                                                <Area key={`g-${t}`} type="monotone" dataKey={t} stroke={COLORS[i % COLORS.length]} strokeWidth={1} fill="none" isAnimationActive={false} />
                                            ))
                                            : <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={1} fill="url(#colorGrowth)" isAnimationActive={false} />}
                                        {(!isMulti && settings.benchmarkTicker) && (
                                            <Area type="monotone" dataKey="benchmark" stroke="#f59e0b" strokeWidth={1} fill="none" isAnimationActive={false} />
                                        )}
                                    </AreaChart>
                                </ResponsiveContainer>
                                {/* Selection overlay */}
                                {(chartSelection.chart === 'growth' && chartSelection.start != null && chartSelection.end != null && !isMulti) && (() => {
                                    const startTs = Math.min(chartSelection.start, chartSelection.end);
                                    const endTs = Math.max(chartSelection.start, chartSelection.end);
                                    const inRange = numericGrowthData.filter(d => d.date >= startTs && d.date <= endTs);
                                    if (inRange.length < 2) return null;
                                    const startVal = inRange[0].value;
                                    const endVal = inRange[inRange.length - 1].value;
                                    const abs = endVal - startVal;
                                    return (
                                        <div className="absolute top-2 right-2 bg-white/95 backdrop-blur rounded-md border border-gray-200 shadow-sm px-3 py-2 flex items-center gap-2">
                                            <div className={`text-sm font-mono ${abs >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{abs >= 0 ? '+' : ''}{abs.toFixed(2)}%</div>
                                            <button className="text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-100" onClick={() => {
                                                const toIso = (ts) => new Date(ts).toISOString().split('T')[0];
                                                setCustomRange({ startIso: toIso(startTs), endIso: toIso(endTs) });
                                                setGraphRange('CUSTOM');
                                                setChartSelection({ start: null, end: null, chart: null, dragging: false });
                                            }}>Zoom ind</button>
                                            <button className="text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-100" onClick={() => setChartSelection({ start: null, end: null, chart: null, dragging: false })}>Ryd</button>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* VALUE GRAPH */}
                        <div className="bg-white p-4 rounded-xl shadow-sm">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-gray-800 text-sm uppercase">Porteføljens Værdi</h3>
                                <div className="flex items-center gap-2">
                                    <RangeSelector />
                                    <TickerSelector />
                                    <button title="Fuld skærm"
                                        className="px-2 py-1 text-xs rounded-md border border-gray-200 hover:bg-gray-100"
                                        onClick={() => setFullscreenChart('value')}
                                    >
                                        <i className="ph ph-arrows-out"></i>
                                    </button>
                                </div>
                            </div>
                            <div className={`relative h-64 w-full ${chartSelection.dragging ? 'select-none' : ''}`}>
                                <ResponsiveContainer width="100%" height="100%">
                                    {/* Use numericValueData */}
                                    <AreaChart data={numericValueData}
                                        onMouseDown={(e) => {
                                            const se = e && e.sourceEvent; if (se && se.preventDefault) se.preventDefault();
                                            if (e && e.activeLabel != null) {
                                                setChartSelection({ start: e.activeLabel, end: null, chart: 'value', dragging: true });
                                            }
                                        }}
                                        onMouseMove={(e) => {
                                            if (chartSelection.dragging && chartSelection.chart === 'value' && e && e.activeLabel != null) {
                                                setChartSelection(s => ({ ...s, end: e.activeLabel }));
                                            }
                                        }}
                                        onMouseUp={() => {
                                            if (chartSelection.dragging && chartSelection.chart === 'value' && chartSelection.start != null && chartSelection.end != null) {
                                                setChartSelection(s => ({ ...s, dragging: false }));
                                            } else {
                                                setChartSelection({ start: null, end: null, chart: null, dragging: false });
                                            }
                                        }}
                                        onMouseLeave={() => {
                                            setChartSelection(s => s.dragging
                                                ? (s.start != null && s.end != null) ? { ...s, dragging: false } : { start: null, end: null, chart: null, dragging: false }
                                                : s);
                                        }}
                                    >
                                        <defs>
                                            <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />

                                        {/* XAXIS */}
                                        <XAxis
                                            dataKey="date"
                                            type="number"
                                            domain={['dataMin', 'dataMax']}
                                            tickFormatter={formatAxisDateNumeric}
                                            ticks={graphRange === 'ALL' ? numericYearTicks : null}
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fontSize: 10, fill: '#9ca3af' }}
                                            minTickGap={30}
                                        />

                                        <YAxis width={45} axisLine={false} tickLine={false} domain={['dataMin', 'dataMax']} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#9ca3af' }} />

                                        {/* TOOLTIP */}
                                        <Tooltip formatter={(v) => formatCurrency(v)} labelFormatter={formatAxisDateNumeric} />

                                        {/* REFERENCE LINES */}
                                        {showYearLines && numericYearTicks.map(timestamp => (
                                            <ReferenceLine key={timestamp} x={timestamp} stroke="#e5e7eb" />
                                        ))}
                                        {/* Selection area */}
                                        {(chartSelection.chart === 'value' && chartSelection.start != null && chartSelection.end != null && !isMulti) && (
                                            <ReferenceArea x1={Math.min(chartSelection.start, chartSelection.end)} x2={Math.max(chartSelection.start, chartSelection.end)} strokeOpacity={0.1} fill="#2563eb" fillOpacity={0.1} />
                                        )}
                                        {isMulti
                                            ? sel.map((t, i) => (
                                                <Area key={`v-${t}`} type="monotone" dataKey={t} stroke={COLORS[i % COLORS.length]} strokeWidth={1} fill="none" isAnimationActive={false} />
                                            ))
                                            : <>
                                                <Area
                                                    type="step"
                                                    dataKey="invested"
                                                    stroke="#9ca3af"
                                                    strokeWidth={1}
                                                    strokeDasharray="4 4"
                                                    fill="none"
                                                    isAnimationActive={false}
                                                />
                                                <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={1} fill="url(#colorVal)" isAnimationActive={false} />
                                            </>}
                                        {/* Buy/Sell markers */}
                                    </AreaChart>
                                </ResponsiveContainer>
                                {/* Selection overlay */}
                                {(chartSelection.chart === 'value' && chartSelection.start != null && chartSelection.end != null && !isMulti) && (() => {
                                    const startTs = Math.min(chartSelection.start, chartSelection.end);
                                    const endTs = Math.max(chartSelection.start, chartSelection.end);
                                    const inRange = numericValueData.filter(d => d.date >= startTs && d.date <= endTs);
                                    if (inRange.length < 2) return null;
                                    const startVal = inRange[0].value;
                                    const endVal = inRange[inRange.length - 1].value;
                                    const abs = endVal - startVal;
                                    const pct = startVal > 0 ? (abs / startVal) * 100 : 0;
                                    return (
                                        <div className="absolute top-2 right-2 bg-white/95 backdrop-blur rounded-md border border-gray-200 shadow-sm px-3 py-2 flex items-center gap-2">
                                            <div className={`text-sm font-mono ${abs >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{abs >= 0 ? '+' : ''}{formatCurrencyNoDecimals(abs)}</div>
                                            <div className={`text-xs font-mono ${pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>({pct.toFixed(2)}%)</div>
                                            <button className="text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-100" onClick={() => {
                                                const toIso = (ts) => new Date(ts).toISOString().split('T')[0];
                                                setCustomRange({ startIso: toIso(startTs), endIso: toIso(endTs) });
                                                setGraphRange('CUSTOM');
                                                setChartSelection({ start: null, end: null, chart: null, dragging: false });
                                            }}>Zoom ind</button>
                                            <button className="text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-100" onClick={() => setChartSelection({ start: null, end: null, chart: null, dragging: false })}>Ryd</button>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>


                    </div>
                    {/* RIGHT: STATS TABLE (only on large screens) */}
                    <div className="hidden lg:block">
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden sticky top-6">
                            <div className="p-4 border-b border-gray-100 bg-gray-50">
                                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Afkast pr. år</h3>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {calc.yearlyStats.map(stat => (
                                    <div key={stat.year} className="p-4 hover:bg-gray-50 transition-colors">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-bold text-gray-900 text-lg">{stat.year}</span>
                                            <span className={`font-bold text-lg ${stat.return >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{stat.return > 0 ? '+' : ''}{stat.return.toFixed(2)}%</span>
                                        </div>
                                        {/* Gain Row */}
                                        <div className="flex justify-between items-center text-xs text-gray-500 mb-1">
                                            <span>Gevinst/Tab</span>
                                            <span className={`font-mono font-medium ${stat.gainAbs >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{stat.gainAbs > 0 ? '+' : ''}{formatCurrencyNoDecimals(stat.gainAbs)}</span>
                                        </div>
                                        {/* Flow Row */}
                                        <div className="flex justify-between items-center text-xs text-gray-500">
                                            <span>Kapitalstrøm</span>
                                            <span className="font-mono font-medium cursor-help border-b border-dotted border-gray-300" title={`In: ${formatCurrencyNoDecimals(stat.breakdown.in)}\nOut: ${formatCurrencyNoDecimals(stat.breakdown.out)}`}>{stat.flow > 0 ? '+' : ''}{formatCurrencyNoDecimals(stat.flow)}</span>
                                        </div>
                                    </div>
                                ))}
                                {calc.yearlyStats.length === 0 && (
                                    <div className="p-8 text-center text-gray-400 italic">Ingen data tilgængelig</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // 4. EDITOR
    const renderEditor = () => {
        const viewRows = [...rows]
            .map((r, i) => ({ ...r, _origIdx: i }))
            .sort((a, b) => (parseDanishDate(a['Date']) || 0) - (parseDanishDate(b['Date']) || 0));

        let runningBalances = {};
        let runningHoldings = {};

        // Focus helpers
        const focusNext = (el) => {
            if (!el) return;
            const rowEl = el.closest('tr');
            if (!rowEl) return;
            const focusables = Array.from(rowEl.querySelectorAll('input, select'));
            const idx = focusables.indexOf(el);
            const next = focusables[idx + 1];
            if (next) next.focus();
        };
        const focusPrev = (el) => {
            if (!el) return;
            const rowEl = el.closest('tr');
            if (!rowEl) return;
            const focusables = Array.from(rowEl.querySelectorAll('input, select'));
            const idx = focusables.indexOf(el);
            const prev = focusables[idx - 1];
            if (prev) prev.focus();
        };

        const editorRows = viewRows.map(row => {
            const idx = row._origIdx;
            const acc = row['Account'] || 'Unknown';
            const ticker = row['Ticker'];
            // NEW: Track holdings specific to this account
            const holdingKey = `${ticker}_${acc}`;
            // Init trackers
            if (!runningBalances[acc]) runningBalances[acc] = 0;
            if (ticker && !runningHoldings[holdingKey]) runningHoldings[holdingKey] = 0;

            // Parse Numbers
            const qty = parseDanishNumber(row['Qty']);
            const price = parseDanishNumber(row['Price']);
            const comm = parseDanishNumber(row['Commission']);
            const tax = parseDanishNumber(row['Withheld Tax']);
            const taxRate = parseDanishNumber(row['FxRate']) || 1;

            // Currency Logic
            const stockCurrency = (row['Currency'] || 'DKK').toUpperCase();
            const accCurrency = (config.currencies[acc] || 'DKK').toUpperCase();
            const isCrossCurrency = accCurrency !== stockCurrency;
            // If USD Account buys USD Stock, Rate is effectively 1 (no conversion needed for Balance).
            // BUT for SKAT (Zone B), we still need the FxRate stored in the row.
            const conversionRate = isCrossCurrency ? taxRate : 1;

            // Type Logic
            const effectiveType = determineType(row['Type'], row['Ticker'], row['Qty']);
            const isTrade = ['Stock', 'ETF'].includes(effectiveType);
            const isCash = effectiveType === 'Cash' || effectiveType === 'Dividend';
            const isDividend = effectiveType === 'Dividend';

            const holdingsBefore = runningHoldings[holdingKey] || 0;

            // Update running holdings for NEXT row
            if (effectiveType === 'Stock' || effectiveType === 'ETF') {
                runningHoldings[holdingKey] += qty;
            }


            let delta = 0;
            let calcDetail = '';

            if (isTrade) {
                // Formula: -((Qty * Price * Rate) + Commission)
                const assetVal = (qty * price) * conversionRate;
                delta = -(assetVal + comm);
                calcDetail = `${effectiveType}: -(${formatDanishNumber(qty)} x ${formatDanishNumber(price)} x ${formatDanishNumber(conversionRate)}) - ${formatDanishNumber(comm)}`;
            } else if (isCash) {
                // Formula: (Qty * Price * Rate) - Tax
                const grossVal = (qty * price) * conversionRate;
                delta = grossVal - tax;
                calcDetail = `Cash: (${formatDanishNumber(qty)} x ${formatDanishNumber(price)} x ${formatDanishNumber(conversionRate)}) - ${formatDanishNumber(tax)}`;
            }
            runningBalances[acc] += delta;

            const meta = {
                isTrade, isCash, isCrossCurrency, stockCurrency, isDividend,
                holdingsSnapshot: holdingsBefore, // <--- Store for UI
                warnFx: (stockCurrency !== 'DKK' && taxRate === 1) // <--- Warning Flag
            };

            return { ...row, _idx: idx, _bal: runningBalances[acc], _delta: delta, _calcDetail: calcDetail, _accCur: accCurrency, _meta: meta };
        });

        const displayRows = editorRows.filter(r => {
            // 1. Sidebar Account Filter (Existing)
            if (filterAccount !== 'All' && r['Account'] !== filterAccount) return false;

            // 2. Column Header Filters (New)
            return Object.entries(filters).every(([key, searchVal]) => {
                if (!searchVal) return true; // No filter for this column

                // Grab value, handle numbers safely, convert to lower case for case-insensitive search
                const val = String(r[key] || '').toLowerCase();
                return val.includes(searchVal.toLowerCase());
            });
        }).slice().reverse(); // Reverse to show newest on top

        const currentAccCurrency = filterAccount !== 'All' ? (config.currencies[filterAccount] || 'DKK') : '';

        return (
            <div className="flex flex-col h-full bg-white">
                {/* TOP BAR */}
                <div className="flex items-center justify-between p-2 border-b bg-gray-50 shrink-0">
                    <div className="flex gap-2">
                        <button onClick={() => {
                            const dStr = normalizeDate(new Date().toISOString().split('T')[0]);
                            setRows(prev => [{ 'Date': dStr, 'Type': 'Stock', 'Ticker': '', 'Qty': 0, 'Price': 0, 'FxRate': 1, 'Commission': 0, 'Withheld Tax': 0, 'Currency': 'DKK', 'Account': filterAccount !== 'All' ? filterAccount : '' }, ...prev]);
                        }} className="flex items-center gap-1 px-3 py-1 bg-white border rounded hover:bg-gray-100 text-sm font-medium text-gray-700">
                            <i className="ph ph-plus"></i> Add Row
                        </button>
                        <button onClick={saveToGithub} className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium shadow-sm"><i className="ph ph-cloud-arrow-up"></i> Sync</button>
                        {statusMsg && <span className="text-xs text-gray-500 self-center ml-2">{statusMsg}</span>}
                    </div>
                </div>

                {/* TABLE */}
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="min-w-full text-xs text-left border-collapse">
                        <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                            {/* Row 1: Column Titles */}
                            <tr>
                                <th className="p-2 border-b border-gray-100 sticky left-0 bg-gray-50 z-20 w-8"></th>
                                {CSV_COLUMNS.map(c => {
                                    if (filterAccount !== 'All' && c === 'Account') return null;
                                    const currentAccCurrency = filterAccount !== 'All' ? (config.currencies[filterAccount] || 'DKK') : '';
                                    const showCur = (c === 'Commission' || c === 'Withheld Tax') && currentAccCurrency;

                                    return (
                                        <th key={c} className="p-2 border-b border-gray-100 font-semibold text-gray-600">
                                            {c} {showCur && <span className="ml-1 text-[10px] text-gray-400">({currentAccCurrency})</span>}
                                        </th>
                                    );
                                })}
                                <th className="p-2 border-b border-gray-100 font-semibold text-gray-600 text-right">Delta</th>
                                <th className="p-2 border-b border-gray-100 font-semibold text-gray-600 text-right">Balance</th>
                            </tr>

                            {/* Row 2: Filter Inputs */}
                            <tr className="bg-gray-50">
                                <th className="p-1 border-b border-gray-100 sticky left-0 bg-gray-50 z-20">
                                    {/* Clear Filters Button (shows only if filters exist) */}
                                    {Object.keys(filters).some(k => filters[k]) && (
                                        <button onClick={() => setFilters({})} className="text-gray-400 hover:text-red-500" title="Clear All Filters">
                                            <i className="ph ph-x-circle"></i>
                                        </button>
                                    )}
                                </th>
                                {CSV_COLUMNS.map(c => {
                                    if (filterAccount !== 'All' && c === 'Account') return null;
                                    return (
                                        <th key={c} className="p-1 border-b border-gray-100">
                                            <input
                                                className="w-full text-[10px] p-1 border border-gray-200 rounded bg-white focus:border-blue-300 outline-none"
                                                placeholder={`Filter...`}
                                                value={filters[c] || ''}
                                                onChange={e => setFilters(prev => ({ ...prev, [c]: e.target.value }))}
                                            />
                                        </th>
                                    );
                                })}
                                {/* Empty spacers for Delta/Balance columns (usually not filtered) */}
                                <th className="p-1 border-b border-gray-100"></th>
                                <th className="p-1 border-b border-gray-100"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {displayRows.map(row => (
                                <tr key={row._idx} className="group hover:bg-blue-50/30">
                                    <td className="p-1 text-center sticky left-0 bg-white group-hover:bg-blue-50/30 border-r border-gray-100">
                                        <button onClick={() => confirm('Delete?') && setRows(prev => prev.filter((_, i) => i !== row._idx))} className="text-gray-300 hover:text-red-500"><i className="ph ph-trash"></i></button>
                                    </td>

                                    {/* Date */}
                                    <td className="p-1"><FlatpickrDate value={row['Date']} onChange={(v) => updateRow(row._idx, 'Date', v)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext(e.currentTarget); } }} /></td>

                                    {/* Type */}
                                    <td className="p-1">
                                        <select className="w-20 input-base p-1 rounded font-medium text-gray-700" value={row['Type']} onChange={e => updateRow(row._idx, 'Type', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext(e.currentTarget); } }}>
                                            {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                    </td>

                                    {/* Ticker */}
                                    <td className="p-1"><input className="w-full input-base p-1 rounded font-medium" value={row['Ticker']} onChange={e => updateRow(row._idx, 'Ticker', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext(e.currentTarget); } }} /></td>

                                    {/* 1. Qty */}
                                    <td className="p-1 relative group/qty">
                                        <NumberInput
                                            row={row}
                                            setRows={setRows}
                                            fieldKey="Qty"
                                            rawKey="__qty_raw"
                                            extraClass="w-24"
                                        />

                                        {/* The Hint: Only show if Dividend and we have a ticker */}
                                        {row._meta.isDividend && row['Ticker'] && (
                                            <div className="absolute top-0 right-0 -mr-1 -mt-3 pointer-events-none opacity-0 group-hover/qty:opacity-100 transition-opacity z-10">
                                                <div className="bg-gray-800 text-white text-[10px] px-2 py-1 rounded shadow-lg">
                                                    Held: {formatDanishNumber(row._meta.holdingsSnapshot, 0)} pcs
                                                </div>
                                            </div>
                                        )}
                                    </td>

                                    {/* 2. Price */}
                                    <td className="p-1">
                                        <NumberInput
                                            row={row}
                                            setRows={setRows}
                                            fieldKey="Price"
                                            rawKey="__price_raw"
                                            extraClass={row._meta.isCash ? 'text-gray-300' : ''}
                                        />
                                    </td>
                                    {/* Currency */}
                                    <td className="p-1">
                                        <select className="w-16 input-base p-1 rounded text-xs" value={row['Currency']} onChange={e => updateRow(row._idx, 'Currency', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext(e.currentTarget); } }}>
                                            {CURRENCY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                    </td>

                                    {/* FxRate with Warning Tooltip */}
                                    <td className="p-1">
                                        <NumberInput
                                            row={row}
                                            setRows={setRows}
                                            fieldKey="FxRate"
                                            rawKey="__fx_raw"
                                            extraClass={row._meta.warnFx ? 'bg-orange-50 text-orange-700 font-bold border border-orange-300' : ''}
                                            title={row._meta.warnFx ? "Critical: Foreign currency with Rate 1.00" : "Exchange Rate"}
                                        />
                                    </td>

                                    {/* 4. Commission */}
                                    <td className="p-1">
                                        <NumberInput
                                            row={row}
                                            setRows={setRows}
                                            fieldKey="Commission"
                                            rawKey="__comm_raw"
                                            extraClass={!row._meta.isTrade ? 'text-gray-300' : 'text-gray-700'}
                                            title="Trading Fee"
                                        />
                                    </td>
                                    {/* 5. Withheld Tax */}
                                    <td className="p-1">
                                        {(() => {
                                            // 1. Gather Data
                                            const isDividend = row['Type'] === 'Dividend';
                                            const taxVal = parseDanishNumber(row['Withheld Tax']);

                                            // 2. Default Styling (Non-Dividend = Grey)
                                            let css = 'text-gray-300';
                                            let tooltip = 'Dividend Tax';

                                            // 3. Logic for Dividends
                                            if (isDividend) {
                                                css = 'text-gray-700'; // Normal text

                                                // A. Check for Zero Tax
                                                if (taxVal === 0) {
                                                    css = 'text-orange-700 bg-orange-50 border border-orange-300 font-bold';
                                                    tooltip = 'Warning: No tax withheld on dividend';
                                                }
                                                // B. Check Tax Ratio (Integrity Check)
                                                else {
                                                    const qty = parseDanishNumber(row['Qty']);
                                                    const price = parseDanishNumber(row['Price']);
                                                    const fx = parseDanishNumber(row['FxRate']) || 1;

                                                    // Determine Currency Conversion
                                                    const acc = row['Account'] || '';
                                                    const accCur = (config.currencies[acc] || 'DKK').toUpperCase();
                                                    const stockCur = (row['Currency'] || 'DKK').toUpperCase();

                                                    // If Currencies differ, apply FxRate to get Gross in Account Currency
                                                    const conversion = accCur !== stockCur ? fx : 1;
                                                    const grossAmount = qty * price * conversion;

                                                    if (grossAmount > 0) {
                                                        const pct = (taxVal / grossAmount) * 100;

                                                        // Validation Rules:
                                                        // DKK: Expect ~27%
                                                        // Foreign: Expect 15% - 28% (Standard treaty rates)
                                                        const isSuspicious = stockCur === 'DKK'
                                                            ? (pct < 26 || pct > 28)
                                                            : (pct < 14 || pct > 30);

                                                        if (isSuspicious) {
                                                            css = 'text-orange-700 bg-orange-50 border border-orange-300 font-bold';
                                                            tooltip = `Warning: Unusual Tax Rate (${pct.toFixed(1)}%). Check amounts.`;
                                                        }
                                                    }
                                                }
                                            }

                                            return (
                                                <NumberInput
                                                    row={row}
                                                    setRows={setRows}
                                                    fieldKey="Withheld Tax"
                                                    rawKey="__tax_raw"
                                                    extraClass={css}
                                                    title={tooltip}
                                                />
                                            );
                                        })()}
                                    </td>

                                    {/* Account */}
                                    {filterAccount === 'All' && (
                                        <td className="p-1"><input className="w-24 input-base p-1 rounded text-xs" value={row['Account']} onChange={e => updateRow(row._idx, 'Account', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext(e.currentTarget); } }} /></td>
                                    )}

                                    {/* Note */}
                                    <td className="p-1"><input className="w-24 input-base p-1 rounded text-gray-400 text-xs" value={row['Note']} onChange={e => updateRow(row._idx, 'Note', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext(e.currentTarget); } }} /></td>

                                    {/* Delta & Balance */}
                                    <td className={`p-2 text-right font-mono ${row._delta >= 0 ? 'text-green-600' : 'text-red-600'}`} title={row._calcDetail}>{formatNumber2(row._delta)}</td>
                                    <td className="p-2 text-right font-mono font-bold text-gray-700">{formatNumber2(row._bal)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // 5. SPLIT TOOL 
    const renderSplitTool = () => {
        const tickers = uniqueTickers;
        const selected = splitParams.ticker || (tickers[0] || '');

        // 1. Prepare Market Data (Blue Line) -> Convert to Timestamps { x, y }
        const md = marketData[selected];
        const hasData = md && md.history && md.history.length > 0;

        const graphData = hasData ? md.history.map(h => ({
            x: new Date(h.date).getTime(),
            y: h.close
        })) : [];

        // 2. Prepare User Trades (Dots)
        const userTrades = txs
            .filter(tx => tx.ticker === selected && (tx.type === 'BUY' || tx.type === 'SELL'))
            .map(tx => ({
                x: tx.date.getTime(),
                y: tx.price,
                type: tx.type,
                dateStr: getLocalISO(tx.date)
            }));

        // 3. Calculate Impacted Rows based on Range
        const startIso = splitParams.startDateIso || '1900-01-01';
        const endIso = splitParams.endDateIso || '2099-12-31';

        const impactedRows = rows.filter(r => {
            if ((r['Ticker'] || '').trim() !== selected) return false;
            const t = determineType(r['Type'], r['Ticker'], r['Qty']);
            if (!['Stock', 'ETF'].includes(t)) return false; // Only touch Trades

            const rDate = displayDateToIso(r['Date']);
            // Range Check (Inclusive)
            return rDate >= startIso && rDate <= endIso;
        }).length;

        // 4. Graph Click Handler (Set Range)
        const handleChartClick = (e) => {
            // Recharts sometimes returns null events or missing labels if clicked on empty space
            if (!e || !e.activeLabel) return;

            // activeLabel is usually the X-coordinate (timestamp) for number axes
            // We must convert it safely to an ISO string
            let clickedDate;
            try {
                clickedDate = new Date(e.activeLabel).toISOString().split('T')[0];
            } catch (err) { return; }

            setSplitParams(prev => {
                const hasStart = !!prev.startDateIso;
                const hasEnd = !!prev.endDateIso;

                // SCENARIO 1: Fresh Start
                // If we have (Both) OR (Neither) OR (Only End - the bug source), we reset.
                if ((hasStart && hasEnd) || (!hasStart && !hasEnd) || (!hasStart && hasEnd)) {
                    return { ...prev, startDateIso: clickedDate, endDateIso: '' };
                }

                // SCENARIO 2: Completing the Range
                // We have a Start, but no End.
                else {
                    const d1 = prev.startDateIso;
                    const d2 = clickedDate;

                    // Auto-swap if user clicked backwards (clicked 2020 then 2018)
                    if (d2 < d1) {
                        return { ...prev, startDateIso: d2, endDateIso: d1 };
                    }
                    return { ...prev, endDateIso: d2 };
                }
            });
        };

        const applySplit = () => {
            if (!selected) return;
            const num = parseDanishNumber(splitParams.num) || 0;
            const den = parseDanishNumber(splitParams.den) || 0;
            if (num <= 0 || den <= 0) { alert('Invalid ratio'); return; }

            const ratio = num / den;

            // VERIFICATION MESSAGE
            const confirmMsg =
                `About to apply Split ${num}:${den} to ${selected}.

Target Range: ${startIso} to ${endIso}
Rows Affected: ${impactedRows}

VERIFICATION:
1. Quantity will be multiplied by ${formatNumber2(ratio)}
2. Price will be divided by ${formatNumber2(ratio)}
3. Commission, Tax, and Account will remain UNTOUCHED.

Proceed?`;

            if (confirm(confirmMsg)) {
                setRows(prev => {
                    return prev.map(r => {
                        // 1. Filter Ticker
                        if ((r['Ticker'] || '').trim() !== selected) return r;
                        // 2. Filter Type (Strictly Stocks/ETFs only)
                        const t = determineType(r['Type'], r['Ticker'], r['Qty']);
                        if (!['Stock', 'ETF'].includes(t)) return r;
                        // 3. Filter Date Range
                        const rDate = displayDateToIso(r['Date']);
                        if (rDate < startIso || rDate > endIso) return r;

                        // 4. EXECUTE SAFE UPDATE
                        // We spread ...r first to keep all original fields (Commission, etc)
                        // Then we strictly overwrite Qty and Price.
                        return {
                            ...r,
                            'Qty': parseDanishNumber(r['Qty']) * ratio,
                            'Price': parseDanishNumber(r['Price']) / ratio,
                            'Note': (r['Note'] || '') + ` [Split ${num}:${den}]`
                        };
                    });
                });
                alert("Success. Split applied to selected range.");
                // Reset range to avoid double application
                setSplitParams(s => ({ ...s, startDateIso: '', endDateIso: '' }));
            }
        };

        // Helper to get X coordinate for ReferenceArea
        const refStart = splitParams.startDateIso ? new Date(splitParams.startDateIso).getTime() : null;
        const refEnd = splitParams.endDateIso ? new Date(splitParams.endDateIso).getTime() : null;

        return (
            <div className="p-6 h-full flex flex-col overflow-hidden">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <i className="ph ph-arrows-split text-blue-600"></i> Aktiesplit-værktøj
                    </h3>
                    {!hasData && (
                        <span className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full font-medium">
                            Ingen markedsdata. Klik "Opdater priser".
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-hidden">

                    {/* LEFT COL: Configuration */}
                    <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar">

                        {/* A. Auto-Detector  */}
                        {splitCandidates.length > 0 && (
                            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-3 text-orange-800 font-bold text-sm uppercase tracking-wide">
                                    <i className="ph ph-warning-circle text-lg"></i> Fundne kandidater
                                </div>
                                <div className="space-y-2">
                                    {splitCandidates.map((c, i) => (
                                        <div key={i}
                                            onClick={() => setSplitParams({
                                                ticker: c.ticker,
                                                num: c.suggestedNum,
                                                den: c.suggestedDen,
                                                startDateIso: '',
                                                endDateIso: c.date
                                            })}
                                            className="bg-white p-3 rounded border border-orange-100 shadow-sm cursor-pointer hover:border-orange-400 transition-colors group relative">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-gray-800">{c.ticker}</span>
                                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
                                                    Muligt {c.suggestedNum}:{c.suggestedDen}
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                Afvigelse på: {c.date}
                                            </div>
                                            <div className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 text-blue-600 text-xs font-bold transition-opacity">
                                                Vælg &rarr;
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* B. The Manual Form */}
                        <div className="card bg-gray-50 border-blue-100">
                            <h4 className="font-bold text-gray-700 mb-3 text-sm">Split-konfiguration</h4>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase">Ticker</label>
                                    <select className="w-full border border-gray-300 p-2 rounded bg-white mt-1"
                                        value={selected}
                                        onChange={e => setSplitParams(s => ({ ...s, ticker: e.target.value }))}>
                                        {tickers.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 uppercase">Ny antal</label>
                                        <input className="w-full border p-2 rounded mt-1 font-mono" type="number" value={splitParams.num} onChange={e => setSplitParams(s => ({ ...s, num: e.target.value }))} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 uppercase">Gammel antal</label>
                                        <input className="w-full border p-2 rounded mt-1 font-mono" type="number" value={splitParams.den} onChange={e => setSplitParams(s => ({ ...s, den: e.target.value }))} />
                                    </div>
                                </div>

                                {/* Date Range Inputs */}
                                <div className="p-3 bg-blue-50 rounded border border-blue-100">
                                    <label className="text-xs font-bold text-blue-800 uppercase flex justify-between">
                                        <span>Anvend interval</span>
                                        <span className="font-normal normal-case text-blue-600 cursor-pointer" onClick={() => setSplitParams(s => ({ ...s, startDateIso: '', endDateIso: '' }))}>Ryd</span>
                                    </label>

                                    <div className="mt-2 space-y-2">
                                        <div>
                                            <span className="text-[10px] text-gray-500 uppercase">Fra (inkluderet)</span>
                                            <input type="date" className="w-full border p-1 rounded text-sm"
                                                value={splitParams.startDateIso}
                                                onChange={e => setSplitParams(s => ({ ...s, startDateIso: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-500 uppercase">Til (inkluderet)</span>
                                            <input type="date" className="w-full border p-1 rounded text-sm"
                                                value={splitParams.endDateIso}
                                                onChange={e => setSplitParams(s => ({ ...s, endDateIso: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-blue-600 mt-2 italic">
                                        Tip: Klik på to punkter i grafen for at vælge interval automatisk.
                                    </p>
                                </div>

                                <div className="pt-2">
                                    <button onClick={applySplit}
                                        disabled={impactedRows === 0}
                                        className={`w-full py-2 text-white rounded font-medium shadow-sm transition-colors ${impactedRows > 0 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}>
                                        Udfør split ({splitParams.num}:{splitParams.den})
                                    </button>
                                    <p className="text-center text-[10px] text-gray-400 mt-2">
                                        Vil ændre <strong>{impactedRows}</strong> transaktionsrækker.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COL: The Interactive Graph */}
                    <div className="lg:col-span-2 flex flex-col h-full min-h-[400px]">
                        <div className="card flex-1 flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="font-bold text-gray-700 flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full bg-blue-500"></span> Markedshistorik
                                    <span className="text-gray-300 mx-2">vs</span>
                                    <span className="w-3 h-3 rounded-full bg-green-500"></span> Dine handler
                                </h4>
                            </div>

                            <div className="flex-1 w-full min-h-0 relative">
                                {!hasData && (
                                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 z-10">
                                        Ingen markedsdata tilgængelig for {selected}
                                    </div>
                                )}
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart
                                        margin={{ top: 20, right: 30, bottom: 20, left: 10 }}
                                        onClick={handleChartClick} // <--- CLICK TO SELECT RANGE
                                        style={{ cursor: 'crosshair' }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />

                                        {/* X Axis: Time Scale */}
                                        <XAxis
                                            dataKey="x"
                                            type="number"
                                            domain={['auto', 'auto']}
                                            tick={{ fontSize: 10, fill: '#9ca3af' }}
                                            tickFormatter={(t) => new Date(t).toLocaleDateString()}
                                            minTickGap={50}
                                        />

                                        {/* Y Axis: Price Scale */}
                                        <YAxis
                                            dataKey="y"
                                            width={60}
                                            tick={{ fontSize: 10, fill: '#9ca3af' }}
                                            domain={['auto', 'auto']}
                                            tickFormatter={(v) => formatNumber2(v)}
                                        />

                                        <Tooltip
                                            contentStyle={{ fontSize: '12px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            formatter={(val, name) => [formatNumber2(val), name]}
                                            labelFormatter={(label) => new Date(label).toLocaleDateString()}
                                        />

                                        {/* 1. Highlight Selected Range */}
                                        {refStart && refEnd && (
                                            <ReferenceArea x1={refStart} x2={refEnd} fill="#3b82f6" fillOpacity={0.1} />
                                        )}
                                        {/* If only start is selected, show a line */}
                                        {refStart && !refEnd && (
                                            <ReferenceLine x={refStart} stroke="#3b82f6" strokeDasharray="3 3" />
                                        )}

                                        {/* 2. Yahoo History (Area) */}
                                        <Area data={graphData} type="monotone" dataKey="y" name="Market Price" stroke="#3b82f6" strokeWidth={2} fillOpacity={0.05} fill="#3b82f6" isAnimationActive={false} />

                                        {/* 3. User BUYS (Scatter) */}
                                        <Scatter data={userTrades.filter(t => t.type === 'BUY')} name="Your Buy" fill="#10b981" shape="circle" isAnimationActive={false} />

                                        {/* 4. User SELLS (Scatter) */}
                                        <Scatter data={userTrades.filter(t => t.type === 'SELL')} name="Your Sell" fill="#ef4444" shape="triangle" isAnimationActive={false} />

                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="mt-4 text-xs text-gray-500 bg-blue-50/50 p-3 rounded border border-blue-100 flex gap-4 items-center">
                                <div className="flex-1">
                                    <strong>Brug:</strong> Klik på grafen for at vælge <span className="text-blue-600 font-bold">startdato</span>. Klik igen for at vælge <span className="text-blue-600 font-bold">slutdato</span>. <br />
                                    Det blå område viser hvilke transaktioner der splittes.
                                </div>
                                <div className="text-right">
                                    <span className="block font-bold text-gray-700">Rækker i interval: {impactedRows}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        );
    };



    // --- LAYOUT ---
    return (
        <div className="flex h-screen w-full bg-white relative font-sans text-gray-800">

            {/* Anonymity Blur Overlay */}
            {settings.anonymityBlur && blurActive && (
                <div className="anonymity-blur-overlay">
                    <div className="anonymity-blur-icon" title="Klik for at vise" onClick={() => { setBlurActive(false); fetchMarketData(false); }}>
                        <i className="ph ph-eye-slash"></i>
                        <span>Vis indhold</span>
                    </div>
                </div>
            )}

            {/* SETTINGS MODAL */}
            {showSettings && (
                <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-96 space-y-4">
                        <h2 className="font-bold text-lg">Indstillinger</h2>
                        <input className="w-full border p-2 rounded" placeholder="Ejer (Bruger)" value={ghConfig.owner} onChange={e => setGhConfig({ ...ghConfig, owner: e.target.value })} />
                        <input className="w-full border p-2 rounded" placeholder="Repo-navn" value={ghConfig.repo} onChange={e => setGhConfig({ ...ghConfig, repo: e.target.value })} />
                        <input className="w-full border p-2 rounded" placeholder="Filsti (data.csv)" value={ghConfig.path} onChange={e => setGhConfig({ ...ghConfig, path: e.target.value })} />
                        <input className="w-full border p-2 rounded" type="password" placeholder="GitHub Token (Repo-adgang)" value={ghConfig.token} onChange={e => setGhConfig({ ...ghConfig, token: e.target.value })} />
                        {/* Import CSV moved here */}
                        <div className="flex flex-col gap-2 pt-2">
                            <label className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium cursor-pointer">
                                <i className="ph ph-upload-simple"></i> Importer CSV
                                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                            </label>
                        </div>
                        {/* Anonymity Blur Toggle */}
                        <div className="flex items-center gap-2 pt-2">
                            <input id="anonymity-blur-toggle" type="checkbox" className="accent-blue-600" checked={!!settings.anonymityBlur} onChange={e => setSettings(s => ({ ...s, anonymityBlur: e.target.checked }))} />
                            <label htmlFor="anonymity-blur-toggle" className="text-sm text-gray-700 cursor-pointer select-none">
                                Slør app ved tab af fokus (anonymitet)
                            </label>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => { localStorage.setItem('gh_config', JSON.stringify(ghConfig)); setShowSettings(false); loadFromGithub(); }} className="flex-1 bg-blue-600 text-white py-2 rounded font-medium">Ok</button>
                            <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-gray-500">Luk</button>
                        </div>
                    </div>
                </div>
            )}

            {/* SIDEBAR NAVIGATION (hidden on small screens) */}
            <div className="hidden md:flex md:w-64 bg-gray-50 border-r border-gray-200 flex-col shrink-0">


                <div className="flex-1 overflow-y-auto p-3 space-y-2">

                    {/* 1. Dashboard */}
                    <button type="button" onClick={() => setView('dashboard')} className={`nav-item w-full text-left ${view === 'dashboard' ? 'active' : ''}`}>
                        <i className="ph ph-chart-line-up text-lg"></i> Oversigt
                    </button>

                    {/* 2. Holdings */}
                    <button type="button" onClick={() => setView('holdings')} className={`nav-item w-full text-left ${view === 'holdings' ? 'active' : ''}`}>
                        <i className="ph ph-briefcase text-lg"></i> Beholdninger
                    </button>


                    {/* 3. Transactions Editor Section */}
                    <div>
                        <button type="button" onClick={() => { setView('editor'); setFilterAccount('All'); }} className={`nav-item w-full text-left ${view === 'editor' && filterAccount === 'All' ? 'active' : ''}`}>
                            <i className="ph ph-list-dashes text-lg"></i> Transaktioner
                        </button>
                        {/* Account Filters */}
                        <div className="mt-1 space-y-0.5">
                            {accounts
                                .filter(acc => !config.hidden.includes(acc)) // 1. Filter out hidden accounts
                                .map(acc => {
                                    // 2. Lookup currency (default to DKK)
                                    const currency = config.currencies[acc] || 'DKK';

                                    return (
                                        <button
                                            key={acc}
                                            onClick={() => { setView('editor'); setFilterAccount(acc); }}
                                            className={`sub-nav-item ${view === 'editor' && filterAccount === acc ? 'active' : ''} flex justify-between items-center pr-2`}
                                        >
                                            <span className="truncate" title={acc}>{acc}</span>
                                            <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1 rounded ml-2">
                                                {currency}
                                            </span>
                                        </button>
                                    );
                                })}
                        </div>
                    </div>

                    {/* 4. Tax Report Section */}
                    <div>
                        <button type="button" onClick={() => setView('tax')} className={`nav-item w-full text-left ${view === 'tax' ? 'active' : ''}`}>
                            <i className="ph ph-bank text-lg"></i> Skatterapport
                        </button>
                        {/* Year Selector */}
                        <div className="mt-1 space-y-0.5">
                            {years.map(y => (
                                <button type="button" key={y} onClick={() => { setView('tax'); setTaxYear(y); }} className={`sub-nav-item ${view === 'tax' && taxYear === y ? 'active' : ''}`}>
                                    {y}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 5. Split Tool (moved to last) */}
                    <button type="button" onClick={() => setView('split')} className={`nav-item w-full text-left ${view === 'split' ? 'active' : ''}`}>
                        <i className="ph ph-arrows-split text-lg"></i> Split-værktøj
                    </button>

                </div>

                {/* Bottom Actions: Only Settings button for desktop sidebar */}
                <div className="p-4 border-t border-gray-200 flex flex-col gap-2">
                    <button onClick={() => setShowSettings(true)} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 text-gray-700">
                        <i className="ph ph-gear-six"></i> Indstillinger
                    </button>
                </div>
            </div>

            {/* MOBILE OVERLAY NAV */}
            {mobileNavOpen && (
                <div className="fixed inset-0 z-50 md:hidden">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)}></div>
                    {/* CHANGED: right-0 -> left-0 AND border-l -> border-r */}
                    <div className="absolute top-0 left-0 w-64 h-full bg-white shadow-xl border-r border-gray-200 flex flex-col z-10">
                        <div className="p-5 border-b border-gray-200 flex justify-between items-center">
                            <div className="font-bold text-lg flex items-center gap-2"><i className="ph ph-wallet text-blue-600"></i> Menu</div>
                            <button onClick={() => setMobileNavOpen(false)} className="text-gray-400 hover:text-gray-700"><i className="ph ph-x"></i></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {/* 1. Dashboard */}
                            <button type="button" onClick={() => { setView('dashboard'); setMobileNavOpen(false); }} className={`nav-item w-full text-left ${view === 'dashboard' ? 'active' : ''}`}>
                                <i className="ph ph-chart-line-up text-lg"></i> Oversigt
                            </button>

                            {/* 2. Holdings */}
                            <button type="button" onClick={() => { setView('holdings'); setMobileNavOpen(false); }} className={`nav-item w-full text-left ${view === 'holdings' ? 'active' : ''}`}>
                                <i className="ph ph-briefcase text-lg"></i> Beholdninger
                            </button>

                            {/* 3. Transactions Editor Section */}
                            <div>
                                <button type="button" onClick={() => { setView('editor'); setFilterAccount('All'); setMobileNavOpen(false); }} className={`nav-item w-full text-left ${view === 'editor' && filterAccount === 'All' ? 'active' : ''}`}>
                                    <i className="ph ph-list-dashes text-lg"></i> Transaktioner
                                </button>
                                {/* Account Filters */}
                                <div className="mt-1 space-y-0.5">
                                    {accounts
                                        .filter(acc => !config.hidden.includes(acc))
                                        .map(acc => {
                                            const currency = config.currencies[acc] || 'DKK';
                                            return (
                                                <button
                                                    key={acc}
                                                    onClick={() => { setView('editor'); setFilterAccount(acc); setMobileNavOpen(false); }}
                                                    className={`sub-nav-item ${view === 'editor' && filterAccount === acc ? 'active' : ''} flex justify-between items-center pr-2`}
                                                >
                                                    <span className="truncate" title={acc}>{acc}</span>
                                                    <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1 rounded ml-2">
                                                        {currency}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                </div>
                            </div>

                            {/* 4. Tax Report Section */}
                            <div>
                                <button type="button" onClick={() => { setView('tax'); setMobileNavOpen(false); }} className={`nav-item w-full text-left ${view === 'tax' ? 'active' : ''}`}>
                                    <i className="ph ph-bank text-lg"></i> Skatterapport
                                </button>
                                {/* Year Selector */}
                                <div className="mt-1 space-y-0.5">
                                    {years.map(y => (
                                        <button type="button" key={y} onClick={() => { setView('tax'); setTaxYear(y); setMobileNavOpen(false); }} className={`sub-nav-item ${view === 'tax' && taxYear === y ? 'active' : ''}`}>
                                            {y}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 5. Split Tool */}
                            <button type="button" onClick={() => { setView('split'); setMobileNavOpen(false); }} className={`nav-item w-full text-left ${view === 'split' ? 'active' : ''}`}>
                                <i className="ph ph-arrows-split text-lg"></i> Split-værktøj
                            </button>
                        </div>

                        {/* Bottom Actions */}
                        <div className="p-4 border-t border-gray-200 flex flex-col gap-2">
                            <button onClick={() => { setShowSettings(true); setMobileNavOpen(false); }} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 text-gray-700">
                                <i className="ph ph-gear-six"></i> Indstillinger
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">

                {/* Context Header */}
                <div className="h-14 border-b border-gray-100 flex items-center justify-between px-4 md:px-8 shrink-0 bg-white relative">

                    {/* 1. LEFT: Hamburger Menu (Mobile Only) - Moved here */}
                    <button
                        onClick={() => setMobileNavOpen(true)}
                        className="md:hidden p-2 -ml-2 text-gray-700 hover:text-gray-900"
                        aria-label="Open menu"
                    >
                        <i className="ph ph-list text-2xl"></i>
                    </button>

                    {/* 2. CENTER/LEFT: Title */}
                    <div className="flex-1 flex items-center justify-center md:justify-start">
                        <h1 className="text-xl font-bold text-gray-800 text-center w-full md:w-auto">
                            {view === 'editor' && (filterAccount === 'All' ? 'Alle transaktioner' : `${filterAccount}`)}
                            {view === 'dashboard' && 'Oversigt'}
                            {view === 'holdings' && 'Beholdninger'}
                            {view === 'split' && 'Split-værktøj'}
                            {view === 'tax' && `Skatterapport: ${taxYear}`}
                        </h1>
                    </div>

                    {/* 3. RIGHT: Single Unified Update Button */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => fetchMarketData(false)}
                            className="p-2 w-10 h-10 rounded-full bg-white border border-gray-200 hover:bg-blue-50 text-blue-600 text-lg shadow-sm flex items-center justify-center"
                            title={lastUpdate ? `Sidst opdateret: ${lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : "Opdater priser"}
                        >
                            {loading ? <i className="ph ph-spinner animate-spin"></i> : <i className="ph ph-arrows-clockwise"></i>}
                        </button>

                        {/* Status Message Bubble */}
                        {statusMsg && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full animate-pulse hidden sm:inline-block">{statusMsg}</span>}
                    </div>
                </div>

                {/* VALIDATION WARNING BANNER */}
                {schemaErrors.length > 0 && (
                    <div className="bg-red-50 border-b border-red-200 p-4 max-h-40 overflow-y-auto">
                        <div className="flex items-center gap-2 text-red-800 font-bold mb-2">
                            <i className="ph ph-warning-circle text-xl"></i>
                            <span>Dataintegritetsfejl ({schemaErrors.length})</span>
                            <button onClick={() => setSchemaErrors([])} className="ml-auto text-xs bg-red-100 hover:bg-red-200 px-2 py-1 rounded text-red-700">Luk</button>
                        </div>
                        <ul className="list-disc list-inside text-sm text-red-700 space-y-1 font-mono">
                            {schemaErrors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                    </div>
                )}

                {/* --- CALCULATION WARNINGS BANNER (MISSING LIMITS/RATES) --- */}
                {calc.warnings && calc.warnings.length > 0 && (
                    <div className="bg-orange-50 border-b border-orange-200 p-4 max-h-40 overflow-y-auto animate-in slide-in-from-top-2">
                        <div className="flex items-center gap-2 text-orange-900 font-bold mb-2">
                            <i className="ph ph-warning-octagon text-xl text-orange-600"></i>
                            <span>Kritiske Beregningsfejl ({calc.warnings.length})</span>
                        </div>
                        <div className="text-sm text-orange-800 mb-2">
                            Følgende mangler forhindrer korrekt skatteberegning:
                        </div>
                        <ul className="list-disc list-inside text-xs text-orange-800 space-y-1 font-mono bg-white/50 p-2 rounded border border-orange-100">
                            {calc.warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* View Container */}
                <div className="flex-1 overflow-auto overflow-x-auto bg-gray-50">
                    {view === 'editor' && renderEditor()}
                    {view === 'dashboard' && renderDashboard()}
                    {view === 'holdings' && renderHoldings()}
                    {view === 'split' && renderSplitTool()}
                    {view === 'tax' && renderTaxReport()}
                </div>
            </div>
        </div>
    );
}
export default function WrappedApp() {
    return (
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    );
}