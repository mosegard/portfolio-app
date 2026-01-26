import { useMemo, useCallback } from 'react';
import { getLocalISO } from '../utils';

// --- Pure Helper (Moved outside to prevent re-creation) ---
const mergeByDate = (seriesMap) => {
    const dateSet = new Set();
    Object.values(seriesMap).forEach(arr => arr.forEach(d => dateSet.add(d.date)));
    const dates = Array.from(dateSet).sort();
    const maps = {};
    Object.keys(seriesMap).forEach(t => { maps[t] = new Map(seriesMap[t].map(d => [d.date, d.value])); });
    
    const findLatest = (t, date) => {
        const m = seriesMap[t];
        if (!m || m.length === 0) return undefined;
        for (let i = m.length - 1; i >= 0; i--) { if (m[i].date <= date) return m[i].value; }
        return undefined;
    };
    return dates.map(d => {
        const row = { date: d };
        Object.keys(seriesMap).forEach(t => {
            const v = maps[t].get(d);
            row[t] = (v !== undefined) ? v : findLatest(t, d);
        });
        return row;
    });
};

// --- Hook ---
export default function useDashboardChartData(calc, marketData, settings, graphRange, customRange, selectedTickers) {
    
    // --- Helpers (Memoized) ---
    const getFxRate = useCallback((cur) => {
        const C = (cur || '').toUpperCase();
        if (!C || C === 'DKK') return 1;
        const fxM = marketData[`${C}DKK=X`] || {};
        return (fxM.price ?? fxM.previousClose ?? 1);
    }, [marketData]);

    const getPositionValueWithPrev = useCallback((p) => {
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
    }, [marketData, getFxRate]);

    // --- 1. Today's Gain Calculation ---
    const todayStats = useMemo(() => {
        let todayGain = 0;
        let todayPct = 0;
        let activeCount = 0;
        const portfolio = calc.portfolio || {};

        if (Object.keys(portfolio).length > 0 && marketData) {
            let totalVal = 0;
            let totalPrevVal = 0;
            const now = new Date();
            
            Object.values(portfolio).forEach(p => {
                const m = marketData[p.ticker] || {};
                const lastTrade = new Date((m.lastTradeTime || 0) * 1000);
                const isToday = lastTrade.getDate() === now.getDate() && lastTrade.getMonth() === now.getMonth() && lastTrade.getFullYear() === now.getFullYear();
                
                if (isToday) {
                    activeCount++;
                    const { val, prevVal } = getPositionValueWithPrev(p);
                    totalVal += val;
                    totalPrevVal += prevVal;
                }
            });

            if (activeCount > 0) {
                todayGain = totalVal - totalPrevVal;
                todayPct = totalPrevVal > 0 ? (todayGain / totalPrevVal) * 100 : 0;
            }
        }
        return { todayGain, todayPct, activeCount };
    }, [calc.portfolio, marketData, getPositionValueWithPrev]);

    // --- 2. Data Filtering Logic (Memoized) ---
    const getFilteredData = useCallback((dataset, isGrowth = false) => {
        if (!dataset || dataset.length === 0) return [];
        if (graphRange === 'ALL') return dataset;

        let sliced = [];

        if (graphRange === 'CUSTOM' && customRange.startIso && customRange.endIso) {
            const startIso = customRange.startIso <= customRange.endIso ? customRange.startIso : customRange.endIso;
            const endIso = customRange.startIso <= customRange.endIso ? customRange.endIso : customRange.startIso;
            sliced = dataset.filter(d => d.date >= startIso && d.date <= endIso);
        } else {
            const now = new Date();
            let startDate = new Date();
            let endDate = null;

            if (graphRange === '1M') {
                startDate.setMonth(now.getMonth() - 1);
            } else if (graphRange === 'YTD') {
                startDate = new Date(now.getFullYear(), 0, 1);
            } else if (!isNaN(Number(graphRange))) {
                startDate = new Date(Number(graphRange), 0, 1);
                endDate = new Date(Number(graphRange), 11, 31);
            }

            const isoStart = getLocalISO(startDate);
            sliced = dataset.filter(d => d.date >= isoStart);
            if (endDate) {
                const isoEnd = getLocalISO(endDate);
                sliced = sliced.filter(d => d.date <= isoEnd);
            }
        }

        if (isGrowth && sliced.length > 0) {
            const baseVal = sliced[0].value;
            const baseMult = (baseVal / 100) + 1;
            return sliced.map(d => {
                const curMult = (d.value / 100) + 1;
                const newVal = ((curMult / baseMult) - 1) * 100;
                return { ...d, value: newVal };
            });
        }
        return sliced;
    }, [graphRange, customRange]);

    // --- 3. Final Data Preparation (Memoized) ---
    const chartData = useMemo(() => {
        const holdingGraphs = calc.holdingGraphsByTicker || {};
        const isMulti = (selectedTickers || []).length > 1;
        const isSingle = (selectedTickers || []).length === 1;
        const sel = selectedTickers || [];

        // Base Data
        const baseValue = isSingle ? (holdingGraphs[sel[0]]?.value || []) 
            : isMulti ? mergeByDate(Object.fromEntries(sel.map(t => [t, holdingGraphs[t]?.value || []]))) 
            : (calc.totalValueGraph || []);
            
        const baseGrowth = isSingle ? (holdingGraphs[sel[0]]?.growth || []) 
            : isMulti ? mergeByDate(Object.fromEntries(sel.map(t => [t, holdingGraphs[t]?.growth || []]))) 
            : (calc.growthGraphData || []);

        // Filtered Data
        const displayValueData = getFilteredData(baseValue, false);
        const displayGrowthData = getFilteredData(baseGrowth, true);

        const toUnix = (dateStr) => new Date(dateStr).getTime();

        // Map Value Data (Standardizing Net Value)
        const numericValueData = displayValueData.map(d => ({ 
            ...d, 
            date: toUnix(d.date),
            netValue: d.netValue !== undefined ? d.netValue : d.value 
        }));

        // Benchmark Logic
        let mergedGrowthData = displayGrowthData;
        if (settings.benchmarkTicker && !isMulti && displayGrowthData.length > 0) {
            const hist = (marketData[settings.benchmarkTicker]?.history || []).slice();
            if (hist.length > 0) {
                const closeMap = new Map(hist.map(h => [h.date, h.close]));
                const startIso = displayGrowthData[0].date;
                let basePrice = null;
                
                // Find start price for benchmark
                if (closeMap.has(startIso)) basePrice = closeMap.get(startIso);
                if (basePrice == null) {
                    let candidate = null;
                    for (let i = hist.length - 1; i >= 0; i--) {
                        if (hist[i].date <= startIso) { candidate = hist[i].close; break; }
                    }
                    basePrice = candidate ?? hist[0].close;
                }

                if (basePrice && basePrice > 0) {
                    mergedGrowthData = displayGrowthData.map(d => {
                        let price = closeMap.get(d.date);
                        if (price == null) {
                            let p = null;
                            for (let i = hist.length - 1; i >= 0; i--) {
                                if (hist[i].date <= d.date) { p = hist[i].close; break; }
                            }
                            price = p ?? basePrice;
                        }
                        const benchRet = ((price / basePrice) - 1) * 100;
                        return { ...d, benchmark: benchRet };
                    });
                }
            }
        }

        const numericGrowthData = mergedGrowthData.map(d => ({ ...d, date: toUnix(d.date) }));

        return { numericValueData, numericGrowthData };
    }, [calc, marketData, settings.benchmarkTicker, selectedTickers, getFilteredData]);

    return { 
        todayStats, 
        numericValueData: chartData.numericValueData, 
        numericGrowthData: chartData.numericGrowthData,
        getFxRate,
        getPositionValueWithPrev
    };
}