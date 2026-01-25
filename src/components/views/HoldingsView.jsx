import React from 'react';
import {
    formatDanishNumber,
    formatCurrency,
    formatNumber2
} from '../../utils';

const HoldingsView = ({ portfolio, marketData, loading, lastUpdate }) => {

    // --- Local Helper Functions ---
    const getFxRate = (cur) => {
        const C = (cur || '').toUpperCase();
        if (!C || C === 'DKK') return 1;
        const fxM = marketData[`${C}DKK=X`] || {};
        return (fxM.price ?? fxM.previousClose ?? 1);
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

    // --- Main Logic ---
    let list = Object.values(portfolio).filter(p => Math.abs(p.qty) > 0.01);

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

export default HoldingsView;