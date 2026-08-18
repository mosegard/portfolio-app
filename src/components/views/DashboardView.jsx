import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceArea, LineChart, Line } from 'recharts';
import ModalPortal from '../ModalPortal';
import { formatCurrency, formatCurrencyNoDecimals } from '../../utils';
import useDashboardChartData from '../../hooks/useDashboardChartData';
import { AllocationModal, LiquidationModal, GainModal, MoversModal, TaxBreakdownModal } from './DashboardModals';

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
        <div className="flex items-center gap-1 flex-wrap min-w-0">
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
                <div className="relative hidden sm:block">
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

// --- Animated Value Component ---
const AnimatedValue = ({ value, formatter, className = "", showTrend = true, suffix = null }) => {
    const [display, setDisplay] = useState(value);
    const [diff, setDiff] = useState(0);

    useEffect(() => {
        if (value === display) return;
        const startVal = display;
        const endVal = value;
        const diffVal = endVal - startVal;
        
        setDiff(diffVal);
        
        const duration = 1000;
        const start = performance.now();
        
        let req;
        const tick = (now) => {
            const p = Math.min((now - start) / duration, 1);
            const ease = 1 - Math.pow(1 - p, 4); // easeOutQuart
            setDisplay(startVal + (endVal - startVal) * ease);
            if (p < 1) req = requestAnimationFrame(tick);
            else setDisplay(endVal);
        };
        req = requestAnimationFrame(tick);
        
        const timer = setTimeout(() => setDiff(0), 4000);
        return () => { cancelAnimationFrame(req); clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
        <div className={`flex items-center ${className}`}>
            <span>
                {formatter ? formatter(display) : display}
                {suffix}
            </span>
            {showTrend && Math.abs(diff) > 0.01 && (
                <span className={`ml-2 flex items-center text-sm font-bold animate-in slide-in-from-bottom-2 fade-in duration-300 ${diff > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    <i className={`ph ${diff > 0 ? 'ph-arrow-up-right' : 'ph-arrow-down-right'}`}></i>
                    {formatter ? formatter(Math.abs(diff)) : Math.abs(diff).toFixed(2)}
                </span>
            )}
        </div>
    );
};

// --- Updated Shared Chart Component ---
// Recharts has no built-in touch support - its tooltip only reacts to real mouse
// events. Re-dispatching each touch move as a synthetic mousemove lets the same
// hover/tooltip behavior work with a finger, and touch-action:none stops the page
// from scrolling underneath while the user scrubs across the chart.
const dispatchSyntheticMouseMove = (touch) => {
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    target?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: touch.clientX, clientY: touch.clientY }));
};

const CommonChart = ({ type, data, chartSelection, onChartMouse, isMulti, selectedTickers, COLORS, graphRange, numericYearTicks, showYearLines, settings, showGross, showInvested }) => (
    <div
        className="w-full h-full touch-none"
        onTouchStart={e => e.touches[0] && dispatchSyntheticMouseMove(e.touches[0])}
        onTouchMove={e => e.touches[0] && dispatchSyntheticMouseMove(e.touches[0])}
    >
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
                tickFormatter={(v) => {
                    if (type !== 'value') return `${v.toFixed(0)}%`;
                    if (Math.abs(v) >= 1000000) return `${Number((v / 1000000).toFixed(2))}m`;
                    if (Math.abs(v) >= 1000) return `${Number((v / 1000).toFixed(1))}k`;
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
                        {showInvested && (
                            <Area type="step" dataKey="invested" name="Indskud" stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 4" fill="none" isAnimationActive={false} />
                        )}
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
    </div>
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
const DashboardView = ({ calc, marketData, settings, setSettings, uniqueTickers, years }) => {
    const [graphRange, setGraphRange] = useState('1Y');
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
    const [showInvested, setShowInvested] = useState(false);
    
    // Modal Visibility State
    const [modals, setModals] = useState({ movers: false, liquidation: false, allocation: false, gain: false, taxBreakdown: false });
    const toggleModal = (key, val) => setModals(prev => ({ ...prev, [key]: val }));

    // On phones, size the chart to exactly fill the space down to the bottom of the
    // screen (app-like feel) instead of leaving a gap. Measured in JS (not CSS %
    // height) since the chart sits inside a scrollable flex chain where percentage
    // heights don't reliably resolve. Only recomputed on resize/orientation/content
    // reflow - never on data ticks - so live price updates can't shift the chart.
    const rootRef = useRef(null);
    const chartAreaRef = useRef(null);
    const [mobileChartHeight, setMobileChartHeight] = useState(null);
    useLayoutEffect(() => {
        const MIN_HEIGHT = 220;
        // Self-correcting: measure how far the page's actual bottom edge is from the
        // viewport bottom (using whatever chart height is CURRENTLY applied) and
        // adjust by exactly that overshoot/gap, rather than guessing a fixed margin
        // constant (unreliable - actual trailing space depends on padding/space-y
        // internals we don't want to hardcode).
        const recalc = () => {
            if (window.innerWidth >= 640 || !chartAreaRef.current || !rootRef.current) {
                setMobileChartHeight(null);
                return;
            }
            const currentHeight = chartAreaRef.current.getBoundingClientRect().height;
            const overshoot = rootRef.current.getBoundingClientRect().bottom - window.innerHeight;
            const target = Math.round(currentHeight - overshoot);
            setMobileChartHeight(prev => {
                const next = Math.max(MIN_HEIGHT, target);
                // Avoid a redundant state update (and therefore an extra ResizeObserver
                // round-trip) once we've converged within a pixel of rounding noise.
                return prev != null && Math.abs(prev - next) <= 1 ? prev : next;
            });
        };
        recalc();
        // A couple of follow-up passes catch late reflow (icon font swap-in, first
        // real data replacing placeholder values) without ever running on a timer.
        const raf = requestAnimationFrame(recalc);
        const timer = setTimeout(recalc, 400);
        // Observe the whole page's content (not just the chart card) so a height
        // change ANYWHERE above the chart (e.g. the hero numbers) re-triggers this.
        const ro = new ResizeObserver(recalc);
        if (rootRef.current) ro.observe(rootRef.current);
        window.addEventListener('resize', recalc);
        window.addEventListener('orientationchange', recalc);
        return () => {
            cancelAnimationFrame(raf);
            clearTimeout(timer);
            ro.disconnect();
            window.removeEventListener('resize', recalc);
            window.removeEventListener('orientationchange', recalc);
        };
    }, []);

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
    const allTimeGainAfterTax = allTimeGain - (calc.liquidation?.totalTaxBurden || 0);
    // No day-level tax event actually occurs - this is an estimate using the overall effective tax rate.
    const todayGainAfterTax = todayStats.todayGain * (1 - (calc.liquidation?.effectiveTaxRate || 0) / 100);

    // Stable "today" badge text/colors (mobile hero) - always rendered, same shape,
    // regardless of sign/data availability, so it never shifts other content around.
    const todayHasData = todayStats.activeCount > 0;
    const todayIsPositive = todayGainAfterTax > 0;
    const todayIsNegative = todayGainAfterTax < 0;
    const todayBadgeClasses = !todayHasData
        ? 'bg-gray-100 text-gray-400'
        : todayIsPositive ? 'bg-emerald-50 text-emerald-700' : todayIsNegative ? 'bg-rose-50 text-rose-700' : 'bg-gray-100 text-gray-500';
    const todayBadgeIcon = !todayHasData ? 'ph-minus' : todayIsPositive ? 'ph-arrow-up-right' : todayIsNegative ? 'ph-arrow-down-right' : 'ph-minus';
    const todaySign = todayIsPositive ? '+' : '';

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

    // Desktop-only drag-to-zoom (click+drag to select a range). On touch devices this
    // is replaced by a simple tap/scrub to read values via Recharts' own tooltip -
    // dragging a selection box isn't discoverable/intuitive with a finger, so we skip
    // it entirely for touch input (and just stop the page from scrolling underneath
    // the chart while the user is scrubbing across it).
    const handleChartMouse = (e, chartType, eventType) => {
        if (fullscreenChart && chartType !== fullscreenChart) return;

        const se = e && e.sourceEvent;
        const isTouch = !!se && (se.type?.startsWith('touch') || se.touches !== undefined);
        if (isTouch) {
            if ((eventType === 'down' || eventType === 'move') && se.cancelable) se.preventDefault();
            return;
        }

        if (eventType === 'down' && e && e.activeLabel) {
            if (se && se.preventDefault) se.preventDefault();
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
        <div ref={rootRef} className="p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
            
            {/* --- MODALS --- */}
            {modals.allocation && <AllocationModal onClose={() => toggleModal('allocation', false)} portfolio={calc.portfolio} marketData={marketData} getFxRate={getFxRate} />}
            {modals.liquidation && <LiquidationModal onClose={() => toggleModal('liquidation', false)} liq={calc.liquidation} />}
            {modals.taxBreakdown && <TaxBreakdownModal onClose={() => toggleModal('taxBreakdown', false)} currentVal={calc.currentVal} currentTax={calc.currentTax} breakdown={calc.currentTaxBreakdown} />}
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
                                    <select className="px-2 py-1 text-[11px] font-bold rounded-md bg-gray-50 border border-gray-200 cursor-pointer focus:outline-none" value={settings.benchmarkTicker} onChange={e => setSettings(s => ({ ...s, benchmarkTicker: e.target.value }))}>
                                        {BENCHMARKS.map(b => (<option key={b.ticker} value={b.ticker}>{b.label}</option>))}
                                    </select>
                                )}
                                {fullscreenChart === 'value' && (
                                    <>
                                        <button className={`px-2 py-1 text-[11px] font-bold rounded-md ${showInvested ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`} onClick={() => setShowInvested(!showInvested)}>
                                            Indskud
                                        </button>
                                        <button className={`px-2 py-1 text-[11px] font-bold rounded-md ${showGross ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`} onClick={() => setShowGross(!showGross)}>
                                            Brutto
                                        </button>
                                    </>
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
                                showInvested={showInvested}
                            />
                        </div>
                        {renderZoomStrip(fullscreenChart, fullscreenChart === 'growth' ? numericGrowthData : numericValueData)}
                    </div>
                </ModalPortal>
            )}

            {/* --- MOBILE HERO (phones only) --- */}
            {/* Everything here shares ONE alignment (centered) and ONE label/value/subtitle
                typographic pattern - only size/weight signal primary vs secondary, so the
                hierarchy reads as intentional instead of a scattered mix of alignments. */}
            <div className="sm:hidden text-center">
                <div onClick={() => toggleModal('taxBreakdown', true)} className="cursor-pointer active:opacity-70 transition-opacity" aria-label="Værdi">
                    <div className="text-[2.5rem] leading-none font-extrabold text-gray-900 tracking-tight tabular-nums">
                        <AnimatedValue value={calc.currentVal - calc.currentTax} formatter={formatCurrencyNoDecimals} showTrend={false} className="justify-center" />
                    </div>
                    <div className="mt-2 text-xs text-gray-400 font-medium tabular-nums">
                        Før skat {formatCurrencyNoDecimals(calc.currentVal)}
                    </div>
                </div>

                {/* Today's change - fixed shape/position regardless of sign or data availability */}
                <div className="mt-3 flex justify-center">
                    <button onClick={() => toggleModal('movers', true)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold tabular-nums ${todayBadgeClasses}`}>
                        <i className={`ph ${todayBadgeIcon}`}></i>
                        {todayHasData ? (
                            <span>{todaySign}{formatCurrencyNoDecimals(todayGainAfterTax)} · {todaySign}{todayStats.todayPct.toFixed(2)}% i dag</span>
                        ) : (
                            <span>Ingen bevægelse i dag</span>
                        )}
                    </button>
                </div>

                <div className="mt-5 pt-4 border-t border-gray-100">
                    <button onClick={() => toggleModal('gain', true)} className="w-full rounded-xl active:bg-gray-50 transition-colors py-1">
                        <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400 flex items-center justify-center gap-1">
                            <i className="ph ph-trend-up"></i>Samlet gevinst
                        </div>
                        <div className={`mt-1 text-2xl leading-none font-extrabold tracking-tight tabular-nums ${allTimeGainAfterTax >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {allTimeGainAfterTax > 0 ? '+' : ''}{formatCurrencyNoDecimals(allTimeGainAfterTax)}
                        </div>
                        <div className="mt-2 text-xs text-gray-400 font-medium tabular-nums">
                            Før skat {allTimeGain > 0 ? '+' : ''}{formatCurrencyNoDecimals(allTimeGain)}
                        </div>
                    </button>
                </div>
            </div>

            {/* --- CARDS (tablet/desktop) --- */}
            <div className="hidden sm:grid sm:grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                <div onClick={() => toggleModal('taxBreakdown', true)} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm flex flex-col justify-between cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group">
                    <div className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1"><i className="ph ph-bank"></i>Værdi</div>
                    <div className="mt-2 text-3xl font-bold text-gray-900 tracking-tight">
                        <AnimatedValue value={calc.currentVal - calc.currentTax} formatter={formatCurrencyNoDecimals} />
                    </div>
                    <div className="mt-1 text-xs text-gray-400 font-medium">
                        Før skat: <span className="text-gray-600 font-semibold">{formatCurrencyNoDecimals(calc.currentVal)}</span>
                    </div>
                </div>
                <div onClick={() => toggleModal('gain', true)} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm flex flex-col justify-between cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group">
                    <div className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1"><i className="ph ph-trend-up"></i>Samlet gevinst</div>
                    <div className={`mt-2 text-3xl font-bold tracking-tight ${allTimeGainAfterTax >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        <AnimatedValue value={allTimeGainAfterTax} formatter={formatCurrencyNoDecimals} />
                    </div>
                    <div className="mt-1 text-xs text-gray-400 font-medium">
                        Før skat: <span className={`font-semibold ${allTimeGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrencyNoDecimals(allTimeGain)}</span>
                    </div>
                </div>
                <div onClick={() => toggleModal('movers', true)} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm flex flex-col justify-between cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group">
                    <div className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1"><i className="ph ph-arrow-up-right"></i>Gevinst/Tab i dag</div>
                    <div className={`mt-2 text-3xl font-bold tracking-tight ${todayStats.activeCount === 0 ? 'text-gray-400' : (todayGainAfterTax >= 0 ? 'text-emerald-600' : 'text-rose-600')}`}>
                        {todayStats.activeCount > 0 ? (
                            <AnimatedValue 
                                value={todayGainAfterTax} 
                                formatter={formatCurrencyNoDecimals} 
                                suffix={<span className="text-lg font-bold ml-2 align-middle"><AnimatedValue value={todayStats.todayPct} formatter={v => `${v.toFixed(2)}%`} showTrend={false} className="inline-flex" /></span>}
                            />
                        ) : "0 kr."}
                    </div>
                    {todayStats.activeCount > 0 && (
                        <div className="mt-1 text-xs text-gray-400 font-medium">
                            Før skat: <span className={`font-semibold ${todayStats.todayGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrencyNoDecimals(todayStats.todayGain)}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* --- CHARTS LAYOUT --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    
                    {/* Chart Container */}
                    <div className="bg-white p-4 rounded-xl shadow-sm">
                        {/* Chart Mode Tabs + Controls */}
                        <div className="flex flex-col gap-3 mb-4">
                            <div className="hidden sm:flex items-center justify-between">
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
                                        <>
                                            <button 
                                                className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all ${showInvested ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`} 
                                                onClick={() => setShowInvested(!showInvested)}
                                                title={showInvested ? "Skjul indskud" : "Vis indskud"}
                                            >
                                                <i className="ph ph-wallet"></i>
                                            </button>
                                            <button 
                                                className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all ${showGross ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`} 
                                                onClick={() => setShowGross(!showGross)}
                                                title={showGross ? "Skjul brutto" : "Vis brutto"}
                                            >
                                                <i className={`ph ${showGross ? 'ph-eye' : 'ph-eye-slash'}`}></i>
                                            </button>
                                        </>
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
                            <div className="flex items-center justify-between gap-2 flex-wrap">
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
                                    <div className="relative shrink-0 ml-auto hidden sm:block">
                                        <select
                                            className={`appearance-none pl-2 pr-6 py-0.5 text-[10px] font-bold rounded-md border cursor-pointer focus:outline-none ${
                                                settings.benchmarkTicker ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-gray-200 text-gray-500'
                                            }`}
                                            value={settings.benchmarkTicker}
                                            onChange={e => setSettings(s => ({ ...s, benchmarkTicker: e.target.value }))}
                                        >
                                            {BENCHMARKS.map(b => <option key={b.ticker} value={b.ticker}>{b.ticker ? `vs ${b.label}` : b.label}</option>)}
                                        </select>
                                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1.5">
                                            <i className="ph ph-caret-down text-[9px]"></i>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Chart area: fills exactly to the bottom of the screen on phones (see mobileChartHeight above) */}
                        <div ref={chartAreaRef} className="h-64 sm:h-72 w-full" style={mobileChartHeight ? { height: mobileChartHeight } : undefined}>
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
                                    showInvested={showInvested}
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
                                <div className="hidden sm:flex mt-2 items-center gap-3 text-xs text-gray-500">
                                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 rounded bg-emerald-500"></span>Portefølje: <span className="font-mono font-medium text-gray-700">{portfolio.toFixed(2)}%</span></span>
                                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 rounded bg-amber-500 opacity-70" style={{borderTop: '1px dashed'}}></span>{benchLabel}: <span className="font-mono font-medium text-gray-700">{bench.toFixed(2)}%</span></span>
                                    <span className={`font-mono font-bold ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{diff >= 0 ? '+' : ''}{diff.toFixed(2)}%</span>
                                </div>
                            );
                        })()}

                        {/* Active ticker chips */}
                        {selectedTickers.length > 0 && chartMode !== 'yoy' && (
                            <div className="hidden sm:flex mt-2 items-center gap-1.5 flex-wrap">
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
            {/* Compact stats table (tablet widths only; hidden on phones and covered by the sidebar on desktop) */}
            <div className="hidden sm:block lg:hidden mt-8">
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