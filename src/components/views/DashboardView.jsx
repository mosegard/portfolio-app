import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceArea } from 'recharts';
import ModalPortal from '../ModalPortal';
import { formatCurrency, formatCurrencyNoDecimals } from '../../utils';
import useDashboardChartData from '../../hooks/useDashboardChartData';
import { AllocationModal, LiquidationModal, GainModal, MoversModal } from './DashboardModals';

// --- Reusable Selectors ---
const RangeSelector = ({ value, onChange, years }) => {
    const baseRanges = ['1M', 'ALL'];
    const options = value === 'CUSTOM' ? ['CUSTOM', ...baseRanges, ...years] : [...baseRanges, ...years];
    return (
        <div className="relative">
            <select 
                className="appearance-none pl-3 pr-8 py-1.5 h-8 text-xs font-bold rounded-md bg-white border border-gray-200 text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 w-full" 
                value={value} 
                onChange={e => onChange(e.target.value)}
            >
                {options.map(r => (
                    <option key={r} value={r}>{r === '1M' ? '1M' : r === 'ALL' ? 'Altid' : r === 'CUSTOM' ? 'ZOOM' : r}</option>
                ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                <i className="ph ph-caret-down text-xs"></i>
            </div>
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

    const label = selected.length === 0 ? 'Alle' : selected.length === 1 ? selected[0] : `${selected.length} valgt`;
    const filtered = query ? tickers.filter(t => t.toLowerCase().includes(query.toLowerCase())) : tickers;
    const toggle = (t) => onChange(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

    return (
        <div className="relative w-full" ref={boxRef}>
            <button type="button" className="px-3 py-1.5 h-8 text-xs font-bold rounded-md bg-white border border-gray-200 text-gray-700 flex items-center justify-between gap-2 cursor-pointer w-full hover:bg-gray-50 transition-colors" onClick={() => setOpen(o => !o)} title="Vælg flere tickers">
                <span className="truncate">{label}</span>
                <i className="ph ph-caret-down text-gray-500 shrink-0"></i>
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 z-40 w-56 bg-white border border-gray-100 rounded-md shadow-lg">
                    <div className="p-2 border-b border-gray-100">
                        <input type="text" className="w-full px-2 py-1 text-xs border border-gray-100 rounded-md" placeholder="Søg…" value={query} onChange={e => setQuery(e.target.value)} />
                    </div>
                    <div className="max-h-48 overflow-auto">
                        <button className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2" onClick={() => onChange([])}>
                            <input type="checkbox" readOnly checked={selected.length === 0} className="rounded" />
                            <span>Alle</span>
                        </button>
                        {filtered.map((t, i) => (
                            <button key={t} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2" onClick={() => toggle(t)}>
                                <input type="checkbox" readOnly checked={selected.includes(t)} className="rounded" />
                                <span className="flex-1">{t}</span>
                                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>
                            </button>
                        ))}
                    </div>
                    <div className="p-2 border-t border-gray-100 flex items-center justify-between">
                        <button className="px-2 py-1 text-xs rounded-md border border-gray-100 hover:bg-gray-100" onClick={() => onChange([])}>Nulstil</button>
                        <button className="px-2 py-1 text-xs rounded-md bg-gray-800 text-white hover:bg-gray-700" onClick={() => setOpen(false)}>Færdig</button>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Shared Chart Component ---
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
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="date" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(ts) => {
                if (!ts) return '';
                const d = new Date(ts);
                const day = d.getDate();
                const month = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'][d.getMonth()];
                const year = d.getFullYear();
                return graphRange === 'ALL' ? `${day}. ${month} ${year}` : `${day}. ${month}`;
            }} ticks={graphRange === 'ALL' ? numericYearTicks : null} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} minTickGap={30} />
            <YAxis width={45} axisLine={false} tickLine={false} domain={type === 'value' ? ['dataMin', 'dataMax'] : ['auto', 'auto']} tickFormatter={(v) => type === 'value' ? `${(v / 1000).toFixed(0)}k` : `${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <Tooltip formatter={(v, n) => [type === 'value' ? formatCurrency(v) : `${v.toFixed(2)}%`, n === 'netValue' ? 'Efter Skat' : n === 'value' ? 'Før Skat' : n]} labelFormatter={(ts) => {
                if (!ts) return '';
                return new Date(ts).toISOString().split('T')[0];
            }} />
            <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="3 3" />
            {showYearLines && numericYearTicks.map(t => <ReferenceLine key={t} x={t} stroke="#e5e7eb" />)}

            {chartSelection.chart === type && chartSelection.start && chartSelection.end && !isMulti && (
                <ReferenceArea x1={Math.min(chartSelection.start, chartSelection.end)} x2={Math.max(chartSelection.start, chartSelection.end)} strokeOpacity={0.1} fill={type === 'growth' ? "#10b981" : "#2563eb"} fillOpacity={0.1} />
            )}

            {isMulti ? selectedTickers.map((t, i) => (
                <Area key={t} type="monotone" dataKey={t} stroke={COLORS[i % COLORS.length]} strokeWidth={1} fill="none" isAnimationActive={false} />
            )) : (
                type === 'value' ? (
                    <>
                        <Area type="step" dataKey="invested" name="Indskud" stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 4" fill="none" isAnimationActive={false} />
                        {/* Conditional Rendering for Gross Value */}
                        {showGross && (
                            <Area type="monotone" dataKey="value" name="value" stroke="#3b82f6" strokeWidth={1} fill="url(#colorVal)" isAnimationActive={false} />
                        )}
                        {/* Net Value: Changed strokeWidth to 1 */}
                        <Area type="monotone" dataKey="netValue" name="netValue" stroke="#10b981" strokeWidth={1} fill="url(#colorNet)" isAnimationActive={false} />
                    </>
                ) : (
                    <>
                        <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={1} fill="url(#colorGrowth)" isAnimationActive={false} />
                        {settings.benchmarkTicker && <Area type="monotone" dataKey="benchmark" stroke="#f59e0b" strokeWidth={1} fill="none" isAnimationActive={false} />}
                    </>
                )
            )}
        </AreaChart>
    </ResponsiveContainer>
);

// --- Main Component ---
const DashboardView = ({ calc, marketData, settings, setSettings, fetchMarketData, uniqueTickers, years }) => {
    const [graphRange, setGraphRange] = useState('ALL');
    const [customRange, setCustomRange] = useState({ startIso: '', endIso: '' });
    const [chartSelection, setChartSelection] = useState({ start: null, end: null, chart: null, dragging: false });
    const [fullscreenChart, setFullscreenChart] = useState(null);
    const [selectedTickers, setSelectedTickers] = useState([]);
    const [showMobileGraphMenu, setShowMobileGraphMenu] = useState(false);
    
    // UI Setting: Default to NOT showing gross value
    const [showGross, setShowGross] = useState(false);
    
    // Modal Visibility State
    const [modals, setModals] = useState({ movers: false, liquidation: false, allocation: false, gain: false });
    const toggleModal = (key, val) => setModals(prev => ({ ...prev, [key]: val }));

    // Use Custom Hook for Data Logic
    const { 
        todayStats, numericValueData, numericGrowthData, getFxRate, getPositionValueWithPrev 
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

    // --- Overlay Zoom Logic ---
    const renderZoomOverlay = (type, data) => {
        if (chartSelection.chart !== type || !chartSelection.start || !chartSelection.end || isMulti) return null;
        const startTs = Math.min(chartSelection.start, chartSelection.end);
        const endTs = Math.max(chartSelection.start, chartSelection.end);
        const inRange = data.filter(d => d.date >= startTs && d.date <= endTs);
        if (inRange.length < 2) return null;
        const startVal = inRange[0].value;
        const endVal = inRange[inRange.length - 1].value;
        const abs = endVal - startVal;
        const pct = startVal > 0 ? (abs / startVal) * 100 : 0;

        return (
            <div className="absolute top-2 right-2 bg-white/95 backdrop-blur rounded-md border border-gray-200 shadow-sm px-3 py-2 flex items-center gap-2 z-10">
                <div className={`text-sm font-mono ${abs >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{abs >= 0 ? '+' : ''}{type === 'growth' ? `${abs.toFixed(2)}%` : formatCurrencyNoDecimals(abs)}</div>
                {type === 'value' && <div className={`text-xs font-mono ${pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>({pct.toFixed(2)}%)</div>}
                <button className="text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-100" onClick={() => {
                    setCustomRange({ startIso: new Date(startTs).toISOString().split('T')[0], endIso: new Date(endTs).toISOString().split('T')[0] });
                    setGraphRange('CUSTOM');
                    setChartSelection({ start: null, end: null, chart: null, dragging: false });
                }}>Zoom ind</button>
                <button className="text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-100" onClick={() => setChartSelection({ start: null, end: null, chart: null, dragging: false })}>Ryd</button>
            </div>
        );
    };

    const commonBtnClass = "h-8 w-8 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors";

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
                                <div className="w-[80px] sm:w-[100px]"><RangeSelector value={graphRange} onChange={setGraphRange} years={years} /></div>
                                <div className="w-[120px] sm:w-[200px]"><TickerSelector tickers={uniqueTickers} selected={selectedTickers} onChange={setSelectedTickers} COLORS={COLORS} /></div>
                                
                                {fullscreenChart === 'value' && (
                                     <button className={commonBtnClass} onClick={() => setShowGross(!showGross)} title={showGross ? "Skjul Brutto Værdi" : "Vis Brutto Værdi"}>
                                         <i className={`ph ${showGross ? 'ph-eye' : 'ph-eye-slash'}`}></i>
                                     </button>
                                )}
                                
                                <select className="px-3 py-1.5 h-8 text-xs font-bold rounded-md bg-white border border-gray-200 cursor-pointer max-w-[100px] sm:max-w-none truncate focus:outline-none focus:ring-2 focus:ring-blue-500" value={settings.benchmarkTicker} onChange={e => { setSettings(s => ({ ...s, benchmarkTicker: e.target.value })); fetchMarketData(true); }}>
                                    {BENCHMARKS.map(b => (<option key={b.ticker} value={b.ticker}>{b.label}</option>))}
                                </select>
                                <button className="px-3 py-1.5 h-8 text-xs rounded-md border border-gray-200 hover:bg-gray-100 font-medium" onClick={() => setFullscreenChart(null)}>Luk</button>
                            </div>
                        </div>
                        <div className="flex-1 relative">
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
                            {renderZoomOverlay(fullscreenChart, fullscreenChart === 'growth' ? numericGrowthData : numericValueData)}
                        </div>
                    </div>
                </ModalPortal>
            )}

            {/* --- CARDS (Removed Gross Value Card) --- */}
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
                <div className="lg:col-span-2 space-y-8">
                    {/* Growth Chart */}
                    <div className="bg-white p-4 rounded-xl shadow-sm relative">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800 text-sm uppercase">Afkast (%)</h3>
                            <div className="flex items-center gap-2">
                                <div className="hidden md:flex items-center gap-2">
                                    <div className="w-[100px]"><RangeSelector value={graphRange} onChange={setGraphRange} years={years} /></div>
                                    <div className="w-[180px]"><TickerSelector tickers={uniqueTickers} selected={selectedTickers} onChange={setSelectedTickers} COLORS={COLORS} /></div>
                                    <div className="w-[120px]">
                                        <select className="px-3 py-1.5 h-8 text-xs font-bold rounded-md bg-white border border-gray-200 cursor-pointer w-full focus:outline-none focus:ring-2 focus:ring-blue-500" value={settings.benchmarkTicker} onChange={e => { setSettings(s => ({ ...s, benchmarkTicker: e.target.value })); fetchMarketData(true); }}>
                                            {BENCHMARKS.map(b => (<option key={b.ticker} value={b.ticker}>{b.label}</option>))}
                                        </select>
                                    </div>
                                </div>
                                <button className="md:hidden p-2 rounded-md border" onClick={() => setShowMobileGraphMenu(!showMobileGraphMenu)}><i className="ph ph-sliders-horizontal text-lg"></i></button>
                                <button className={commonBtnClass} onClick={() => setFullscreenChart('growth')}><i className="ph ph-arrows-out text-lg"></i></button>
                            </div>
                        </div>
                        {showMobileGraphMenu && (
                            <div className="md:hidden mb-4 p-4 bg-gray-50 border rounded-lg flex flex-col gap-3">
                                <div><span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Tid</span><RangeSelector value={graphRange} onChange={setGraphRange} years={years} /></div>
                                <div><span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Papirer</span><TickerSelector tickers={uniqueTickers} selected={selectedTickers} onChange={setSelectedTickers} COLORS={COLORS} /></div>
                            </div>
                        )}
                        <div className="h-64 w-full relative">
                            <CommonChart 
                                type="growth" 
                                data={numericGrowthData}
                                chartSelection={chartSelection}
                                onChartMouse={handleChartMouse}
                                isMulti={isMulti}
                                selectedTickers={selectedTickers}
                                COLORS={COLORS}
                                graphRange={graphRange}
                                numericYearTicks={numericYearTicks}
                                showYearLines={showYearLines}
                                settings={settings}
                            />
                            {renderZoomOverlay('growth', numericGrowthData)}
                        </div>
                    </div>

                    {/* Value Chart */}
                    <div className="bg-white p-4 rounded-xl shadow-sm relative">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800 text-sm uppercase">Porteføljens Værdi</h3>
                            <div className="flex items-center gap-2">
                                <div className="hidden md:flex items-center gap-2">
                                    <div className="w-[100px]"><RangeSelector value={graphRange} onChange={setGraphRange} years={years} /></div>
                                    <div className="w-[180px]"><TickerSelector tickers={uniqueTickers} selected={selectedTickers} onChange={setSelectedTickers} COLORS={COLORS} /></div>
                                </div>
                                <button className={commonBtnClass} onClick={() => setShowGross(!showGross)} title={showGross ? "Skjul Brutto Værdi" : "Vis Brutto Værdi"}>
                                    <i className={`ph ${showGross ? 'ph-eye' : 'ph-eye-slash'}`}></i>
                                </button>
                                <button className={commonBtnClass} onClick={() => setFullscreenChart('value')}><i className="ph ph-arrows-out text-lg"></i></button>
                            </div>
                        </div>
                        <div className="h-64 w-full relative">
                            <CommonChart 
                                type="value" 
                                data={numericValueData}
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
                            {renderZoomOverlay('value', numericValueData)}
                        </div>
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
                            <div key={stat.year} className="p-4 hover:bg-gray-50"><div className="flex justify-between"><span className="font-bold">{stat.year}</span><span className={stat.return >= 0 ? 'text-green-600' : 'text-red-600'}>{stat.return.toFixed(2)}%</span></div></div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardView;