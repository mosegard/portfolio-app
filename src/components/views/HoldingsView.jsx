import React, { useState, useMemo } from 'react';
import {
    formatDanishNumber,
    formatCurrency,
    formatNumber2,
    getLocalISO
} from '../../utils';
import ModalPortal from '../ModalPortal';
import Sparkline from '../Sparkline';
import DetailedChart from '../DetailedChart';

const HoldingsView = ({ portfolio, marketData, loading, lastUpdate }) => {
    const [selectedIndex, setSelectedIndex] = useState(null);

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

    // --- Build full position list: active first (sorted by value desc), then closed (sorted by last tx date desc) ---
    const { activeList, closedList, allPositions } = useMemo(() => {
        const allEntries = Object.values(portfolio);
        const active = allEntries.filter(p => Math.abs(p.qty) > 0.01);
        const closed = allEntries.filter(p =>
            Math.abs(p.qty) <= 0.01 &&
            p.txs &&
            p.txs.some(t => t.type === 'SELL')
        );

        // Sort active by value descending
        active.sort((a, b) => {
            const mA = marketData[a.ticker] || {};
            const mB = marketData[b.ticker] || {};
            const priceA = mA.price || 0;
            const priceB = mB.price || 0;
            const fxA = (marketData[`${a.cur}DKK=X`] || {}).price || 1;
            const fxB = (marketData[`${b.cur}DKK=X`] || {}).price || 1;
            return (b.qty * priceB * fxB) - (a.qty * priceA * fxA);
        });

        // Sort closed by last transaction date descending
        closed.sort((a, b) => {
            const lastA = a.txs[a.txs.length - 1]?.date || 0;
            const lastB = b.txs[b.txs.length - 1]?.date || 0;
            return lastB - lastA;
        });

        return { activeList: active, closedList: closed, allPositions: [...active, ...closed] };
    }, [portfolio, marketData]);

    const now = new Date();

    // --- CALCULATE TOTALS (only for active) ---
    let totalVal = 0;
    let totalCost = 0;
    let totalUnrealized = 0;
    let dayGain_Active = 0;
    let prevVal_Active = 0;
    let activeCount = 0;
    let dayGain_All = 0;
    let prevVal_All = 0;

    activeList.forEach(p => {
        const m = marketData[p.ticker] || {};
        const { val, price, prevClose, fxRate } = getPositionValueWithPrev(p);
        const cost = p.qty * p.avg;
        totalVal += val;
        totalCost += cost;

        const lastTrade = new Date((m.lastTradeTime || 0) * 1000);
        const isToday = lastTrade.getDate() === now.getDate() &&
            lastTrade.getMonth() === now.getMonth() &&
            lastTrade.getFullYear() === now.getFullYear();

        let dailyGainVal = 0;
        if (price > 0 && prevClose > 0) {
            dailyGainVal = (price - prevClose) * p.qty * fxRate;
        }
        const prevVal = val - dailyGainVal;

        dayGain_All += dailyGainVal;
        prevVal_All += prevVal;

        if (isToday) {
            activeCount++;
            dayGain_Active += dailyGainVal;
            prevVal_Active += prevVal;
        }
    });

    totalUnrealized = totalVal - totalCost;
    const totalUnrealizedPct = totalCost > 0 ? (totalUnrealized / totalCost) * 100 : 0;
    const showActiveTotal = activeCount > 0;
    const finalTotalDayGain = showActiveTotal ? dayGain_Active : dayGain_All;
    const finalTotalPrevVal = showActiveTotal ? prevVal_Active : prevVal_All;
    const finalTotalDayPct = finalTotalPrevVal > 0 ? (finalTotalDayGain / finalTotalPrevVal) * 100 : 0;

    // --- Sparkline data helper ---
    const getSparkData = (p) => {
        const m = marketData[p.ticker] || {};
        const price = m.price ?? m.previousClose ?? 0;
        const prevClose = m.previousClose ?? price;
        const isActive = Math.abs(p.qty) > 0.01;

        let startDateStr = null;
        if (isActive) {
            startDateStr = p.currentHoldingStartDate ? getLocalISO(p.currentHoldingStartDate) : (p.firstBuyDate ? getLocalISO(p.firstBuyDate) : null);
        } else {
            startDateStr = p.firstBuyDate ? getLocalISO(p.firstBuyDate) : null;
        }

        let sparkData = [];
        if (m.history && startDateStr) {
            if (isActive) {
                sparkData = m.history.filter(h => h.date >= startDateStr).map(h => h.close);
            } else {
                const sellTxs = (p.txs || []).filter(t => t.type === 'SELL').sort((a, b) => b.date - a.date);
                const endDateStr = sellTxs.length > 0 ? getLocalISO(sellTxs[0].date) : null;
                if (endDateStr) {
                    sparkData = m.history.filter(h => h.date >= startDateStr && h.date <= endDateStr).map(h => h.close);
                } else {
                    sparkData = m.history.filter(h => h.date >= startDateStr).map(h => h.close);
                }
            }
        }

        if (isActive && price > 0 && sparkData.length > 0 && sparkData[sparkData.length - 1] !== price) {
            sparkData.push(price);
        }
        if (isActive && sparkData.length < 2 && price > 0 && prevClose > 0) {
            sparkData = [prevClose, price];
        }

        return sparkData;
    };

    // --- Realized gain for closed positions ---
    const calcRealizedGain = (p) => {
        let totalCostDKK = 0;
        let totalProceedsDKK = 0;
        (p.txs || []).forEach(tx => {
            const fxR = tx.fxRate || 1;
            const comm = (tx.commission || 0) * fxR;
            if (tx.type === 'BUY') {
                totalCostDKK += tx.qty * tx.price * fxR + comm;
            } else if (tx.type === 'SELL') {
                totalProceedsDKK += Math.abs(tx.qty) * tx.price * fxR - comm;
            }
        });
        return { gain: totalProceedsDKK - totalCostDKK, costBasis: totalCostDKK };
    };

    const handleNavigate = (newIndex) => {
        setSelectedIndex(newIndex);
    };

    const openChart = (positionIndex) => {
        setSelectedIndex(positionIndex);
    };

    const selectedPosition = selectedIndex !== null ? allPositions[selectedIndex] : null;

    // --- Render a position row ---
    const renderRow = (p, globalIndex, isClosed) => {
        const m = marketData[p.ticker] || {};
        const { val, price, prevClose, fxRate } = getPositionValueWithPrev(p);
        const gain = isClosed ? 0 : val - (p.qty * p.avg);
        const costBasis = isClosed ? 0 : (p.qty * p.avg);
        const pct = costBasis > 0 ? (gain / costBasis) * 100 : null;

        const lastTradeTime = m.lastTradeTime || 0;
        const lastTradeDate = new Date(lastTradeTime * 1000);
        const nowSec = Math.floor(Date.now() / 1000);
        const diffSeconds = nowSec - lastTradeTime;

        const isStockToday = lastTradeDate.getDate() === now.getDate() &&
            lastTradeDate.getMonth() === now.getMonth() &&
            lastTradeDate.getFullYear() === now.getFullYear();

        const isMarketOpen = lastTradeTime > 0 && diffSeconds < 2700;

        let dailyGainVal = 0;
        let dailyPct = 0;
        let debugTitle = "No Data";

        if (!isClosed && price > 0 && prevClose > 0) {
            const dailyDiff = price - prevClose;
            dailyGainVal = dailyDiff * p.qty * fxRate;
            dailyPct = (dailyDiff / prevClose) * 100;
            debugTitle = `Live: ${price}\nPrev: ${prevClose}`;
        }

        const sparkData = getSparkData(p);
        const sparkPositive = sparkData.length >= 2 ? sparkData[sparkData.length - 1] >= sparkData[0] : true;

        return (
            <tr key={p.ticker + p.acc} className={`hover:bg-gray-50 ${isClosed ? 'opacity-60' : ''}`}>
                <td className="px-1 py-3 font-medium text-gray-900 flex items-center gap-2 whitespace-nowrap">
                    {!isClosed && (
                        <span
                            className={`w-2.5 h-2.5 rounded-full ${isMarketOpen ? 'bg-green-500 animate-pulse shadow-[0_0_5px_rgba(34,197,94,0.6)]' : 'bg-gray-300'}`}
                            title={isMarketOpen ? `Active (${Math.floor(diffSeconds / 60)}m ago)` : `Closed (${Math.floor(diffSeconds / 3600)}h ago)`}
                        ></span>
                    )}
                    {isClosed && <span className="w-2.5 h-2.5 rounded-full bg-gray-200"></span>}
                    {p.ticker}
                </td>

                <td className="px-1 py-3 text-right whitespace-nowrap hidden xl:table-cell">
                    {isClosed ? <span className="text-gray-400">0</span> : formatDanishNumber(p.qty, 10)}
                </td>

                <td className="px-1 py-3 text-right font-mono font-medium text-blue-700 whitespace-nowrap hidden sm:table-cell">
                    {!isClosed && price > 0 ? <span>{formatNumber2(price)}</span> : <span className="text-gray-300">-</span>}
                </td>

                <td className={`px-1 py-3 text-right font-medium whitespace-nowrap ${isClosed ? 'text-gray-300' : (!isStockToday ? 'text-gray-400' : (dailyGainVal >= 0 ? 'text-green-600' : 'text-red-600'))}`}>
                    {isClosed ? '-' : (price > 0 ? formatCurrency(dailyGainVal) : '-')}
                </td>

                <td className={`px-1 py-3 text-right border-b border-dotted border-gray-200 whitespace-nowrap ${isClosed ? 'text-gray-300' : (!isStockToday ? 'text-gray-400' : (dailyPct >= 0 ? 'text-green-600' : 'text-red-600'))}`}
                    title={isClosed ? '' : debugTitle}
                >
                    {isClosed ? '-' : (price > 0 ? `${formatNumber2(dailyPct)}%` : '-')}
                </td>

                <td className="px-1 py-1 text-center hidden md:table-cell align-middle">
                    {sparkData.length >= 2 ? (
                        <div className="flex justify-center">
                            <Sparkline data={sparkData} positive={sparkPositive} onClick={() => openChart(globalIndex)} />
                        </div>
                    ) : (
                        <span className="text-gray-300 cursor-pointer" onClick={() => openChart(globalIndex)}>-</span>
                    )}
                </td>

                <td className="px-1 py-3 text-right font-bold whitespace-nowrap hidden lg:table-cell">
                    {isClosed ? '-' : formatCurrency(val)}
                </td>
                <td className={`px-1 py-3 text-right whitespace-nowrap ${isClosed ? 'text-gray-300' : (gain >= 0 ? 'text-green-600' : 'text-red-600')}`}>
                    {isClosed ? '-' : formatCurrency(gain)}
                </td>
                <td className={`px-1 py-3 text-right whitespace-nowrap hidden sm:table-cell ${isClosed ? 'text-gray-300' : (gain >= 0 ? 'text-green-600' : 'text-red-600')}`}>
                    {isClosed ? '-' : (pct === null ? '\u2014' : `${formatNumber2(pct)}%`)}
                </td>
            </tr>
        );
    };

    return (
        <div className="p-6 md:p-8 relative">
            {selectedPosition && (
                <ModalPortal onBackdropClick={() => setSelectedIndex(null)}>
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl mx-auto mt-10 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-2">
                            <div className="text-sm text-gray-500">
                                {selectedIndex + 1} / {allPositions.length}
                            </div>
                            <button onClick={() => setSelectedIndex(null)} className="text-gray-400 text-2xl hover:text-gray-700 leading-none">
                                &times;
                            </button>
                        </div>
                        <DetailedChart
                            holding={selectedPosition}
                            history={(marketData[selectedPosition.ticker] || {}).history || []}
                            livePrice={(marketData[selectedPosition.ticker] || {}).price ?? (marketData[selectedPosition.ticker] || {}).previousClose ?? 0}
                            allPositions={allPositions}
                            currentIndex={selectedIndex}
                            onNavigate={handleNavigate}
                        />
                    </div>
                </ModalPortal>
            )}
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
                                <th className="px-1 py-3 text-center whitespace-nowrap hidden md:table-cell">Trend</th>
                                <th className="px-1 py-3 text-right whitespace-nowrap hidden lg:table-cell">V&#230;rdi</th>
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
                                <td className={`px-1 py-3 text-right whitespace-nowrap ${!showActiveTotal ? 'text-gray-400' : (finalTotalDayGain >= 0 ? 'text-green-600' : 'text-red-600')}`}>
                                    {formatCurrency(finalTotalDayGain)}
                                </td>
                                <td className={`px-1 py-3 text-right whitespace-nowrap ${!showActiveTotal ? 'text-gray-400' : (finalTotalDayPct >= 0 ? 'text-green-600' : 'text-red-600')}`}>
                                    {formatNumber2(finalTotalDayPct)}%
                                </td>
                                <td className="px-1 py-3 text-center whitespace-nowrap hidden md:table-cell"></td>
                                <td className="px-1 py-3 text-right whitespace-nowrap hidden lg:table-cell">{formatCurrency(totalVal)}</td>
                                <td className={`px-1 py-3 text-right whitespace-nowrap ${totalUnrealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(totalUnrealized)}</td>
                                <td className={`px-1 py-3 text-right whitespace-nowrap hidden sm:table-cell ${totalUnrealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatNumber2(totalUnrealizedPct)}%</td>
                            </tr>
                        </tbody>

                        {/* Active holdings */}
                        <tbody className="divide-y">
                            {activeList.map((p, i) => renderRow(p, i, false))}
                        </tbody>

                    </table>
                </div>

                {/* ── Tidligere beholdninger ── */}
                {closedList.length > 0 && (
                    <div className="border-t border-gray-200">
                        <div className="px-2 py-3 text-xs text-gray-500 uppercase font-semibold tracking-wide">
                            Tidligere beholdninger ({closedList.length})
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-xs uppercase text-gray-400">
                                    <tr>
                                        <th className="px-1 py-2 whitespace-nowrap">Ticker</th>
                                        <th className="px-1 py-2 whitespace-nowrap hidden sm:table-cell">Konto</th>
                                        <th className="px-1 py-2 whitespace-nowrap hidden md:table-cell">Periode</th>
                                        <th className="px-1 py-2 text-center whitespace-nowrap hidden md:table-cell">Trend</th>
                                        <th className="px-1 py-2 text-right whitespace-nowrap">Gevinst/Tab</th>
                                        <th className="px-1 py-2 text-right whitespace-nowrap hidden sm:table-cell">%</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {closedList.map((p, i) => {
                                        const { gain, costBasis } = calcRealizedGain(p);
                                        const pct = costBasis > 0 ? (gain / costBasis) * 100 : null;
                                        const sparkData = getSparkData(p);
                                        const sparkPositive = sparkData.length >= 2
                                            ? sparkData[sparkData.length - 1] >= sparkData[0]
                                            : gain >= 0;
                                        const globalIndex = activeList.length + i;
                                        const lastSellTx = [...(p.txs || [])]
                                            .filter(t => t.type === 'SELL')
                                            .sort((a, b) => b.date - a.date)[0];
                                        const fmtD = (d) => d
                                            ? new Date(d).toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit', year: '2-digit' })
                                            : '?';
                                        return (
                                            <tr key={p.ticker + p.acc} className="hover:bg-gray-50">
                                                <td className="px-1 py-2 font-medium text-gray-600 whitespace-nowrap flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0"></span>
                                                    <span
                                                        className="cursor-pointer hover:text-blue-600"
                                                        onClick={() => openChart(globalIndex)}
                                                    >{p.ticker}</span>
                                                </td>
                                                <td className="px-1 py-2 text-gray-400 whitespace-nowrap hidden sm:table-cell text-xs">
                                                    {p.acc}
                                                </td>
                                                <td className="px-1 py-2 text-gray-400 whitespace-nowrap hidden md:table-cell text-xs font-mono">
                                                    {p.firstBuyDate
                                                        ? `${fmtD(p.firstBuyDate)} – ${fmtD(lastSellTx?.date)}`
                                                        : '–'}
                                                </td>
                                                <td className="px-1 py-1 text-center hidden md:table-cell align-middle">
                                                    {sparkData.length >= 2 ? (
                                                        <div className="flex justify-center">
                                                            <Sparkline data={sparkData} positive={sparkPositive} onClick={() => openChart(globalIndex)} />
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-300">–</span>
                                                    )}
                                                </td>
                                                <td className={`px-1 py-2 text-right font-medium whitespace-nowrap ${gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {formatCurrency(gain)}
                                                </td>
                                                <td className={`px-1 py-2 text-right whitespace-nowrap hidden sm:table-cell ${gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {pct !== null ? `${formatNumber2(pct)}%` : '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
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
