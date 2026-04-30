import React, { useState, useMemo, useCallback } from 'react';
import FlatpickrDate from '../FlatpickrDate';
import NumberInput from '../NumberInput';
import { BuySellModal, CashTransferModal, DividendModal } from '../TransactionModals';
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
    accounts,
    saveToGithub, 
    statusMsg, 
    handleFileUpload,
    detectedCurrencies
}) => {
    // --- Local State ---
    const [filters, setFilters] = useState({});
    const [modal, setModal] = useState(null); // 'buy' | 'sell' | 'transfer' | 'dividend' | null

    // --- Helpers ---
    const updateRow = useCallback((id, k, v) => setRows(prev => {
        const idx = prev.findIndex(r => r._id === id);
        if (idx === -1) return prev;
        const n = [...prev];
        let newVal = v;
        if (k === 'Type') newVal = determineType(v, n[idx]['Ticker'], n[idx]['Qty']);
        if (k === 'Currency') newVal = normalizeCurrency(v);
        if (k === 'FxRate' && (newVal === 0 || newVal === '')) newVal = 1;
        n[idx] = { ...n[idx], [k]: newVal };
        return n;
    }), [setRows]);

    const addRow = () => {
        const dStr = normalizeDate(new Date().toISOString().split('T')[0]);
        const defaultCur = filterAccount !== 'All' 
            ? (config.currencies[filterAccount] || detectedCurrencies[filterAccount] || 'DKK') 
            : 'DKK';
        
        setRows(prev => [{ 
            _id: crypto.randomUUID(),
            _createdAt: Date.now(),
            'Date': dStr, 
            'Type': 'Stock', 
            'Ticker': '', 
            'Qty': 0, 
            'Price': 0, 
            'FxRate': 1, 
            'Commission': 0, 
            'Withheld Tax': 0, 
            'Currency': defaultCur, 
            'Account': filterAccount !== 'All' ? filterAccount : '' 
        }, ...prev]);
    };

    const handleModalSubmit = (newRows) => {
        setRows(prev => [...newRows, ...prev]);
    };

    const defaultCurrency = filterAccount !== 'All' 
        ? (config.currencies[filterAccount] || detectedCurrencies[filterAccount] || 'DKK') 
        : 'DKK';

    const focusNext = (el) => {
        if (!el) return;
        const rowEl = el.closest('tr');
        if (!rowEl) return;
        const focusables = Array.from(rowEl.querySelectorAll('input, select'));
        const idx = focusables.indexOf(el);
        const next = focusables[idx + 1];
        if (next) next.focus();
    };

    // --- PREPARE DATA (memoized) ---
    const sortedRows = useMemo(() => {
        return [...rows].sort((a, b) => {
            const da = parseDanishDate(a['Date']) || 0;
            const db = parseDanishDate(b['Date']) || 0;
            const dateDiff = da - db;
            if (dateDiff !== 0) return dateDiff;
            // Tiebreaker: newer rows (higher _createdAt) sort last in ascending,
            // so they appear first after reversing for display
            return (a._createdAt || 0) - (b._createdAt || 0);
        });
    }, [rows]);

    const editorRows = useMemo(() => {
        let runningBalances = {};
        let runningHoldings = {};

        return sortedRows.map(row => {
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
            const accCurrency = (config.currencies[acc] || detectedCurrencies[acc] || 'DKK').toUpperCase();
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
                warnFx: (stockCurrency !== accCurrency && Math.abs(taxRate - 1) < 0.001)
            };

            return { ...row, _bal: runningBalances[acc], _delta: delta, _calcDetail: calcDetail, _accCur: accCurrency, _meta: meta };
        });
    }, [sortedRows, config, detectedCurrencies]);

    const displayRows = useMemo(() => {
        return editorRows.filter(r => {
            if (filterAccount !== 'All' && r['Account'] !== filterAccount) return false;
            return Object.entries(filters).every(([key, searchVal]) => {
                if (!searchVal) return true;
                const val = String(r[key] || '').toLowerCase();
                return val.includes(searchVal.toLowerCase());
            });
        }).reverse();
    }, [editorRows, filterAccount, filters]);

    return (
        <div className="flex flex-col h-full bg-white">
            {/* MODALS */}
            {modal === 'buy' && <BuySellModal type="buy" onClose={() => setModal(null)} onSubmit={handleModalSubmit} accounts={accounts} filterAccount={filterAccount} defaultCurrency={defaultCurrency} />}
            {modal === 'sell' && <BuySellModal type="sell" onClose={() => setModal(null)} onSubmit={handleModalSubmit} accounts={accounts} filterAccount={filterAccount} defaultCurrency={defaultCurrency} />}
            {modal === 'transfer' && <CashTransferModal onClose={() => setModal(null)} onSubmit={handleModalSubmit} accounts={accounts} filterAccount={filterAccount} defaultCurrency={defaultCurrency} />}
            {modal === 'dividend' && <DividendModal onClose={() => setModal(null)} onSubmit={handleModalSubmit} accounts={accounts} filterAccount={filterAccount} defaultCurrency={defaultCurrency} />}

            {/* TOP BAR */}
            <div className="flex items-center justify-between p-2 border-b bg-gray-50 shrink-0">
                <div className="flex gap-1.5">
                    <button onClick={() => setModal('buy')} className="flex items-center gap-1 px-3 py-1 bg-white border border-green-200 rounded hover:bg-green-50 text-sm font-medium text-green-700">
                        <i className="ph ph-arrow-up-right"></i> Buy
                    </button>
                    <button onClick={() => setModal('sell')} className="flex items-center gap-1 px-3 py-1 bg-white border border-red-200 rounded hover:bg-red-50 text-sm font-medium text-red-700">
                        <i className="ph ph-arrow-down-right"></i> Sell
                    </button>
                    <button onClick={() => setModal('transfer')} className="flex items-center gap-1 px-3 py-1 bg-white border border-blue-200 rounded hover:bg-blue-50 text-sm font-medium text-blue-700">
                        <i className="ph ph-arrows-left-right"></i> Transfer
                    </button>
                    <button onClick={() => setModal('dividend')} className="flex items-center gap-1 px-3 py-1 bg-white border border-yellow-200 rounded hover:bg-yellow-50 text-sm font-medium text-yellow-700">
                        <i className="ph ph-coins"></i> Dividend
                    </button>
                    <span className="border-l border-gray-200 mx-1"></span>
                    <button onClick={addRow} className="flex items-center gap-1 px-2 py-1 bg-white border rounded hover:bg-gray-100 text-xs text-gray-500" title="Add blank row">
                        <i className="ph ph-plus"></i>
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
                                
                                // Logic: Determine currency for this column header
                                // If viewing specific account -> use that account's currency
                                // If viewing All -> ambiguous (or show nothing)
                                const currentAccCurrency = filterAccount !== 'All' 
                                    ? (config.currencies[filterAccount] || detectedCurrencies[filterAccount] || 'DKK') 
                                    : '';
                                    
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
                            <tr key={row._id} className="group hover:bg-blue-50/30">
                                <td className="p-1 text-center sticky left-0 bg-white group-hover:bg-blue-50/30 border-r border-gray-100">
                                    <button onClick={() => confirm('Delete?') && setRows(prev => prev.filter(r => r._id !== row._id))} className="text-gray-300 hover:text-red-500"><i className="ph ph-trash"></i></button>
                                </td>

                                {/* Date */}
                                <td className="p-1"><FlatpickrDate value={row['Date']} onChange={(v) => updateRow(row._id, 'Date', v)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext(e.currentTarget); } }} /></td>

                                {/* Type */}
                                <td className="p-1">
                                    <select className="w-20 input-base p-1 rounded font-medium text-gray-700" value={row['Type']} onChange={e => updateRow(row._id, 'Type', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext(e.currentTarget); } }}>
                                        {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                </td>

                                {/* Ticker */}
                                <td className="p-1"><input className="w-full input-base p-1 rounded font-medium" value={row['Ticker']} onChange={e => updateRow(row._id, 'Ticker', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext(e.currentTarget); } }} /></td>

                                {/* 1. Qty */}
                                <td className="p-1 relative group/qty">
                                    <NumberInput
                                        value={row['Qty']}
                                        onCommit={(v) => updateRow(row._id, 'Qty', v)}
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
                                        value={row['Price']}
                                        onCommit={(v) => updateRow(row._id, 'Price', v)}
                                        extraClass={row._meta.isCash ? 'text-gray-300' : ''}
                                    />
                                </td>
                                {/* Currency */}
                                <td className="p-1">
                                    <select className="w-16 input-base p-1 rounded text-xs" value={row['Currency']} onChange={e => updateRow(row._id, 'Currency', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext(e.currentTarget); } }}>
                                        {CURRENCY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                </td>

                                {/* FxRate with Warning Tooltip */}
                                <td className="p-1">
                                    <NumberInput
                                        value={row['FxRate']}
                                        onCommit={(v) => updateRow(row._id, 'FxRate', v)}
                                        extraClass={row._meta.warnFx ? 'bg-orange-50 text-orange-700 font-bold border border-orange-300' : ''}
                                        title={row._meta.warnFx ? "Critical: Foreign currency with Rate 1.00" : "Exchange Rate"}
                                    />
                                </td>

                                {/* 4. Commission */}
                                <td className="p-1">
                                    <NumberInput
                                        value={row['Commission']}
                                        onCommit={(v) => updateRow(row._id, 'Commission', v)}
                                        extraClass={!row._meta.isTrade ? 'text-gray-300' : 'text-gray-700'}
                                        title={`Trading Fee in ${row._accCur}`}
                                    />
                                </td>
                                {/* 5. Withheld Tax */}
                                <td className="p-1">
                                    {(() => {
                                        const isDividend = row['Type'] === 'Dividend';
                                        const taxVal = parseDanishNumber(row['Withheld Tax']);
                                        let css = 'text-gray-300';
                                        let tooltip = `Dividend Tax in ${row._accCur}`;

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
                                                const accCur = row._accCur;
                                                const stockCur = row._meta.stockCurrency;
                                                const conversion = accCur !== stockCur ? fx : 1;
                                                const grossAmount = qty * price * conversion;

                                                if (grossAmount > 0) {
                                                    const pct = (taxVal / grossAmount) * 100;
                                                    const isSuspicious = pct < 10 || pct > 45; 
                                                    if (isSuspicious) {
                                                        css = 'text-orange-700 bg-orange-50 border border-orange-300 font-bold';
                                                        tooltip = `Warning: Unusual Tax Rate (${pct.toFixed(1)}%). Check amounts.`;
                                                    }
                                                }
                                            }
                                        }

                                        return (
                                            <NumberInput
                                                value={row['Withheld Tax']}
                                                onCommit={(v) => updateRow(row._id, 'Withheld Tax', v)}
                                                extraClass={css}
                                                title={tooltip}
                                            />
                                        );
                                    })()}
                                </td>

                                {/* Account */}
                                {filterAccount === 'All' && (
                                    <td className="p-1"><input className="w-24 input-base p-1 rounded text-xs" value={row['Account']} onChange={e => updateRow(row._id, 'Account', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext(e.currentTarget); } }} /></td>
                                )}

                                {/* Note */}
                                <td className="p-1"><input className="w-24 input-base p-1 rounded text-gray-400 text-xs" value={row['Note'] || ''} onChange={e => updateRow(row._id, 'Note', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext(e.currentTarget); } }} /></td>

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