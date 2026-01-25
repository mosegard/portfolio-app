import React, { useState } from 'react';
import FlatpickrDate from '../FlatpickrDate';
import NumberInput from '../NumberInput';
import {
    CSV_COLUMNS, TYPE_OPTIONS, CURRENCY_OPTIONS,
    parseDanishNumber, formatDanishNumber, formatNumber2,
    determineType, normalizeCurrency, normalizeDate, parseDanishDate
} from '../../utils';

const EditorView = ({ 
    rows, 
    setRows, 
    filterAccount, 
    config, 
    saveToGithub, 
    statusMsg, 
    handleFileUpload 
}) => {
    // --- Local State (Moved from App.jsx) ---
    const [filters, setFilters] = useState({});

    // --- Helpers ---
    const updateRow = (idx, k, v) => setRows(prev => {
        const n = [...prev];
        let newVal = v;
        if (k === 'Type') newVal = determineType(v, n[idx]['Ticker'], n[idx]['Qty']);
        if (k === 'Currency') newVal = normalizeCurrency(v);
        n[idx] = { ...n[idx], [k]: newVal };
        return n;
    });

    const addRow = () => {
        const dStr = normalizeDate(new Date().toISOString().split('T')[0]);
        setRows(prev => [{ 
            'Date': dStr, 
            'Type': 'Stock', 
            'Ticker': '', 
            'Qty': 0, 
            'Price': 0, 
            'FxRate': 1, 
            'Commission': 0, 
            'Withheld Tax': 0, 
            'Currency': 'DKK', 
            'Account': filterAccount !== 'All' ? filterAccount : '' 
        }, ...prev]);
    };

    const focusNext = (el) => {
        if (!el) return;
        const rowEl = el.closest('tr');
        if (!rowEl) return;
        const focusables = Array.from(rowEl.querySelectorAll('input, select'));
        const idx = focusables.indexOf(el);
        const next = focusables[idx + 1];
        if (next) next.focus();
    };

    // --- Preparation Logic ---
    const viewRows = [...rows]
        .map((r, i) => ({ ...r, _origIdx: i }))
        .sort((a, b) => (parseDanishDate(a['Date']) || 0) - (parseDanishDate(b['Date']) || 0));

    let runningBalances = {};
    let runningHoldings = {};

    const editorRows = viewRows.map(row => {
        const idx = row._origIdx;
        const acc = row['Account'] || 'Unknown';
        const ticker = row['Ticker'];
        const holdingKey = `${ticker}_${acc}`;
        
        if (!runningBalances[acc]) runningBalances[acc] = 0;
        if (ticker && !runningHoldings[holdingKey]) runningHoldings[holdingKey] = 0;

        const qty = parseDanishNumber(row['Qty']);
        const price = parseDanishNumber(row['Price']);
        const comm = parseDanishNumber(row['Commission']);
        const tax = parseDanishNumber(row['Withheld Tax']);
        const taxRate = parseDanishNumber(row['FxRate']) || 1;

        const stockCurrency = (row['Currency'] || 'DKK').toUpperCase();
        const accCurrency = (config.currencies[acc] || 'DKK').toUpperCase();
        const isCrossCurrency = accCurrency !== stockCurrency;
        const conversionRate = isCrossCurrency ? taxRate : 1;

        const effectiveType = determineType(row['Type'], row['Ticker'], row['Qty']);
        const isTrade = ['Stock', 'ETF'].includes(effectiveType);
        const isCash = effectiveType === 'Cash' || effectiveType === 'Dividend';
        const isDividend = effectiveType === 'Dividend';

        const holdingsBefore = runningHoldings[holdingKey] || 0;

        if (effectiveType === 'Stock' || effectiveType === 'ETF') {
            runningHoldings[holdingKey] += qty;
        }

        let delta = 0;
        let calcDetail = '';

        if (isTrade) {
            const assetVal = (qty * price) * conversionRate;
            delta = -(assetVal + comm);
            calcDetail = `${effectiveType}: -(${formatDanishNumber(qty)} x ${formatDanishNumber(price)} x ${formatDanishNumber(conversionRate)}) - ${formatDanishNumber(comm)}`;
        } else if (isCash) {
            const grossVal = (qty * price) * conversionRate;
            delta = grossVal - tax;
            calcDetail = `Cash: (${formatDanishNumber(qty)} x ${formatDanishNumber(price)} x ${formatDanishNumber(conversionRate)}) - ${formatDanishNumber(tax)}`;
        }
        runningBalances[acc] += delta;

        const meta = {
            isTrade, isCash, isCrossCurrency, stockCurrency, isDividend,
            holdingsSnapshot: holdingsBefore,
            warnFx: (stockCurrency !== 'DKK' && taxRate === 1)
        };

        return { ...row, _idx: idx, _bal: runningBalances[acc], _delta: delta, _calcDetail: calcDetail, _accCur: accCurrency, _meta: meta };
    });

    const displayRows = editorRows.filter(r => {
        if (filterAccount !== 'All' && r['Account'] !== filterAccount) return false;
        return Object.entries(filters).every(([key, searchVal]) => {
            if (!searchVal) return true;
            const val = String(r[key] || '').toLowerCase();
            return val.includes(searchVal.toLowerCase());
        });
    }).slice().reverse();

    return (
        <div className="flex flex-col h-full bg-white">
            {/* TOP BAR */}
            <div className="flex items-center justify-between p-2 border-b bg-gray-50 shrink-0">
                <div className="flex gap-2">
                    <button onClick={addRow} className="flex items-center gap-1 px-3 py-1 bg-white border rounded hover:bg-gray-100 text-sm font-medium text-gray-700">
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
                                        const isDividend = row['Type'] === 'Dividend';
                                        const taxVal = parseDanishNumber(row['Withheld Tax']);
                                        let css = 'text-gray-300';
                                        let tooltip = 'Dividend Tax';

                                        if (isDividend) {
                                            css = 'text-gray-700'; 
                                            if (taxVal === 0) {
                                                css = 'text-orange-700 bg-orange-50 border border-orange-300 font-bold';
                                                tooltip = 'Warning: No tax withheld on dividend';
                                            }
                                            else {
                                                const qty = parseDanishNumber(row['Qty']);
                                                const price = parseDanishNumber(row['Price']);
                                                const fx = parseDanishNumber(row['FxRate']) || 1;
                                                const acc = row['Account'] || '';
                                                const accCur = (config.currencies[acc] || 'DKK').toUpperCase();
                                                const stockCur = (row['Currency'] || 'DKK').toUpperCase();
                                                const conversion = accCur !== stockCur ? fx : 1;
                                                const grossAmount = qty * price * conversion;

                                                if (grossAmount > 0) {
                                                    const pct = (taxVal / grossAmount) * 100;
                                                    const isSuspicious = stockCur === 'DKK' ? (pct < 26 || pct > 28) : (pct < 14 || pct > 30);
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

export default EditorView;