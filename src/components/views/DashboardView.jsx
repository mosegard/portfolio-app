import React, { useState, useEffect, useRef } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, ReferenceLine, ReferenceArea
} from 'recharts';
import ModalPortal from '../ModalPortal';
import {
    formatCurrency,
    formatCurrencyNoDecimals,
    getLocalISO
} from '../../utils';

const DashboardView = ({ calc, marketData, settings, setSettings, fetchMarketData, uniqueTickers, years }) => {
    // --- Local State ---
    const [graphRange, setGraphRange] = useState('ALL');
    const [customRange, setCustomRange] = useState({ startIso: '', endIso: '' });
    const [chartSelection, setChartSelection] = useState({ start: null, end: null, chart: null, dragging: false });
    const [fullscreenChart, setFullscreenChart] = useState(null);
    const [selectedTickers, setSelectedTickers] = useState([]);
    
    // Modals
    const [showMoversModal, setShowMoversModal] = useState(false);
    const [showLiquidationModal, setShowLiquidationModal] = useState(false);
    const [showAllocationModal, setShowAllocationModal] = useState(false);
    const [showGainModal, setShowGainModal] = useState(false);
    const [allocationMode, setAllocationMode] = useState('currency');
    const [showMobileGraphMenu, setShowMobileGraphMenu] = useState(false);

    // --- Helpers ---
    const getFxRate = (cur) => {
        const C = (cur || '').toUpperCase();
        if (!C || C === 'DKK') return 1;
        const fxM = marketData[`${C}DKK=X`] || {};
        return (fxM.price ?? fxM.previousClose ?? 1);
    };

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

    // --- Drag Logic ---
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

    // --- Chart Data Preparation ---
    const series = calc.totalValueGraph || [];
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
    const isMulti = (selectedTickers || []).length > 1;
    const isSingle = (selectedTickers || []).length === 1;
    const sel = selectedTickers || [];

    const getFilteredData = (dataset, isGrowth = false) => {
        if (dataset.length === 0) return [];
        if (graphRange === 'ALL') return dataset;

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
            startDate = new Date(now.getFullYear(), 0, 1);
        } else if (!isNaN(Number(graphRange))) {
            startDate = new Date(Number(graphRange), 0, 1);
            endDate = new Date(Number(graphRange), 11, 31);
        }

        const isoStart = getLocalISO(startDate);
        let sliced = dataset.filter(d => d.date >= isoStart);
        if (endDate) {
            const isoEnd = getLocalISO(endDate);
            sliced = sliced.filter(d => d.date <= isoEnd);
        }

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
    };

    const mergeByDate = (seriesMap) => {
        const dateSet = new Set();
        Object.values(seriesMap).forEach(arr => arr.forEach(d => dateSet.add(d.date)));
        const dates = Array.from(dateSet).sort();
        const maps = {};
        Object.keys(seriesMap).forEach(t => { maps[t] = new Map(seriesMap[t].map(d => [d.date, d.value])); });
        
        const findLatest = (t, date) => {
            const m = seriesMap[t];
            if (!m || m.length === 0) return undefined;
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

    let mergedGrowthData = displayGrowthData;
    if (settings.benchmarkTicker) {
        const hist = (marketData[settings.benchmarkTicker]?.history || []).slice();
        if (hist.length > 0 && displayGrowthData.length > 0) {
            const closeMap = new Map(hist.map(h => [h.date, h.close]));
            const startIso = displayGrowthData[0].date;
            let basePrice = null;
            if (closeMap.has(startIso)) basePrice = closeMap.get(startIso);
            if (basePrice == null) {
                let candidate = null;
                for (let i = hist.length - 1; i >= 0; i--) {
                    if (hist[i].date <= startIso) { candidate = hist[i].close; break; }
                }
                basePrice = candidate ?? hist[0].close;
            }
            if (basePrice && basePrice > 0) {
                mergedGrowthData = displayGrowthData.map(d => {
                    let price = closeMap.get(d.date);
                    if (price == null) {
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

    const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f43f5e', '#84cc16'];
    const historicalGain = Object.values(calc.reports).reduce((acc, r) => acc + (r.rubrik66 || 0) + (r.rubrik38 || 0) + (r.rubrik345 || 0) + (r.rubrik61 || 0) + (r.rubrik63 || 0) + (r.askGain || 0), 0);
    const allTimeGain = historicalGain + (calc.unrealizedStockGain || 0);
    const liq = calc.liquidation;

    // --- Sub-Components (Internal) ---
    const RangeSelector = () => {
        const baseRanges = ['1M', 'ALL'];
        const options = graphRange === 'CUSTOM' ? ['CUSTOM', ...baseRanges, ...years] : [...baseRanges, ...years];
        const dropdownClass = "px-3 py-1 text-xs font-bold rounded-md bg-gray-100 border border-gray-100 cursor-pointer w-full";
        return (
            <select className={dropdownClass} value={graphRange} onChange={e => setGraphRange(e.target.value)}>
                {options.map(r => (
                    <option key={r} value={r}>
                        {r === '1M' ? '1M' : r === 'ALL' ? 'Altid' : r === 'CUSTOM' ? 'ZOOM' : r}
                    </option>
                ))}
            </select>
        );
    };

    const TickerSelector = () => {
        const btnClass = "px-3 py-1 text-xs font-bold rounded-md bg-gray-100 border border-gray-100 flex items-center justify-between gap-1 cursor-pointer w-full";
        const tickers = uniqueTickers;
        const [open, setOpen] = useState(false);
        const [query, setQuery] = useState("");
        const boxRef = useRef(null);
        useEffect(() => {
            if (!open) return;
            const onClick = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
            window.addEventListener('mousedown', onClick);
            return () => window.removeEventListener('mousedown', onClick);
        }, [open]);

        const selected = selectedTickers;
        const label = selected.length === 0 ? 'Alle' : selected.length === 1 ? selected[0] : `${selected.length} valgt`;
        const filtered = query ? tickers.filter(t => t.toLowerCase().includes(query.toLowerCase())) : tickers;

        const toggleTicker = (t) => {
            setSelectedTickers(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
        };
        const clearAll = () => setSelectedTickers([]);

        return (
            <div className="relative w-full" ref={boxRef}>
                <button type="button" className={btnClass} onClick={() => setOpen(o => !o)} title="Vælg flere tickers">
                    <span className="truncate">{label}</span>
                    <i className="ph ph-caret-down text-gray-500 shrink-0"></i>
                </button>
                {open && (
                    <div className="absolute top-full left-0 mt-1 z-40 w-56 bg-white border border-gray-100 rounded-md shadow-lg">
                        <div className="p-2 border-b border-gray-100">
                            <input type="text" className="w-full px-2 py-1 text-xs border border-gray-100 rounded-md" placeholder="Søg…" value={query} onChange={e => setQuery(e.target.value)} />
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

    // Chart Formatters
    const toUnix = (dateStr) => new Date(dateStr).getTime();
    
    // --- CORRECTED MAPPING ---
    // We strictly use the netValue provided by usePortfolioEngine
    const numericValueData = displayValueData.map(d => ({ 
        ...d, 
        date: toUnix(d.date),
        netValue: d.netValue !== undefined ? d.netValue : d.value 
    }));

    const numericGrowthData = mergedGrowthData.map(d => ({ ...d, date: toUnix(d.date) }));

    const formatAxisDate = (dateStr) => {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
        const monthName = monthNames[parseInt(m, 10) - 1];
        const day = parseInt(d, 10);
        return graphRange === 'ALL' ? `${day}. ${monthName} ${y}` : `${day}. ${monthName}`;
    };
    const formatAxisDateNumeric = (ts) => formatAxisDate(new Date(ts).toISOString().split('T')[0]);

    const firstDate = series.length ? series[0].date : null;
    const lastDate = series.length ? series[series.length - 1].date : null;
    const firstYear = firstDate ? parseInt(firstDate.slice(0, 4), 10) : null;
    const lastYear = lastDate ? parseInt(lastDate.slice(0, 4), 10) : null;
    let yearTicks = [];
    if (firstYear != null && lastYear != null) {
        for (let y = firstYear + 1; y <= lastYear; y++) yearTicks.push(`${y}-01-01`);
    }
    const numericYearTicks = yearTicks.map(dateStr => toUnix(dateStr));
    const showYearLines = graphRange === 'ALL';

    const bd = Object.values(calc.reports).reduce((acc, r) => ({
        stocks: acc.stocks + (r.rubrik66 || 0),
        etfs: acc.etfs + (r.rubrik38 || 0),
        divs: acc.divs + (r.rubrik61 || 0) + (r.rubrik63 || 0),
        capital: acc.capital + (r.rubrik345 || 0),
        ask: acc.ask + (r.askGain || 0),
    }), { stocks: 0, etfs: 0, divs: 0, capital: 0, ask: 0 });

    return (
        <div className="p-6 md:p-8 space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
            {/* VALUE ALLOCATION MODAL */}
            {showAllocationModal && (
                <ModalPortal onBackdropClick={() => setShowAllocationModal(false)}>
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2"><i className="ph ph-wallet text-blue-600"></i> Værdi – Allokering</h3>
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
                                if (items.length === 0) return <div className="text-center text-gray-400 italic py-8">Ingen aktive beholdninger.</div>;
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

            {/* LIQUIDATION MODAL */}
            {showLiquidationModal && (
                <ModalPortal onBackdropClick={() => setShowLiquidationModal(false)}>
                    <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2"><i className="ph ph-money text-emerald-600"></i> Likvidationsværdi</h3>
                            <button onClick={() => setShowLiquidationModal(false)} className="text-gray-400 hover:text-gray-700"><i className="ph ph-x text-lg"></i></button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="text-center p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                                <div className="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-1">Netto Udbetaling (Estimat)</div>
                                <div className="text-3xl font-bold text-emerald-700 tracking-tight">{formatCurrencyNoDecimals(liq.netResult)}</div>
                                <div className="text-[10px] text-emerald-600 mt-1">Værdi i dag minus estimeret restskat</div>
                            </div>
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-gray-500 uppercase border-b border-gray-100 pb-1 mb-2">Skatteomkostninger</h4>
                                {liq.taxBreakdown.map((item, i) => (
                                    <div key={i} className="flex justify-between items-center text-sm group">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.bg} ${item.color}`}><i className={`ph ${item.icon}`}></i></div>
                                            <span className={`text-gray-700 ${item.italic ? 'italic text-gray-500' : ''}`}>{item.label}</span>
                                        </div>
                                        <span className="font-mono font-medium text-gray-900">-{formatCurrencyNoDecimals(item.val)}</span>
                                    </div>
                                ))}
                                <div className="border-t border-gray-200 mt-4 pt-3 flex justify-between items-center">
                                    <span className="font-bold text-gray-900">Total Skattebyrde</span>
                                    <span className="font-bold text-lg text-red-600 font-mono">-{formatCurrencyNoDecimals(liq.totalTaxBurden)}</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <div className="bg-gray-50 p-2 rounded border border-gray-100">
                                    <div className="text-[10px] text-gray-500 uppercase">Effektiv Skat</div>
                                    <div className="text-lg font-bold text-gray-800">{liq.effectiveTaxRate.toFixed(1)}%</div>
                                </div>
                                <div className="bg-gray-50 p-2 rounded border border-gray-100">
                                    <div className="text-[10px] text-gray-500 uppercase">Netto Indskud</div>
                                    <div className="text-lg font-bold text-gray-800" title="Total indsat minus total hævet">{formatCurrencyNoDecimals(liq.lifetimeNetInvested)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </ModalPortal>
            )}

            {/* BREAKDOWN MODAL */}
            {showGainModal && (
                <ModalPortal onBackdropClick={() => setShowGainModal(false)}>
                    <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2"><i className="ph ph-chart-pie-slice text-blue-600"></i> Gevinstfordeling</h3>
                            <button onClick={() => setShowGainModal(false)} className="text-gray-400 hover:text-gray-700"><i className="ph ph-x text-lg"></i></button>
                        </div>
                        <div className="p-4 space-y-3">
                            {[
                                { label: 'Realiseret Aktiegevinst', val: bd.stocks, icon: 'ph-trend-up', color: 'text-blue-600', bg: 'bg-blue-50' },
                                { label: 'Lagerbeskattet ETF', val: bd.etfs, icon: 'ph-buildings', color: 'text-purple-600', bg: 'bg-purple-50' },
                                { label: 'Udbytter', val: bd.divs, icon: 'ph-coins', color: 'text-green-600', bg: 'bg-green-50' },
                                { label: 'Kapitalindkomst', val: bd.capital, icon: 'ph-bank', color: 'text-orange-600', bg: 'bg-orange-50' },
                                { label: 'Aktiesparekonto', val: bd.ask, icon: 'ph-piggy-bank', color: 'text-teal-600', bg: 'bg-teal-50' },
                                { label: 'Urealiseret (Aktier)', val: calc.unrealizedStockGain, icon: 'ph-hourglass', color: 'text-gray-600', bg: 'bg-gray-100', italic: true }
                            ].map((item, i) => (
                                <div key={i} className="flex justify-between items-center text-sm group">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.bg} ${item.color}`}><i className={`ph ${item.icon}`}></i></div>
                                        <span className={`text-gray-700 ${item.italic ? 'italic text-gray-500' : ''}`}>{item.label}</span>
                                    </div>
                                    <span className={`font-mono font-medium ${item.val >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatCurrencyNoDecimals(item.val)}</span>
                                </div>
                            ))}
                            <div className="border-t border-gray-200 mt-4 pt-3 flex justify-between items-center">
                                <span className="font-bold text-gray-900">Total</span>
                                <span className={`font-bold text-lg ${allTimeGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrencyNoDecimals(allTimeGain)}</span>
                            </div>
                        </div>
                    </div>
                </ModalPortal>
            )}

            {/* FULLSCREEN CHART MODAL */}
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
                                    return <span className={`ml-2 text-xs font-mono px-2 py-0.5 rounded ${diff >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>vs {benchLabel}: {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%</span>
                                })()}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-[80px] sm:w-[100px]"><RangeSelector /></div>
                                <div className="w-[120px] sm:w-[200px]"><TickerSelector /></div>
                                <select className="px-3 py-1 text-xs font-bold rounded-md bg-gray-100 border border-gray-200 max-w-[100px] sm:max-w-none truncate" value={settings.benchmarkTicker} onChange={e => { setSettings(s => ({ ...s, benchmarkTicker: e.target.value })); fetchMarketData(true); }}>
                                    {BENCHMARKS.map(b => (<option key={b.ticker} value={b.ticker}>{b.label}</option>))}
                                </select>
                                <button className="px-2 py-1 text-xs rounded-md border border-gray-200 hover:bg-gray-100" onClick={() => setFullscreenChart(null)}>Luk</button>
                            </div>
                        </div>
                        <div className={`flex-1 relative ${chartSelection.dragging ? 'select-none' : ''}`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={fullscreenChart === 'growth' ? numericGrowthData : numericValueData}
                                    onMouseDown={(e) => { const se = e && e.sourceEvent; if (se && se.preventDefault) se.preventDefault(); if (e && e.activeLabel != null) setChartSelection({ start: e.activeLabel, end: null, chart: fullscreenChart, dragging: true }); }}
                                    onMouseMove={(e) => { if (chartSelection.dragging && chartSelection.chart === fullscreenChart && e && e.activeLabel != null) setChartSelection(s => ({ ...s, end: e.activeLabel })); }}
                                    onMouseUp={() => { if (chartSelection.dragging && chartSelection.chart === fullscreenChart && chartSelection.start != null && chartSelection.end != null) setChartSelection(s => ({ ...s, dragging: false })); else setChartSelection({ start: null, end: null, chart: null, dragging: false }); }}
                                    onMouseLeave={() => { setChartSelection(s => s.dragging ? (s.start != null && s.end != null) ? { ...s, dragging: false } : { start: null, end: null, chart: null, dragging: false } : s); }}
                                >
                                    <defs>
                                        <linearGradient id="colorGrowthFs" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={fullscreenChart === 'growth' ? "#10b981" : "#3b82f6"} stopOpacity={0.2} />
                                            <stop offset="95%" stopColor={fullscreenChart === 'growth' ? "#10b981" : "#3b82f6"} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                    <XAxis dataKey="date" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatAxisDateNumeric} ticks={graphRange === 'ALL' ? numericYearTicks : null} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} minTickGap={30} />
                                    <YAxis width={60} axisLine={false} tickLine={false} tickFormatter={(v) => fullscreenChart === 'growth' ? `${v.toFixed(0)}%` : `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: '#9ca3af' }} domain={fullscreenChart === 'value' ? ['dataMin', 'dataMax'] : ['auto', 'auto']} />
                                    <Tooltip formatter={(v) => fullscreenChart === 'growth' ? `${v.toFixed(2)}%` : formatCurrency(v)} labelFormatter={formatAxisDateNumeric} />
                                    <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="3 3" />
                                    {showYearLines && numericYearTicks.map(timestamp => (<ReferenceLine key={timestamp} x={timestamp} stroke="#e5e7eb" />))}
                                    {(chartSelection.chart === fullscreenChart && chartSelection.start != null && chartSelection.end != null && !isMulti) && (
                                        <ReferenceArea x1={Math.min(chartSelection.start, chartSelection.end)} x2={Math.max(chartSelection.start, chartSelection.end)} strokeOpacity={0.1} fill={fullscreenChart === 'growth' ? "#10b981" : "#2563eb"} fillOpacity={0.1} />
                                    )}
                                    {isMulti
                                        ? sel.map((t, i) => (
                                            <Area key={`fs-${t}`} type="monotone" dataKey={t} stroke={COLORS[i % COLORS.length]} strokeWidth={1} fill="none" isAnimationActive={false} />
                                        ))
                                        : <>
                                            {fullscreenChart === 'value' && <Area type="step" dataKey="invested" stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 4" fill="none" isAnimationActive={false} />}
                                            <Area type="monotone" dataKey={fullscreenChart === 'growth' ? "value" : "value"} stroke={fullscreenChart === 'growth' ? "#10b981" : "#2563eb"} strokeWidth={1} fill="url(#colorGrowthFs)" isAnimationActive={false} />
                                        </>
                                    }
                                    {(!isMulti && settings.benchmarkTicker && fullscreenChart === 'growth') && (
                                        <Area type="monotone" dataKey="benchmark" stroke="#f59e0b" strokeWidth={1} fill="none" isAnimationActive={false} />
                                    )}
                                </AreaChart>
                            </ResponsiveContainer>
                            {/* Selection Overlay */}
                            {(chartSelection.chart === fullscreenChart && chartSelection.start != null && chartSelection.end != null && !isMulti) && (() => {
                                const startTs = Math.min(chartSelection.start, chartSelection.end);
                                const endTs = Math.max(chartSelection.start, chartSelection.end);
                                const data = fullscreenChart === 'growth' ? numericGrowthData : numericValueData;
                                const inRange = data.filter(d => d.date >= startTs && d.date <= endTs);
                                if (inRange.length < 2) return null;
                                const startVal = inRange[0].value;
                                const endVal = inRange[inRange.length - 1].value;
                                const abs = endVal - startVal;
                                const pct = startVal > 0 ? (abs / startVal) * 100 : 0;
                                return (
                                    <div className="absolute top-4 right-4 bg-white/95 backdrop-blur rounded-md border border-gray-200 shadow-sm px-3 py-2 flex items-center gap-2">
                                        <div className={`text-sm font-mono ${abs >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{abs >= 0 ? '+' : ''}{fullscreenChart === 'growth' ? `${abs.toFixed(2)}%` : formatCurrencyNoDecimals(abs)}</div>
                                        {fullscreenChart === 'value' && <div className={`text-xs font-mono ${pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>({pct.toFixed(2)}%)</div>}
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

            {/* TOP CARDS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-6">
                <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm flex flex-col justify-between min-w-0 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group" onClick={() => setShowAllocationModal(true)}>
                    <div className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1"><i className="ph ph-wallet"></i>Værdi</div>
                    <div className="mt-2"><div className="text-3xl font-bold text-gray-900 tracking-tight break-words">{formatCurrencyNoDecimals(calc.currentVal)}</div></div>
                </div>
                <div onClick={() => setShowLiquidationModal(true)} className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm flex flex-col justify-between min-w-0 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group">
                    <div className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1"><i className="ph ph-bank"></i>Værdi efter skat</div>
                    <div className="mt-2"><div className="text-3xl font-bold text-gray-900 tracking-tight break-words">{formatCurrencyNoDecimals(calc.currentVal - calc.currentTax)}</div></div>
                </div>
                <div onClick={() => setShowGainModal(true)} className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm flex flex-col justify-between min-w-0 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group relative">
                    <div className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1"><i className="ph ph-trend-up"></i>Samlet gevinst</div>
                    <div className="mt-2"><div className={`text-3xl font-bold tracking-tight ${allTimeGain >= 0 ? 'text-emerald-600' : 'text-rose-600'} break-words`}>{formatCurrencyNoDecimals(allTimeGain)}</div></div>
                </div>
                <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm flex flex-col justify-between min-w-0 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group" onClick={() => setShowMoversModal(true)}>
                    {/* MOVERS MODAL */}
                    {showMoversModal && (
                        <ModalPortal onBackdropClick={() => setShowMoversModal(false)}>
                            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                    <h3 className="font-bold text-gray-800 flex items-center gap-2"><i className="ph ph-arrow-up-right text-blue-600"></i> Top 3 bevægelser i dag</h3>
                                    <button onClick={() => setShowMoversModal(false)} className="text-gray-400 hover:text-gray-700"><i className="ph ph-x text-lg"></i></button>
                                </div>
                                <div className="p-4 space-y-3">
                                    {(() => {
                                        if (!calc.portfolio || !marketData) return <div className="text-center text-gray-400 italic py-8">Ingen aktive bevægelser i dag.</div>;
                                        const now = new Date();
                                        const tickerMap = {};
                                        Object.values(calc.portfolio).forEach(p => {
                                            const m = marketData[p.ticker] || {};
                                            const lastTrade = new Date((m.lastTradeTime || 0) * 1000);
                                            const isToday = lastTrade.getDate() === now.getDate() && lastTrade.getMonth() === now.getMonth() && lastTrade.getFullYear() === now.getFullYear();
                                            if (!isToday) return;
                                            const { val, prevVal } = getPositionValueWithPrev(p);
                                            const absMove = val - prevVal;
                                            if (!tickerMap[p.ticker]) tickerMap[p.ticker] = { ticker: p.ticker, absMove: 0, totalPrevVal: 0 };
                                            tickerMap[p.ticker].absMove += absMove;
                                            tickerMap[p.ticker].totalPrevVal += prevVal;
                                        });
                                        Object.values(tickerMap).forEach(t => { t.pctMove = t.totalPrevVal > 0 ? (t.absMove / t.totalPrevVal) * 100 : 0; });
                                        const movers = Object.values(tickerMap).sort((a, b) => Math.abs(b.absMove) - Math.abs(a.absMove)).slice(0, 3);
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
                    <div className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1"><i className="ph ph-arrow-up-right"></i>Gevinst/Tab i dag</div>
                    <div className="mt-2">
                        {(() => {
                            let todayGain = 0;
                            let todayPct = 0;
                            let activeCount = 0;
                            if (calc.portfolio && marketData) {
                                let totalVal = 0;
                                let totalPrevVal = 0;
                                const now = new Date();
                                Object.values(calc.portfolio).forEach(p => {
                                    const m = marketData[p.ticker] || {};
                                    const lastTrade = new Date((m.lastTradeTime || 0) * 1000);
                                    const isToday = lastTrade.getDate() === now.getDate() && lastTrade.getMonth() === now.getMonth() && lastTrade.getFullYear() === now.getFullYear();
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
                                <div className={`text-3xl font-bold tracking-tight ${activeCount === 0 ? 'text-gray-400' : (todayGain >= 0 ? 'text-emerald-600' : 'text-rose-600')} break-words`}>
                                    {activeCount > 0 ? formatCurrencyNoDecimals(todayGain) : "0 kr."}
                                    <span className={`text-lg font-bold ml-2 align-middle ${activeCount === 0 ? 'text-gray-400' : (todayPct >= 0 ? 'text-emerald-600' : 'text-rose-600')}`}>
                                        {activeCount > 0 ? `${todayPct.toFixed(2)}%` : ""}
                                    </span>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>

            {/* Performance by Year (Mobile) */}
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
                                <div className="flex justify-between items-center text-xs text-gray-500 mb-1">
                                    <span>Gevinst/Tab</span>
                                    <span className={`font-mono font-medium ${stat.gainAbs >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{stat.gainAbs > 0 ? '+' : ''}{formatCurrencyNoDecimals(stat.gainAbs)}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs text-gray-500">
                                    <span>Kapitalstrøm</span>
                                    <span className="font-mono font-medium">{stat.flow > 0 ? '+' : ''}{formatCurrencyNoDecimals(stat.flow)}</span>
                                </div>
                            </div>
                        ))}
                        {calc.yearlyStats.length === 0 && <div className="p-8 text-center text-gray-400 italic">Ingen data tilgængelig</div>}
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
                                <div className="hidden md:flex items-center gap-2">
                                    <RangeSelector />
                                    <TickerSelector />
                                    <select className="px-3 py-1 text-xs font-bold rounded-md bg-gray-100 border border-gray-200 cursor-pointer" value={settings.benchmarkTicker} onChange={e => { setSettings(s => ({ ...s, benchmarkTicker: e.target.value })); fetchMarketData(true); }}>
                                        {BENCHMARKS.map(b => (<option key={b.ticker} value={b.ticker}>{b.label}</option>))}
                                    </select>
                                </div>
                                <button className={`md:hidden p-2 rounded-md border flex items-center justify-center transition-colors ${showMobileGraphMenu ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`} onClick={() => setShowMobileGraphMenu(!showMobileGraphMenu)} title="Indstillinger">
                                    <i className="ph ph-sliders-horizontal text-lg"></i>
                                </button>
                                <button className="p-2 rounded-md border border-gray-200 bg-white hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors" onClick={() => setFullscreenChart('growth')} title="Fuld skærm">
                                    <i className="ph ph-arrows-out text-lg"></i>
                                </button>
                            </div>
                        </div>

                        {showMobileGraphMenu && (
                            <div className="md:hidden mb-4 p-4 bg-gray-50 rounded-lg border border-gray-100 flex flex-col gap-3 animate-in slide-in-from-top-2">
                                <div><span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Tidshorisont</span><div className="w-full"><RangeSelector /></div></div>
                                <div><span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Papirer</span><div className="w-full"><TickerSelector /></div></div>
                                <div><span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Benchmark</span><select className="w-full px-3 py-2 text-sm font-bold rounded-md bg-white border border-gray-200" value={settings.benchmarkTicker} onChange={e => { setSettings(s => ({ ...s, benchmarkTicker: e.target.value })); fetchMarketData(true); }}>{BENCHMARKS.map(b => (<option key={b.ticker} value={b.ticker}>{b.label}</option>))}</select></div>
                            </div>
                        )}

                        <div className={`relative h-64 w-full ${chartSelection.dragging ? 'select-none' : ''}`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={numericGrowthData}
                                    onMouseDown={(e) => { const se = e && e.sourceEvent; if (se && se.preventDefault) se.preventDefault(); if (e && e.activeLabel != null) setChartSelection({ start: e.activeLabel, end: null, chart: 'growth', dragging: true }); }}
                                    onMouseMove={(e) => { if (chartSelection.dragging && chartSelection.chart === 'growth' && e && e.activeLabel != null) setChartSelection(s => ({ ...s, end: e.activeLabel })); }}
                                    onMouseUp={() => { if (chartSelection.dragging && chartSelection.chart === 'growth' && chartSelection.start != null && chartSelection.end != null) setChartSelection(s => ({ ...s, dragging: false })); else setChartSelection({ start: null, end: null, chart: null, dragging: false }); }}
                                    onMouseLeave={() => { setChartSelection(s => s.dragging ? (s.start != null && s.end != null) ? { ...s, dragging: false } : { start: null, end: null, chart: null, dragging: false } : s); }}
                                >
                                    <defs>
                                        <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                    <XAxis dataKey="date" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatAxisDateNumeric} ticks={graphRange === 'ALL' ? numericYearTicks : null} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} minTickGap={30} />
                                    <YAxis width={45} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                                    <Tooltip formatter={(v) => `${v.toFixed(2)}%`} labelFormatter={formatAxisDateNumeric} />
                                    <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="3 3" />
                                    {showYearLines && numericYearTicks.map(timestamp => (<ReferenceLine key={timestamp} x={timestamp} stroke="#e5e7eb" />))}
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
                                <div className="hidden md:flex items-center gap-2">
                                    <RangeSelector />
                                    <TickerSelector />
                                </div>
                                <button className={`md:hidden p-2 rounded-md border flex items-center justify-center transition-colors ${showMobileGraphMenu ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`} onClick={() => setShowMobileGraphMenu(!showMobileGraphMenu)} title="Indstillinger">
                                    <i className="ph ph-sliders-horizontal text-lg"></i>
                                </button>
                                <button className="p-2 rounded-md border border-gray-200 bg-white hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors" onClick={() => setFullscreenChart('value')} title="Fuld skærm">
                                    <i className="ph ph-arrows-out text-lg"></i>
                                </button>
                            </div>
                        </div>

                        {showMobileGraphMenu && (
                            <div className="md:hidden mb-4 p-4 bg-gray-50 rounded-lg border border-gray-100 flex flex-col gap-3 animate-in slide-in-from-top-2">
                                <div><span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Tidshorisont</span><div className="w-full"><RangeSelector /></div></div>
                                <div><span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Papirer</span><div className="w-full"><TickerSelector /></div></div>
                            </div>
                        )}

                        <div className={`relative h-64 w-full ${chartSelection.dragging ? 'select-none' : ''}`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={numericValueData}
                                    onMouseDown={(e) => { const se = e && e.sourceEvent; if (se && se.preventDefault) se.preventDefault(); if (e && e.activeLabel != null) setChartSelection({ start: e.activeLabel, end: null, chart: 'value', dragging: true }); }}
                                    onMouseMove={(e) => { if (chartSelection.dragging && chartSelection.chart === 'value' && e && e.activeLabel != null) setChartSelection(s => ({ ...s, end: e.activeLabel })); }}
                                    onMouseUp={() => { if (chartSelection.dragging && chartSelection.chart === 'value' && chartSelection.start != null && chartSelection.end != null) setChartSelection(s => ({ ...s, dragging: false })); else setChartSelection({ start: null, end: null, chart: null, dragging: false }); }}
                                    onMouseLeave={() => { setChartSelection(s => s.dragging ? (s.start != null && s.end != null) ? { ...s, dragging: false } : { start: null, end: null, chart: null, dragging: false } : s); }}
                                >
                                    <defs>
                                        <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                    <XAxis dataKey="date" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatAxisDateNumeric} ticks={graphRange === 'ALL' ? numericYearTicks : null} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} minTickGap={30} />
                                    <YAxis width={45} axisLine={false} tickLine={false} domain={['dataMin', 'dataMax']} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                                    <Tooltip 
                                        formatter={(value, name) => [
                                            formatCurrency(value), 
                                            name === 'value' ? 'Værdi' : name === 'netValue' ? 'Efter Skat' : 'Indskud'
                                        ]} 
                                        labelFormatter={formatAxisDateNumeric} 
                                    />
                                    <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="3 3" />
                                    {showYearLines && numericYearTicks.map(timestamp => (<ReferenceLine key={timestamp} x={timestamp} stroke="#e5e7eb" />))}
                                    {(chartSelection.chart === 'value' && chartSelection.start != null && chartSelection.end != null && !isMulti) && (
                                        <ReferenceArea x1={Math.min(chartSelection.start, chartSelection.end)} x2={Math.max(chartSelection.start, chartSelection.end)} strokeOpacity={0.1} fill="#2563eb" fillOpacity={0.1} />
                                    )}
                                    {isMulti
                                        ? sel.map((t, i) => (
                                            <Area key={`v-${t}`} type="monotone" dataKey={t} stroke={COLORS[i % COLORS.length]} strokeWidth={1} fill="none" isAnimationActive={false} />
                                        ))
                                        : <>
                                            <Area type="step" dataKey="invested" name="invested" stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 4" fill="none" isAnimationActive={false} />
                                            <Area type="monotone" dataKey="value" name="value" stroke="#3b82f6" strokeWidth={1} fill="url(#colorVal)" isAnimationActive={false} />
                                            <Area type="monotone" dataKey="netValue" name="netValue" stroke="#10b981" strokeWidth={2} fill="url(#colorNet)" isAnimationActive={false} />
                                        </>
                                    }
                                </AreaChart>
                            </ResponsiveContainer>
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
                                    <div className="flex justify-between items-center text-xs text-gray-500 mb-1">
                                        <span>Gevinst/Tab</span>
                                        <span className={`font-mono font-medium ${stat.gainAbs >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{stat.gainAbs > 0 ? '+' : ''}{formatCurrencyNoDecimals(stat.gainAbs)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs text-gray-500">
                                        <span>Kapitalstrøm</span>
                                        <span className="font-mono font-medium cursor-help border-b border-dotted border-gray-300" title={`In: ${formatCurrencyNoDecimals(stat.breakdown.in)}\nOut: ${formatCurrencyNoDecimals(stat.breakdown.out)}`}>{stat.flow > 0 ? '+' : ''}{formatCurrencyNoDecimals(stat.flow)}</span>
                                    </div>
                                </div>
                            ))}
                            {calc.yearlyStats.length === 0 && <div className="p-8 text-center text-gray-400 italic">Ingen data tilgængelig</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardView;