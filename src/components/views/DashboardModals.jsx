import { useState } from 'react';
import ModalPortal from '../ModalPortal';
import { formatCurrencyNoDecimals } from '../../utils';

export const AllocationModal = ({ onClose, portfolio, marketData, getFxRate }) => {
    const [allocationMode, setAllocationMode] = useState('currency');

    const mapCurrencyToCountry = (cur) => {
        const C = (cur || '').toUpperCase();
        const map = { DKK: 'Danmark', USD: 'USA', EUR: 'Eurozone', GBP: 'Storbritannien', SEK: 'Sverige', NOK: 'Norge' };
        return map[C] || C || 'Ukendt';
    };

    const alloc = new Map();
    let total = 0;
    Object.values(portfolio).forEach(p => {
        if (Math.abs(p.qty) < 0.01) return;
        const m = marketData[p.ticker] || {};
        const price = m.price ?? m.previousClose ?? 0;
        const fx = getFxRate(p.cur);
        const val = p.qty * price * fx;
        
        total += val;
        let key = p.ticker;
        if (allocationMode === 'currency') key = p.cur || 'DKK';
        else if (allocationMode === 'country') key = mapCurrencyToCountry(p.cur);
        
        alloc.set(key, (alloc.get(key) || 0) + val);
    });

    const items = Array.from(alloc.entries()).map(([label, val]) => ({ label, val })).sort((a, b) => b.val - a.val);

    return (
        <ModalPortal onBackdropClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2"><i className="ph ph-wallet text-blue-600"></i> Værdi – Allokering</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><i className="ph ph-x text-lg"></i></button>
                </div>
                <div className="p-4 space-y-4">
                    <div className="flex items-center gap-2">
                        {['currency', 'country', 'ticker'].map(mode => (
                            <button key={mode} className={`px-3 py-1 rounded text-sm border capitalize ${allocationMode === mode ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-700'}`} onClick={() => setAllocationMode(mode)}>{mode === 'currency' ? 'Valuta' : mode === 'country' ? 'Land' : 'Ticker'}</button>
                        ))}
                    </div>
                    {items.length === 0 ? <div className="text-center text-gray-400 italic py-8">Ingen beholdninger.</div> : (
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
                    )}
                </div>
            </div>
        </ModalPortal>
    );
};

export const LiquidationModal = ({ onClose, liq }) => (
    <ModalPortal onBackdropClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><i className="ph ph-money text-emerald-600"></i> Likvidationsværdi</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><i className="ph ph-x text-lg"></i></button>
            </div>
            <div className="p-4 space-y-4">
                <div className="text-center p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div className="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-1">Netto Udbetaling (Estimat)</div>
                    <div className="text-3xl font-bold text-emerald-700 tracking-tight">{formatCurrencyNoDecimals(liq.netResult)}</div>
                    <div className="text-[10px] text-emerald-600 mt-1">Værdi i dag minus estimeret restskat</div>
                </div>
                <div className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-500 uppercase border-b border-gray-100 pb-1 mb-2">Skatteomkostninger</h4>
                    {(liq.taxBreakdown || []).map((item, i) => (
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
                        <div className="text-lg font-bold text-gray-800">{(liq.effectiveTaxRate || 0).toFixed(1)}%</div>
                    </div>
                    <div className="bg-gray-50 p-2 rounded border border-gray-100">
                        <div className="text-[10px] text-gray-500 uppercase">Netto Indskud</div>
                        <div className="text-lg font-bold text-gray-800">{formatCurrencyNoDecimals(liq.lifetimeNetInvested)}</div>
                    </div>
                </div>
            </div>
        </div>
    </ModalPortal>
);

export const GainModal = ({ onClose, breakdown, total }) => (
    <ModalPortal onBackdropClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><i className="ph ph-chart-pie-slice text-blue-600"></i> Gevinstfordeling</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><i className="ph ph-x text-lg"></i></button>
            </div>
            <div className="p-4 space-y-3">
                {breakdown.map((item, i) => (
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
                    <span className={`font-bold text-lg ${total >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrencyNoDecimals(total)}</span>
                </div>
            </div>
        </div>
    </ModalPortal>
);

export const MoversModal = ({ onClose, portfolio, marketData, getPositionValueWithPrev }) => (
    <ModalPortal onBackdropClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><i className="ph ph-arrow-up-right text-blue-600"></i> Top 3 bevægelser i dag</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><i className="ph ph-x text-lg"></i></button>
            </div>
            <div className="p-4 space-y-3">
                {(() => {
                    if (!portfolio || !marketData) return <div className="text-center text-gray-400 italic py-8">Ingen aktive bevægelser i dag.</div>;
                    const now = new Date();
                    const tickerMap = {};
                    Object.values(portfolio).forEach(p => {
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
);