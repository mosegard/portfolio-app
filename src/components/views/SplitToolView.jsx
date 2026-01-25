import React, { useState, useMemo } from 'react';
import {
    ComposedChart, Area, Scatter, XAxis, YAxis, CartesianGrid,
    Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer
} from 'recharts';
import {
    parseDanishNumber,
    formatNumber2,
    determineType,
    displayDateToIso,
    getLocalISO
} from '../../utils';

const SplitToolView = ({ rows, setRows, marketData, tickers, txs }) => {
    // --- Local State (Moved from App.jsx) ---
    const [splitParams, setSplitParams] = useState({
        ticker: '',
        num: 2,
        den: 1,
        dateIso: '',
        startDateIso: '',
        endDateIso: ''
    });

    // --- Derived Logic (Moved from App.jsx) ---
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

    const selected = splitParams.ticker || (tickers[0] || '');

    // 1. Prepare Market Data (Blue Line)
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

    // 3. Calculate Impacted Rows
    const startIso = splitParams.startDateIso || '1900-01-01';
    const endIso = splitParams.endDateIso || '2099-12-31';

    const impactedRows = rows.filter(r => {
        if ((r['Ticker'] || '').trim() !== selected) return false;
        const t = determineType(r['Type'], r['Ticker'], r['Qty']);
        if (!['Stock', 'ETF'].includes(t)) return false;

        const rDate = displayDateToIso(r['Date']);
        return rDate >= startIso && rDate <= endIso;
    }).length;

    // 4. Handlers
    const handleChartClick = (e) => {
        if (!e || !e.activeLabel) return;
        let clickedDate;
        try {
            clickedDate = new Date(e.activeLabel).toISOString().split('T')[0];
        } catch { return; }

        setSplitParams(prev => {
            const hasStart = !!prev.startDateIso;
            const hasEnd = !!prev.endDateIso;

            if ((hasStart && hasEnd) || (!hasStart && !hasEnd) || (!hasStart && hasEnd)) {
                return { ...prev, startDateIso: clickedDate, endDateIso: '' };
            } else {
                const d1 = prev.startDateIso;
                const d2 = clickedDate;
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
                    if ((r['Ticker'] || '').trim() !== selected) return r;
                    const t = determineType(r['Type'], r['Ticker'], r['Qty']);
                    if (!['Stock', 'ETF'].includes(t)) return r;
                    const rDate = displayDateToIso(r['Date']);
                    if (rDate < startIso || rDate > endIso) return r;

                    return {
                        ...r,
                        'Qty': parseDanishNumber(r['Qty']) * ratio,
                        'Price': parseDanishNumber(r['Price']) / ratio,
                        'Note': (r['Note'] || '') + ` [Split ${num}:${den}]`
                    };
                });
            });
            alert("Success. Split applied to selected range.");
            setSplitParams(s => ({ ...s, startDateIso: '', endDateIso: '' }));
        }
    };

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

                    {/* A. Auto-Detector */}
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
                                    onClick={handleChartClick}
                                    style={{ cursor: 'crosshair' }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis
                                        dataKey="x"
                                        type="number"
                                        domain={['auto', 'auto']}
                                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                                        tickFormatter={(t) => new Date(t).toLocaleDateString()}
                                        minTickGap={50}
                                    />
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
                                    {refStart && refEnd && (
                                        <ReferenceArea x1={refStart} x2={refEnd} fill="#3b82f6" fillOpacity={0.1} />
                                    )}
                                    {refStart && !refEnd && (
                                        <ReferenceLine x={refStart} stroke="#3b82f6" strokeDasharray="3 3" />
                                    )}
                                    <Area data={graphData} type="monotone" dataKey="y" name="Market Price" stroke="#3b82f6" strokeWidth={2} fillOpacity={0.05} fill="#3b82f6" isAnimationActive={false} />
                                    <Scatter data={userTrades.filter(t => t.type === 'BUY')} name="Your Buy" fill="#10b981" shape="circle" isAnimationActive={false} />
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

export default SplitToolView;