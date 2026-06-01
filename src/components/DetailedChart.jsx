import React from 'react';
import { getLocalISO, formatNumber2 } from '../utils';

const DetailedChart = ({ holding, history, livePrice, allPositions, currentIndex, onNavigate }) => {
    if (!history || history.length === 0) return <div className="p-4 text-center text-gray-500">Intet data</div>;

    // Sort ALL transactions for this ticker across all accounts by date
    const txs = [...(holding.txs || [])].sort((a, b) => a.date - b.date);

    const firstTx = txs[0];
    if (!firstTx) return <div className="p-4 text-center text-gray-500">Ingen transaktioner</div>;

    const startDateStr = getLocalISO(firstTx.date);
    const chartHistory = history.filter(h => h.date >= startDateStr);

    // Build points array from history
    let points = chartHistory.map(h => ({ date: h.date, price: h.close }));
    const todayStr = getLocalISO(new Date());
    if (livePrice > 0 && points.length > 0 && points[points.length - 1].date < todayStr) {
        points.push({ date: todayStr, price: livePrice });
    } else if (livePrice > 0 && points.length > 0 && points[points.length - 1].date === todayStr) {
        points[points.length - 1].price = livePrice;
    }

    if (points.length < 2) return <div className="p-4 text-center text-gray-500">For lidt data</div>;

    // Replay transactions to get daily quantity and mark buy/sell events
    let currentQty = 0;
    let txIdx = 0;
    const dayData = points.map(pt => {
        let dailyBuys = 0;
        let dailySells = 0;
        let dailyBuyQty = 0;
        let dailySellQty = 0;
        while (txIdx < txs.length && getLocalISO(txs[txIdx].date) <= pt.date) {
            const tx = txs[txIdx];
            if (tx.type === 'BUY') {
                currentQty += tx.qty;
                dailyBuys++;
                dailyBuyQty += tx.qty;
            } else if (tx.type === 'SELL') {
                const sellAmount = Math.abs(tx.qty);
                currentQty -= sellAmount;
                dailySells++;
                dailySellQty += sellAmount;
            }
            txIdx++;
        }
        return { ...pt, qty: Math.max(0, currentQty), dailyBuys, dailySells, dailyBuyQty, dailySellQty };
    });

    // SVG sizing
    const w = 700;
    const h = 280;
    const marginTop = 30;
    const marginBottom = 40;
    const marginLeft = 55;
    const marginRight = 20;
    const chartW = w - marginLeft - marginRight;
    const chartH = h - marginTop - marginBottom;

    const prices = dayData.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = (maxPrice - minPrice) || 1;
    const pPadding = priceRange * 0.08;
    const vMin = minPrice - pPadding;
    const vMax = maxPrice + pPadding;
    const vRange = vMax - vMin;

    const maxQty = Math.max(...dayData.map(d => d.qty), 1);

    const getX = (index) => marginLeft + (index / (dayData.length - 1)) * chartW;
    const getY = (price) => marginTop + chartH - ((price - vMin) / vRange) * chartH;
    const getQtyY = (qty) => marginTop + chartH - (qty / maxQty) * (chartH * 0.35);

    // Build periods based on holding state
    const segments = [];
    let currentSegment = null;

    dayData.forEach((d, i) => {
        const hasHolding = d.qty > 0.001;
        if (!currentSegment) {
            currentSegment = { hasHolding, startIndex: i, endIndex: i };
        } else if (currentSegment.hasHolding === hasHolding) {
            currentSegment.endIndex = i;
        } else {
            segments.push(currentSegment);
            currentSegment = { hasHolding, startIndex: i - 1, endIndex: i };
        }
    });
    if (currentSegment) segments.push(currentSegment);

    // Quantity area path
    const qtyAreaPath = [
        `M ${getX(0)},${marginTop + chartH}`,
        ...dayData.map((d, i) => `L ${getX(i)},${getQtyY(d.qty)}`),
        `L ${getX(dayData.length - 1)},${marginTop + chartH}`,
        `Z`
    ].join(' ');

    // Date labels - show ~5 evenly spaced
    const labelCount = Math.min(5, dayData.length);
    const dateLabels = [];
    for (let i = 0; i < labelCount; i++) {
        const idx = Math.round((i / (labelCount - 1)) * (dayData.length - 1));
        dateLabels.push({ idx, date: dayData[idx].date });
    }

    // Price labels on Y-axis - 4 ticks
    const priceLabels = [];
    for (let i = 0; i <= 3; i++) {
        const price = vMin + (i / 3) * vRange;
        priceLabels.push({ price, y: getY(price) });
    }

    // Calculate total return
    const firstPrice = dayData[0].price;
    const lastPrice = dayData[dayData.length - 1].price;
    const totalReturnPct = ((lastPrice - firstPrice) / firstPrice) * 100;

    // Navigation
    const hasPrev = allPositions && currentIndex > 0;
    const hasNext = allPositions && currentIndex < allPositions.length - 1;

    return (
        <div className="w-full">
            {/* Header with stats */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4">
                    {hasPrev && (
                        <button onClick={() => onNavigate(currentIndex - 1)} className="text-gray-400 hover:text-gray-700 text-lg px-2 py-1 border rounded hover:bg-gray-50">&larr;</button>
                    )}
                    <div>
                        <div className="text-lg font-bold">{holding.ticker}</div>
                        <div className="text-xs text-gray-500">{holding.acc}</div>
                    </div>
                    {hasNext && (
                        <button onClick={() => onNavigate(currentIndex + 1)} className="text-gray-400 hover:text-gray-700 text-lg px-2 py-1 border rounded hover:bg-gray-50">&rarr;</button>
                    )}
                </div>
                <div className="flex gap-4 text-sm">
                    <div>
                        <span className="text-gray-500">Periode: </span>
                        <span className="font-mono">{dayData[0].date}</span>
                        <span className="text-gray-400 mx-1">&rarr;</span>
                        <span className="font-mono">{dayData[dayData.length - 1].date}</span>
                    </div>
                    <div>
                        <span className="text-gray-500">Afkast: </span>
                        <span className={`font-bold ${totalReturnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatNumber2(totalReturnPct)}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="flex gap-4 mb-2 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block"></span> Køb</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span> Salg</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-600 inline-block"></span> Stigning</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-600 inline-block"></span> Fald</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-gray-400 inline-block"></span> Ingen beholdning</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-100 border border-blue-300 inline-block"></span> Antal</span>
            </div>

            {/* Chart */}
            <svg width="100%" height="320" viewBox={`0 0 ${w} ${h}`} className="overflow-visible bg-white border border-gray-100 rounded">
                {/* Grid lines */}
                {priceLabels.map((pl, i) => (
                    <g key={`grid-${i}`}>
                        <line x1={marginLeft} y1={pl.y} x2={w - marginRight} y2={pl.y} stroke="#f0f0f0" strokeWidth="1" />
                        <text x={marginLeft - 5} y={pl.y + 4} textAnchor="end" fontSize="9" fill="#999">{formatNumber2(pl.price)}</text>
                    </g>
                ))}

                {/* Quantity Underlay */}
                <path d={qtyAreaPath} fill="rgba(59, 130, 246, 0.1)" stroke="rgba(59, 130, 246, 0.25)" strokeWidth="1" />

                {/* Quantity labels (right side) */}
                <text x={w - marginRight + 3} y={marginTop + chartH} fontSize="8" fill="#93c5fd" textAnchor="start">0</text>
                <text x={w - marginRight + 3} y={getQtyY(maxQty) + 3} fontSize="8" fill="#93c5fd" textAnchor="start">{Math.round(maxQty)}</text>

                {/* Price Line Segments colored by holding period performance */}
                {segments.map((seg, idx) => {
                    const segData = dayData.slice(seg.startIndex, seg.endIndex + 1);
                    if (segData.length < 2) return null;

                    let strokeColor = "#9ca3af"; // gray for no holding
                    if (seg.hasHolding) {
                        const startPrice = segData[0].price;
                        const endPrice = segData[segData.length - 1].price;
                        strokeColor = endPrice >= startPrice ? "#16a34a" : "#dc2626";
                    }

                    const pts = segData.map((d, i) => `${getX(seg.startIndex + i)},${getY(d.price)}`).join(' ');

                    return (
                        <polyline
                            key={idx}
                            points={pts}
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    );
                })}

                {/* Buy / Sell Events */}
                {dayData.map((d, i) => {
                    const elements = [];
                    const x = getX(i);
                    const y = getY(d.price);

                    if (d.dailyBuys > 0) {
                        elements.push(
                            <g key={`buy-${i}`}>
                                <circle cx={x} cy={y} r="5" fill="#3b82f6" stroke="#fff" strokeWidth="1.5" />
                                <text x={x} y={y - 10} textAnchor="middle" fontSize="8" fill="#3b82f6" fontWeight="bold">+{formatNumber2(d.dailyBuyQty)}</text>
                            </g>
                        );
                    }
                    if (d.dailySells > 0) {
                        elements.push(
                            <g key={`sell-${i}`}>
                                <circle cx={x} cy={y} r="5" fill="#f59e0b" stroke="#fff" strokeWidth="1.5" />
                                <text x={x} y={y + 16} textAnchor="middle" fontSize="8" fill="#f59e0b" fontWeight="bold">-{formatNumber2(d.dailySellQty)}</text>
                            </g>
                        );
                    }
                    return elements;
                })}

                {/* Date labels at bottom */}
                {dateLabels.map(({ idx, date }) => (
                    <text key={`date-${idx}`} x={getX(idx)} y={h - 5} textAnchor="middle" fontSize="9" fill="#999">
                        {date.slice(2)} {/* show YY-MM-DD */}
                    </text>
                ))}
            </svg>

            {/* Transaction log */}
            <div className="mt-3 max-h-32 overflow-y-auto text-xs border rounded p-2 bg-gray-50">
                <table className="w-full">
                    <thead className="text-gray-500">
                        <tr>
                            <th className="text-left pb-1">Dato</th>
                            <th className="text-left pb-1">Type</th>
                            <th className="text-right pb-1">Antal</th>
                            <th className="text-right pb-1">Pris</th>
                        </tr>
                    </thead>
                    <tbody>
                        {txs.filter(tx => tx.type === 'BUY' || tx.type === 'SELL').map((tx, i) => (
                            <tr key={i} className="border-t border-gray-100">
                                <td className="py-0.5 font-mono">{getLocalISO(tx.date)}</td>
                                <td className={`py-0.5 ${tx.type === 'BUY' ? 'text-blue-600' : 'text-amber-600'}`}>
                                    {tx.type === 'BUY' ? 'Køb' : 'Salg'}
                                </td>
                                <td className="py-0.5 text-right font-mono">{formatNumber2(Math.abs(tx.qty))}</td>
                                <td className="py-0.5 text-right font-mono">{formatNumber2(tx.price)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default DetailedChart;
