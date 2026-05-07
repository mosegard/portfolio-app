import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceArea, LineChart, Line } from 'recharts';
import ModalPortal from '../ModalPortal';
import { formatCurrency, formatCurrencyNoDecimals } from '../../utils';
import useDashboardChartData from '../../hooks/useDashboardChartData';
import { AllocationModal, LiquidationModal, GainModal, MoversModal } from './DashboardModals';

// --- Pill-bar Range Selector ---
const RangeSelector = ({ value, onChange, years }) => {
    const ranges = [
        { key: '1M', label: '1M' },
        { key: '3M', label: '3M' },
        { key: 'YTD', label: 'YTD' },
        { key: '1Y', label: '1Å' },
        { key: 'ALL', label: 'Max' },
    ];
    const isCustom = value === 'CUSTOM';
    const isYear = !isCustom && !ranges.find(r => r.key === value);

    return (
        <div className="flex items-center gap-1">
            {isCustom && (
                <button className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-blue-600 text-white" onClick={() => onChange('ALL')}>
                    ZOOM ×
                </button>
            )}
            {ranges.map(r => (
                <button
                    key={r.key}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${value === r.key ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
                    onClick={() => onChange(r.key)}
                >
                    {r.label}
                </button>
            ))}
            {years.length > 0 && (
                <div className="relative">
                    <select
                        className={`appearance-none pl-2 pr-5 py-1 text-[11px] font-bold rounded-md border-0 cursor-pointer focus:outline-none ${isYear ? 'bg-gray-800 text-white' : 'bg-transparent text-gray-500 hover:text-gray-800'}`}
                        value={isYear ? value : ''}
                        onChange={e => { if (e.target.value) onChange(e.target.value); }}
                    >
                        <option value="" disabled>{isYear ? value : 'År'}</option>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1">
                        <i className={`ph ph-caret-down text-[9px] ${isYear ? 'text-white' : 'text-gray-400'}`}></i>
                    </div>
                </div>
            )}
        </div>
    );
};

const TickerSelector = ({ tickers, selected, onChange, COLORS }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const boxRef = useRef(null);
    useEffect(() => {
        if (!open) return;
        const onClick = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
        window.addEventListener('mousedown', onClick);
        return () => window.removeEventListener('mousedown', onClick);
    }, [open]);

    const filtered = query ? tickers.filter(t => t.toLowerCase().includes(query.toLowerCase())) : tickers;
    const toggle = (t) => onChange(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

    return (
        <div className="relative" ref={boxRef}>
            <button type="button" className="px-2.5 py-1 text-[11px] font-bold rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-all flex items-center gap-1" onClick={() => setOpen(o => !o)}>
                <i className="ph ph-chart-line-up"></i>
                {selected.length > 0 && <span className="bg-blue-100 text-blue-700 px-1.5 rounded-full text-[10px]">{selected.length}</span>}
            </button>
            {open && (
                <div className="absolute top-full right-0 mt-1 z-40 w-56 bg-white border border-gray-100 rounded-lg shadow-xl">
                    <div className="p-2 border-b border-gray-100">
                        <input type="text" className="w-full px-2 py-1.5 text-xs border border-gray-100 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="Søg ticker…" value={query} onChange={e => setQuery(e.target.value)} />
                    </div>
                    <div className="max-h-48 overflow-auto p-1">
                        {filtered.map((t, i) => (
                            <button key={t} className={`w-full text-left px-2.5 py-1.5 text-xs rounded-md flex items-center gap-2 ${selected.includes(t) ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`} onClick={() => toggle(t)}>
                                <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>
                                <span className="flex-1 font-medium">{t}</span>
                                {selected.includes(t) && <i className="ph ph-check text-blue-600"></i>}
                            </button>
                        ))}
                    </div>
                    {selected.length > 0 && (
                        <div className="p-2 border-t border-gray-100">
                            <button className="w-full px-2 py-1 text-xs rounded-md text-gray-500 hover:bg-gray-100" onClick={() => { onChange([]); setOpen(false); }}>Nulstil</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// --- Updated Shared Chart Component ---
const CommonChart = ({ type, data, chartSelection, onChartMouse, isMulti, selectedTickers, COLORS, graphRange, numericYearTicks, showYearLines, settings, showGross }) => (
    <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}
            onMouseDown={e => onChartMouse(e, type, 'down')}
            onMouseMove={e => onChartMouse(e, type, 'move')}
            onMouseUp={() => onChartMouse(null, type, 'up')}
            onMouseLeave={e => onChartMouse(e, type, 'leave')}
        >
            <defs>
                <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
            </defs>
            
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" opacity={1.0} />
            
            <XAxis 
                dataKey="date" 
                type="number" 
                domain={['dataMin', 'dataMax']} 
                tickFormatter={(ts) => {
                    if (!ts) return '';
                    const d = new Date(ts);
                    const day = d.getDate();
                    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'][d.getMonth()];
                    const year = d.getFullYear();
                    return graphRange === 'ALL' ? `${month} ${year}` : `${day}. ${month}`;
                }} 
                ticks={graphRange === 'ALL' ? numericYearTicks : null} 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#9ca3af' }} 
                minTickGap={40} 
            />
            
            <YAxis 
                width={45} 
                axisLine={false} 
                tickLine={false} 
                domain={['auto', 'auto']} 
                tickCount={8} 
                tickFormatter={(v) => {
                    if (type !== 'value') return `${v.toFixed(0)}%`;
                    if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1).replace('.0', '')}m`;
                    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`;
                    return v;
                }} 
                tick={{ fontSize: 10, fill: '#9ca3af' }} 
            />

            <Tooltip 
                formatter={(v, n) => [type === 'value' ? formatCurrency(v) : `${v.toFixed(2)}%`, n === 'netValue' ? 'Efter Skat' : n === 'value' ? (type === 'value' ? 'Før Skat' : 'Portefølje') : n === 'benchmark' ? 'Benchmark' : n]} 
                labelFormatter={(ts) => {
                    if (!ts) return '';
                    const d = new Date(ts);
                    return `${d.getDate()}. ${['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][d.getMonth()]} ${d.getFullYear()}`;
                }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
            />
            
            <ReferenceLine y={0} stroke="#d1d5db" strokeWidth={1} />
            
            {showYearLines && numericYearTicks.map(t => <ReferenceLine key={t} x={t} stroke="#e5e7eb" />)}

            {chartSelection.chart === type && chartSelection.start && chartSelection.end && !isMulti && (
                <ReferenceArea x1={Math.min(chartSelection.start, chartSelection.end)} x2={Math.max(chartSelection.start, chartSelection.end)} strokeOpacity={0.1} fill={type === 'growth' ? "#10b981" : "#2563eb"} fillOpacity={0.08} />
            )}

            {isMulti ? selectedTickers.map((t, i) => (
                <Area key={t} type="monotone" dataKey={t} stroke={COLORS[i % COLORS.length]} strokeWidth={1.5} fill="none" isAnimationActive={false} />
            )) : (
                type === 'value' ? (
                    <>
                        <Area type="step" dataKey="invested" name="Indskud" stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 4" fill="none" isAnimationActive={false} />
                        {showGross && (
                            <Area type="monotone" dataKey="value" name="value" stroke="#3b82f6" strokeWidth={1.5} fill="url(#colorVal)" isAnimationActive={false} />
                        )}
                        <Area type="monotone" dataKey="netValue" name="netValue" stroke="#10b981" strokeWidth={1.5} fill="url(#colorNet)" isAnimationActive={false} />
                    </>
                ) : (
                    <>
                        <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={1.5} fill="url(#colorGrowth)" isAnimationActive={false} />
                        {settings.benchmarkTicker && <Area type="monotone" dataKey="benchmark" name="benchmark" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 3" fill="none" isAnimationActive={false} />}
                    </>
                )
            )}
        </AreaChart>
    </ResponsiveContainer>
);

// --- Year-over-Year Chart ---
const YOY_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f43f5e', '#0ea5e9', '#84cc16', '#d946ef'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

const YearOverYearChart = ({ yoyData, selectedYears, years }) => {
    if (!yoyData || !yoyData.data || yoyData.data.length === 0) {
        return <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">Ingen data</div>;
    }
    
    const displayYears = selectedYears.length > 0 ? selectedYears : yoyData.years;
    
    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={yoyData.data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                    dataKey="dayOfYear" 
                    type="number" 
                    domain={[0, 365]} 
                    tickFormatter={(d) => MONTH_LABELS[Math.floor(d / 30.44)] || ''}
                    ticks={[0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]}
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#9ca3af' }} 
                />
                <YAxis 
                    width={45} 
                    axisLine={false} 
                    tickLine={false} 
                    tickFormatter={(v) => `${v.toFixed(0)}%`} 
                    tick={{ fontSize: 10, fill: '#9ca3af' }} 
                />
                <Tooltip 
                    formatter={(v, name) => [`${v.toFixed(2)}%`, name]}
                    labelFormatter={(d) => {
                        const month = MONTH_LABELS[Math.floor(d / 30.44)] || '';
                        const dayInMonth = Math.round(d % 30.44) + 1;
                        return `~${dayInMonth}. ${month}`;
                    }}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                />
                <ReferenceLine y={0} stroke="#d1d5db" strokeWidth={1} />
                {displayYears.map((year, i) => (
                    <Line 
                        key={year} 
                        type="monotone" 
                        dataKey={year} 
                        stroke={YOY_COLORS[i % YOY_COLORS.length]} 
                        strokeWidth={year === String(new Date().getFullYear()) ? 2.5 : 1.5}
                        strokeOpacity={year === String(new Date().getFullYear()) ? 1 : 0.7}
                        dot={false} 
                        isAnimationActive={false} 
                    />
                ))}
            </LineChart>
        </ResponsiveContainer>
    );
};

// --- Main Component ---
const DashboardView = ({ calc, marketData, settings, setSettings, fetchMarketData, uniqueTickers, years }) => {
    const [graphRange, setGraphRange] = useState('ALL');
    const [customRange, setCustomRange] = useState({ startIso: '', endIso: '' });
    const [chartSelection, setChartSelection] = useState({ start: null, end: null, chart: null, dragging: false });
    const [fullscreenChart, setFullscreenChart] = useState(null);
    const [selectedTickers, setSelectedTickers] = useState([]);
    
    // Chart mode: 'growth' | 'value' | 'yoy'
    const [chartMode, setChartMode] = useState('growth');
    
    // Year-over-year: which years to highlight
    const [yoySelectedYears, setYoySelectedYears] = useState([]);
    
    // UI Setting: Default to NOT showing gross value
    const [showGross, setShowGross] = useState(false);
    
    // Modal Visibility State
    const [modals, setModals] = useState({ movers: false, liquidation: false, allocation: false, gain: false });
    const toggleModal = (key, val) => setModals(prev => ({ ...prev, [key]: val }));

    // Use Custom Hook for Data Logic
    const { 
        todayStats, numericValueData, numericGrowthData, yoyData, getFxRate, getPositionValueWithPrev 
    } = useDashboardChartData(calc, marketData, settings, graphRange, customRange, selectedTickers);

    // --- Chart Formatters ---
    const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f43f5e', '#84cc16'];
    
    // Calculate Numeric Ticks for XAxis
    const numericYearTicks = years.map(y => new Date(`${y}-01-01`).getTime()).filter(t => !isNaN(t)).sort((a,b) => a-b);
    const showYearLines = graphRange === 'ALL';

    // Summary Stats
    const reports = calc.reports || {};
    const bd = Object.values(reports).reduce((acc, r) => ({
        stocks: acc.stocks + (r.rubrik66 || 0),
        etfs: acc.etfs + (r.rubrik38 || 0),
        divs: acc.divs + (r.rubrik61 || 0) + (r.rubrik63 || 0),
        capital: acc.capital + (r.rubrik345 || 0),
        ask: acc.ask + (r.askGain || 0),
    }), { stocks: 0, etfs: 0, divs: 0, capital: 0, ask: 0 });
    const allTimeGain = bd.stocks + bd.etfs + bd.divs + bd.capital + bd.ask + (calc.unrealizedStockGain || 0);

    const breakdownData = [
        { label: 'Realiseret Aktiegevinst', val: bd.stocks, icon: 'ph-trend-up', color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'Lagerbeskattet ETF', val: bd.etfs, icon: 'ph-buildings', color: 'text-purple-600', bg: 'bg-purple-50' },
        { label: 'Udbytter', val: bd.divs, icon: 'ph-coins', color: 'text-green-600', bg: 'bg-green-50' },
        { label: 'Kapitalindkomst', val: bd.capital, icon: 'ph-bank', color: 'text-orange-600', bg: 'bg-orange-50' },
        { label: 'Aktiesparekonto', val: bd.ask, icon: 'ph-piggy-bank', color: 'text-teal-600', bg: 'bg-teal-50' },
        { label: 'Urealiseret (Aktier)', val: calc.unrealizedStockGain, icon: 'ph-hourglass', color: 'text-gray-600', bg: 'bg-gray-100', italic: true }
    ];

    // Benchmarks List
    const BENCHMARKS = [
        { label: 'Ingen', ticker: '' },
        { label: 'ACWI', ticker: 'SPYY.DE' },
        { label: 'World', ticker: 'URTH' },
        { label: 'Europa', ticker: 'XEU.TO' },
        { label: 'S&P 500', ticker: '^GSPC' },
        { label: 'NASDAQ', ticker: '^NDX' },
        { label: 'Dow Jones', ticker: '^DJI' },
        { label: 'C25', ticker: '^OMXC25' },
    ];
    const benchLabel = (BENCHMARKS.find(b => b.ticker === settings.benchmarkTicker) || BENCHMARKS[0]).label;
    const isMulti = selectedTickers.length > 1;

    // --- Chart Drag Handlers ---
    useEffect(() => {
        if (!chartSelection.dragging) return;
        const onUp = () => setChartSelection(s => (s.start && s.end) ? { ...s, dragging: false } : { start: null, end: null, chart: null, dragging: false });
        window.addEventListener('mouseup', onUp);
        document.body.style.userSelect = 'none';
        return () => { window.removeEventListener('mouseup', onUp); document.body.style.userSelect = ''; };
    }, [chartSelection.dragging]);

    const handleChartMouse = (e, chartType, eventType) => {
        if (fullscreenChart && chartType !== fullscreenChart) return;
        
        if (eventType === 'down' && e && e.activeLabel) {
            const se = e && e.sourceEvent; if (se && se.preventDefault) se.preventDefault();
            setChartSelection({ start: e.activeLabel, end: null, chart: chartType, dragging: true });
        } else if (eventType === 'move' && chartSelection.dragging && chartSelection.chart === chartType && e && e.activeLabel) {
            setChartSelection(s => ({ ...s, end: e.activeLabel }));
        } else if (eventType === 'up') {
            setChartSelection(s => s.dragging ? { ...s, dragging: false } : s);
        } else if (eventType === 'leave') {
             setChartSelection(s => s.dragging ? (s.start && s.end ? { ...s, dragging: false } : { start: null, end: null, chart: null, dragging: false }) : s);
        }
    };

    // --- Zoom Selection Strip (below chart, not floating over it) ---
    const renderZoomStrip = (type, data) => {
        if (chartSelection.chart !== type || !chartSelection.start || !chartSelection.end || isMulti) return null;
        const startTs = Math.min(chartSelection.start, chartSelection.end);
        const endTs = Math.max(chartSelection.start, chartSelection.end);
        const inRange = data.filter(d => d.date >= startTs && d.date <= endTs);
        if (inRange.length < 2) return null;
        const startVal = inRange[0].value;
        const endVal = inRange[inRange.length - 1].value;
        const abs = endVal - startVal;
        const pct = startVal > 0 ? (abs / startVal) * 100 : 0;

        const startDate = new Date(startTs);
        const endDate = new Date(endTs);
        const fmtDate = (d) => `${d.getDate()}/${d.getMonth() + 1}`;

        return (
            <div className="mt-2 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-gray-500">
                    <span className="font-medium">{fmtDate(startDate)} → {fmtDate(endDate)}</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`font-bold font-mono ${abs >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {abs >= 0 ? '+' : ''}{type === 'growth' ? `${abs.toFixed(2)}%` : formatCurrencyNoDecimals(abs)}
                        {type === 'value' && <span className="ml-1 font-normal">({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</span>}
                    </span>
                    <button className="px-2 py-0.5 rounded border border-gray-200 hover:bg-white text-gray-600 font-medium" onClick={() => {
                        setCustomRange({ startIso: new Date(startTs).toISOString().split('T')[0], endIso: new Date(endTs).toISOString().split('T')[0] });
                        setGraphRange('CUSTOM');
                        setChartSelection({ start: null, end: null, chart: null, dragging: false });
                    }}>
                        <i className="ph ph-magnifying-glass-plus mr-1"></i>Zoom
                    </button>
                    <button className="px-2 py-0.5 rounded border border-gray-200 hover:bg-white text-gray-400" onClick={() => setChartSelection({ start: null, end: null, chart: null, dragging: false })}>
                        <i className="ph ph-x"></i>
                    </button>
                </div>
            </div>
        );
    };

    // Toggle a YOY year
    const toggleYoyYear = (year) => {
        setYoySelectedYears(prev => prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]);
    };

    return (
        <div className="p-6 md:p-8 space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
            
            {/* --- MODALS --- */}
            {modals.allocation && <AllocationModal onClose={() => toggleModal('allocation', false)} portfolio={calc.portfolio} marketData={marketData} getFxRate={getFxRate} />}
            {modals.liquidation && <LiquidationModal onClose={() => toggleModal('liquidation', false)} liq={calc.liquidation} />}
            {modals.gain && <GainModal onClose={() => toggleModal('gain', false)} breakdown={breakdownData} total={allTimeGain} />}
            {modals.movers && <MoversModal onClose={() => toggleModal('movers', false)} portfolio={calc.portfolio} marketData={marketData} getPositionValueWithPrev={getPositionValueWithPrev} />}

            {/* --- FULLSCREEN MODAL --- */}
            {fullscreenChart && (
                <ModalPortal onBackdropClick={() => setFullscreenChart(null)} backdropClassName="fixed inset-0 z-50 flex items-center justify-center p-0 bg-black/60">
                    <div className="w-screen h-screen bg-white flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="h-14 px-4 border-b border-gray-200 flex items-center justify-between bg-white">
                            <div className="flex items-center gap-3">
                                <RangeSelector value={graphRange} onChange={setGraphRange} years={years} />
                                {fullscreenChart === 'growth' && !isMulti && settings.benchmarkTicker && (() => {
                                    const last = numericGrowthData[numericGrowthData.length - 1];
                                    const diff = (last?.value ?? 0) - (last?.benchmark ?? 0);
                                    if (!isFinite(diff)) return null;
                                    return <span className={`text-xs font-mono px-2 py-0.5 rounded ${diff >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>vs {benchLabel}: {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%</span>;
                                })()}
                            </div>
                            <div className="flex items-center gap-2">
                                <TickerSelector tickers={uniqueTickers} selected={selectedTickers} onChange={setSelectedTickers} COLORS={COLORS} />
                                {fullscreenChart === 'growth' && (
                                    <select className="px-2 py-1 text-[11px] font-bold rounded-md bg-gray-50 border border-gray-200 cursor-pointer focus:outline-none" value={settings.benchmarkTicker} onChange={e => { setSettings(s => ({ ...s, benchmarkTicker: e.target.value })); fetchMarketData(true); }}>
                                        {BENCHMARKS.map(b => (<option key={b.ticker} value={b.ticker}>{b.label}</option>))}
                                    </select>
                                )}
                                {fullscreenChart === 'value' && (
                                    <button className={`px-2 py-1 text-[11px] font-bold rounded-md ${showGross ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`} onClick={() => setShowGross(!showGross)}>
                                        Brutto
                                    </button>
                                )}
                                <button className="px-3 py-1.5 text-xs rounded-md bg-gray-800 text-white hover:bg-gray-700 font-medium" onClick={() => setFullscreenChart(null)}>Luk</button>
                            </div>
                        </div>
                        <div className="flex-1 p-4">
                            <CommonChart 
                                type={fullscreenChart} 
                                data={fullscreenChart === 'growth' ? numericGrowthData : numericValueData}
                                chartSelection={chartSelection}
                                onChartMouse={handleChartMouse}
                                isMulti={isMulti}
                                selectedTickers={selectedTickers}
                                COLORS={COLORS}
                                graphRange={graphRange}
                                numericYearTicks={numericYearTicks}
                                showYearLines={showYearLines}
                                settings={settings}
                                showGross={showGross}
                            />
                        </div>
                        {renderZoomStrip(fullscreenChart, fullscreenChart === 'growth' ? numericGrowthData : numericValueData)}
                    </div>
                </ModalPortal>
            )}

            {/* --- CARDS --- */}
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                <div onClick={() => toggleModal('liquidation', true)} className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm flex flex-col justify-between cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group">
                    <div className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1"><i className="ph ph-bank"></i>Værdi efter skat</div>
                    <div className="mt-2"><div className="text-3xl font-bold text-gray-900 tracking-tight">{formatCurrencyNoDecimals(calc.currentVal - calc.currentTax)}</div></div>
                </div>
                <div onClick={() => toggleModal('gain', true)} className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm flex flex-col justify-between cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group">
                    <div className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1"><i className="ph ph-trend-up"></i>Samlet gevinst</div>
                    <div className="mt-2"><div className={`text-3xl font-bold tracking-tight ${allTimeGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrencyNoDecimals(allTimeGain)}</div></div>
                </div>
                <div onClick={() => toggleModal('movers', true)} className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm flex flex-col justify-between cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group">
                    <div className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1"><i className="ph ph-arrow-up-right"></i>Gevinst/Tab i dag</div>
                    <div className="mt-2">
                        <div className={`text-3xl font-bold tracking-tight ${todayStats.activeCount === 0 ? 'text-gray-400' : (todayStats.todayGain >= 0 ? 'text-emerald-600' : 'text-rose-600')}`}>
                            {todayStats.activeCount > 0 ? formatCurrencyNoDecimals(todayStats.todayGain) : "0 kr."}
                            <span className="text-lg font-bold ml-2 align-middle">{todayStats.activeCount > 0 ? `${todayStats.todayPct.toFixed(2)}%` : ""}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- CHARTS LAYOUT --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    
                    {/* Chart Container */}
                    <div className="bg-white p-4 rounded-xl shadow-sm">
                        {/* Chart Mode Tabs + Controls */}
                        <div className="flex flex-col gap-3 mb-4">
                            <div className="flex items-center justify-between">
                                {/* Mode tabs */}
                                <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                                    {[
                                        { key: 'growth', label: 'Afkast', icon: 'ph-trend-up' },
                                        { key: 'value', label: 'Værdi', icon: 'ph-chart-line' },
                                        { key: 'yoy', label: 'År vs. År', icon: 'ph-calendar-blank' },
                                    ].map(tab => (
                                        <button
                                            key={tab.key}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${chartMode === tab.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                            onClick={() => setChartMode(tab.key)}
                                        >
                                            <i className={`ph ${tab.icon} text-sm`}></i>
                                            <span className="hidden sm:inline">{tab.label}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* Right actions */}
                                <div className="flex items-center gap-1">
                                    {chartMode !== 'yoy' && (
                                        <TickerSelector tickers={uniqueTickers} selected={selectedTickers} onChange={setSelectedTickers} COLORS={COLORS} />
                                    )}
                                    {chartMode === 'value' && (
                                        <button 
                                            className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all ${showGross ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`} 
                                            onClick={() => setShowGross(!showGross)}
                                            title={showGross ? "Skjul brutto" : "Vis brutto"}
                                        >
                                            <i className={`ph ${showGross ? 'ph-eye' : 'ph-eye-slash'}`}></i>
                                        </button>
                                    )}
                                    <button 
                                        className="px-2 py-1 text-[11px] rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all" 
                                        onClick={() => setFullscreenChart(chartMode === 'yoy' ? 'growth' : chartMode)}
                                    >
                                        <i className="ph ph-arrows-out text-sm"></i>
                                    </button>
                                </div>
                            </div>

                            {/* Controls row */}
                            <div className="flex items-center justify-between">
                                {chartMode !== 'yoy' ? (
                                    <RangeSelector value={graphRange} onChange={setGraphRange} years={years} />
                                ) : (
                                    <div className="flex items-center gap-1 flex-wrap">
                                        {(yoyData?.years || []).map((year, i) => (
                                            <button
                                                key={year}
                                                className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-all border ${
                                                    yoySelectedYears.length === 0 || yoySelectedYears.includes(year) 
                                                        ? 'border-transparent text-white' 
                                                        : 'border-gray-200 text-gray-400 hover:text-gray-600 bg-white'
                                                }`}
                                                style={yoySelectedYears.length === 0 || yoySelectedYears.includes(year) ? { backgroundColor: YOY_COLORS[i % YOY_COLORS.length] } : {}}
                                                onClick={() => toggleYoyYear(year)}
                                            >
                                                {year}
                                            </button>
                                        ))}
                                        {yoySelectedYears.length > 0 && (
                                            <button className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-600 rounded" onClick={() => setYoySelectedYears([])}>Vis alle</button>
                                        )}
                                    </div>
                                )}

                                {/* Benchmark selector (only for growth mode) */}
                                {chartMode === 'growth' && !isMulti && (
                                    <div className="flex items-center gap-1">
                                        {BENCHMARKS.slice(0, 5).map(b => (
                                            <button
                                                key={b.ticker}
                                                className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${
                                                    settings.benchmarkTicker === b.ticker 
                                                        ? (b.ticker ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500')
                                                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                                                }`}
                                                onClick={() => { setSettings(s => ({ ...s, benchmarkTicker: b.ticker })); if (b.ticker) fetchMarketData(true); }}
                                            >
                                                {b.label}
                                            </button>
                                        ))}
                                        <div className="relative">
                                            <select
                                                className="appearance-none pl-1.5 pr-4 py-0.5 text-[10px] font-bold rounded bg-transparent text-gray-400 cursor-pointer focus:outline-none hover:text-gray-600"
                                                value={BENCHMARKS.slice(5).find(b => b.ticker === settings.benchmarkTicker) ? settings.benchmarkTicker : ''}
                                                onChange={e => { if (e.target.value !== undefined) { setSettings(s => ({ ...s, benchmarkTicker: e.target.value })); fetchMarketData(true); }}}
                                            >
                                                <option value="" disabled>Mere…</option>
                                                {BENCHMARKS.slice(5).map(b => <option key={b.ticker} value={b.ticker}>{b.label}</option>)}
                                            </select>
                                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-0.5">
                                                <i className="ph ph-dots-three text-[10px] text-gray-400"></i>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Chart area */}
                        <div className="h-72 w-full">
                            {chartMode === 'yoy' ? (
                                <YearOverYearChart yoyData={yoyData} selectedYears={yoySelectedYears} years={years} />
                            ) : (
                                <CommonChart 
                                    type={chartMode} 
                                    data={chartMode === 'growth' ? numericGrowthData : numericValueData}
                                    chartSelection={chartSelection}
                                    onChartMouse={handleChartMouse}
                                    isMulti={isMulti}
                                    selectedTickers={selectedTickers}
                                    COLORS={COLORS}
                                    graphRange={graphRange}
                                    numericYearTicks={numericYearTicks}
                                    showYearLines={showYearLines}
                                    settings={settings}
                                    showGross={showGross}
                                />
                            )}
                        </div>

                        {/* Zoom strip below chart */}
                        {chartMode !== 'yoy' && renderZoomStrip(chartMode, chartMode === 'growth' ? numericGrowthData : numericValueData)}
                        
                        {/* Benchmark comparison note */}
                        {chartMode === 'growth' && !isMulti && settings.benchmarkTicker && (() => {
                            const last = numericGrowthData[numericGrowthData.length - 1];
                            if (!last) return null;
                            const portfolio = last.value ?? 0;
                            const bench = last.benchmark ?? 0;
                            const diff = portfolio - bench;
                            if (!isFinite(diff)) return null;
                            return (
                                <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 rounded bg-emerald-500"></span>Portefølje: <span className="font-mono font-medium text-gray-700">{portfolio.toFixed(2)}%</span></span>
                                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 rounded bg-amber-500 opacity-70" style={{borderTop: '1px dashed'}}></span>{benchLabel}: <span className="font-mono font-medium text-gray-700">{bench.toFixed(2)}%</span></span>
                                    <span className={`font-mono font-bold ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{diff >= 0 ? '+' : ''}{diff.toFixed(2)}%</span>
                                </div>
                            );
                        })()}

                        {/* Active ticker chips */}
                        {selectedTickers.length > 0 && chartMode !== 'yoy' && (
                            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                                {selectedTickers.map((t, i) => (
                                    <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600">
                                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>
                                        {t}
                                        <button className="ml-0.5 text-gray-400 hover:text-gray-600" onClick={() => setSelectedTickers(prev => prev.filter(x => x !== t))}>×</button>
                                    </span>
                                ))}
                                <button className="text-[10px] text-gray-400 hover:text-gray-600 px-1" onClick={() => setSelectedTickers([])}>Ryd alle</button>
                            </div>
                        )}
                    </div>
                </div>

                {/* --- STATS TABLE --- */}
                <div className="hidden lg:block">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden sticky top-6">
                        <div className="p-4 border-b border-gray-100 bg-gray-50">
                            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Afkast pr. år</h3>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {(!calc.yearlyStats || calc.yearlyStats.length === 0) ? <div className="p-8 text-center text-gray-400 italic">Ingen data</div> : calc.yearlyStats.map(stat => (
                                <div key={stat.year} className="p-4 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => { setChartMode('growth'); setGraphRange(String(stat.year)); }}>
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
                        </div>
                    </div>
                </div>
            </div>
            {/* Mobile Stats Table */}
            <div className="block lg:hidden mt-8">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50"><h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Afkast pr. år</h3></div>
                    <div className="divide-y divide-gray-100">
                        {(calc.yearlyStats || []).map(stat => (
                            <div key={stat.year} className="p-4 hover:bg-gray-50 cursor-pointer" onClick={() => { setChartMode('growth'); setGraphRange(String(stat.year)); }}>
                                <div className="flex justify-between"><span className="font-bold">{stat.year}</span><span className={stat.return >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{stat.return > 0 ? '+' : ''}{stat.return.toFixed(2)}%</span></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardView;