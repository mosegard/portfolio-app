import { useMemo } from 'react';
import { TAX_LIMITS, calculateDanishTax, getLocalISO } from '../utils';

export default function usePortfolioEngine(
  txs,
  marketData,
  settings,
  config = { askAccount: '', currencies: {} },
  yearsArg
) {
  const years = useMemo(() => {
    if (Array.isArray(yearsArg) && yearsArg.length) return yearsArg;
    const yr = new Set((txs || []).map(t => t.date.getFullYear().toString()));
    yr.add(new Date().getFullYear().toString());
    return [...yr].sort().reverse();
  }, [txs, yearsArg]);

  const calc = useMemo(() => {
    // --- 1. INITIALIZATION ---
    if (!Array.isArray(txs) || txs.length === 0) {
      return {
        portfolio: {}, reports: {}, totalValueGraph: [], growthGraphData: [],
        currentVal: 0, currentTax: 0, costBasisTotal: 0,
        liquidation: { netResult: 0, allTimeGain: 0, lifetimeNetInvested: 0, totalHistoricTaxCost: 0, totalTaxBurden: 0, effectiveTaxRate: 0, taxBreakdown: [] },
        liquidationNormalTax: 0, unrealizedStockGain: 0, yearlyStats: [], warnings: [], holdingGraphsByTicker: {}
      };
    }

    let portfolio = {};
    let totalValueGraph = [];
    let growthGraphData = [];
    let yearlyStats = []; 
    const holdingGraphsByTicker = {}; 
    const executionWarnings = [];
    const globalStockState = {};
    const yearIndex = {};
    const etfKeys = new Set();
    const askKeys = new Set();
    const keyInfo = {};
    const currencyMap = {};

    // --- 2. HELPERS ---
    const getTaxLimit = (year) => {
      const yStr = year.toString();
      return TAX_LIMITS[yStr] || 50000; 
    };

    const getPrice = (t, dStr) => {
      const m = marketData?.[t];
      if (m?.history?.length) {
        const hit = m.history.find(h => h.date === dStr);
        if (hit) return hit.close;
        const prev = m.history.filter(h => h.date < dStr);
        if (prev.length) return prev[prev.length - 1].close;
      }
      for (let i = txs.length - 1; i >= 0; i--) {
        const tx = txs[i];
        if (tx.ticker === t) {
          const txDate = getLocalISO(tx.date);
          if (txDate <= dStr) return tx.price;
        }
      }
      return 0;
    };

    const getFx = (c, dStr) => {
      if (!c || c === 'DKK') return 1;
      const rate = getPrice(`${c}DKK=X`, dStr);
      return rate === 0 ? 1 : rate;
    };

    // --- 3. REPORT STRUCTURE ---
    const reports = {};
    const reportTemplate = () => ({
      rubrik66: 0, rubrik38: 0, rubrik345: 0, rubrik61: 0, rubrik63: 0,
      withheldTax: 0, askGain: 0, askTax: 0, paidTax: 0, paidAskTax: 0,
      totalNormalTax: 0, breakdown: { stocks: [], etfs: [], dividends: [] },
      utilizedLossNormal: 0, carriedLossNormal: 0,
      utilizedLossAsk: 0, carriedLossAsk: 0
    });
    years.forEach(y => { reports[y] = reportTemplate(); });

    const addToIndex = (y, key, tx) => {
      if (!yearIndex[y]) yearIndex[y] = {};
      if (!yearIndex[y][key]) yearIndex[y][key] = [];
      yearIndex[y][key].push(tx);
    };

    // --- 4. PROCESS TRANSACTIONS ---
    txs.forEach(tx => {
      const y = tx.date.getFullYear().toString();
      if (!reports[y]) reports[y] = reportTemplate();

      const key = `${tx.ticker}_${tx.account}`;
      const globalTickerKey = tx.ticker;
      const isASK = tx.account === config.askAccount;
      const isAssetETF = tx.assetType === 'ETF';

      if (tx.assetType === 'Stock' || tx.assetType === 'ETF') {
        addToIndex(y, key, tx);
        if (!keyInfo[key]) {
          keyInfo[key] = {
            ticker: tx.ticker, account: tx.account, cur: tx.currency,
            type: isAssetETF ? 'ETF' : 'Stock',
            isInventory: isASK || isAssetETF, // Lagerbeskattet
            isAskAccount: isASK
          };
          if (tx.currency) currencyMap[key] = tx.currency;
          if (isASK) askKeys.add(key);
          if (isAssetETF && !isASK) etfKeys.add(key);
        }
      }

      if (!portfolio[key]) portfolio[key] = { ticker: tx.ticker, qty: 0, cost: 0, avg: 0, acc: tx.account, cur: tx.currency };
      const pos = portfolio[key];

      if (!isASK && !isAssetETF && !globalStockState[globalTickerKey]) {
        globalStockState[globalTickerKey] = { totalQty: 0, totalCostDKK: 0, avgPriceDKK: 0 };
      }
      const glob = globalStockState[globalTickerKey];

      const dStr = getLocalISO(tx.date);
      const accCur = (config.currencies?.[tx.account]) || 'DKK';
      const accFx = getFx(accCur, dStr);
      const valDKK = Math.abs(tx.qty) * tx.price * tx.fxRate;
      const commissionDKK = tx.commission * accFx;
      const taxDKK = tx.tax * accFx;

      if (tx.type === 'DIVIDEND') {
        const amtDKK = tx.qty * (tx.price ?? 1) * tx.fxRate;
        if (isASK) reports[y].askGain += amtDKK;
        else {
          if (tx.currency === 'DKK') reports[y].rubrik61 += amtDKK;
          else reports[y].rubrik63 += amtDKK;
          reports[y].withheldTax += (taxDKK || 0);
          reports[y].breakdown.dividends.push({ date: dStr, ticker: tx.ticker, account: tx.account, amount: amtDKK, withheldTax: taxDKK || 0 });
        }
      }
      else if (tx.qty < 0 && (tx.assetType === 'Cash' || tx.type === 'TRANSFER' || !tx.ticker)) {
        const note = (tx.raw?.['Note'] || '').toLowerCase();
        const yearMatch = note.match(/(?:skat|tax).*?(\d{4})/);
        if (yearMatch) {
          const targetYear = yearMatch[1];
          if (reports[targetYear]) {
            const amount = Math.abs(tx.qty * tx.fxRate);
            if (tx.account === config.askAccount || note.includes('ask')) reports[targetYear].paidAskTax += amount;
            else reports[targetYear].paidTax += amount;
          }
        }
      }
      else if (tx.type === 'BUY') {
        pos.qty += tx.qty;
        const totalCostDKK = valDKK + commissionDKK;
        // For ASK/ETF, track cost per position
        if (isASK || isAssetETF) {
          pos.cost += totalCostDKK;
          pos.avg = pos.qty ? pos.cost / pos.qty : 0;
        } else {
          // For Stocks, track Global Average
          glob.totalQty += tx.qty;
          glob.totalCostDKK += totalCostDKK;
          glob.avgPriceDKK = glob.totalQty ? glob.totalCostDKK / glob.totalQty : 0;
        }
      }
      else if (tx.type === 'SELL') {
        const proceeds = valDKK - commissionDKK;
        const sellQty = Math.abs(tx.qty);
        pos.qty -= sellQty;
        
        if (isASK || isAssetETF) {
          pos.cost -= (sellQty * pos.avg);
        } else {
          const costBasis = sellQty * glob.avgPriceDKK;
          const gain = proceeds - costBasis;
          glob.totalQty -= sellQty;
          glob.totalCostDKK -= costBasis;
          reports[y].rubrik66 += gain;
          reports[y].breakdown.stocks.push({ date: dStr, ticker: tx.ticker, account: tx.account, qty: sellQty, gain, costBasis, proceeds });
        }
      }
    });

    // --- 4.5. CRITICAL FIX: SYNC GLOBAL AVERAGES TO PORTFOLIO ---
    // This was missing! It copies the global average price to individual stock holdings.
    Object.values(portfolio).forEach(p => {
      const pKey = `${p.ticker}_${p.acc}`;
      // If it's a normal stock (not inventory), use the Global Average Price we calculated above
      if (!keyInfo[pKey]?.isInventory && globalStockState[p.ticker]) {
        p.avg = globalStockState[p.ticker].avgPriceDKK;
        p.cost = p.qty * p.avg;
      }
    });

    // --- 5. INVENTORY MODEL (ETFs) ---
    const allYearsSorted = [...years].sort();
    const allInventoryKeys = new Set([...(etfKeys || []), ...(askKeys || [])]);
    const runningQtyMap = {};
    allInventoryKeys.forEach(k => { runningQtyMap[k] = 0; });

    allYearsSorted.forEach(y => {
      const primoDate = `${y}-01-01`;
      const ultimoDate = `${y}-12-31`;

      allInventoryKeys.forEach(key => {
        const { ticker, account } = keyInfo[key];
        const cur = currencyMap[key] || 'DKK';
        const isAccountASK = account === config.askAccount;

        const startQty = runningQtyMap[key];
        const pricePrimo = getPrice(ticker, primoDate);
        const fxPrimo = getFx(cur, primoDate);
        const primoVal = startQty * pricePrimo * fxPrimo;

        let flows = 0;
        let yearTransactions = [];
        const relevantTxs = (yearIndex[y] && yearIndex[y][key]) ? yearIndex[y][key] : [];

        relevantTxs.forEach(tx => {
          runningQtyMap[key] += tx.qty;
          const dStr = getLocalISO(tx.date);
          const valRaw = Math.abs(tx.qty * tx.price * tx.fxRate);
          const accCur = (config.currencies?.[tx.account]) || 'DKK';
          const costRaw = tx.commission * getFx(accCur, dStr);

          if (tx.type === 'BUY') {
            flows += (valRaw + costRaw);
            yearTransactions.push({ date: dStr, type: 'Køb', qty: Math.abs(tx.qty), amount: valRaw + costRaw });
          } else if (tx.type === 'SELL') {
            flows -= (valRaw - costRaw);
            yearTransactions.push({ date: dStr, type: 'Salg', qty: Math.abs(tx.qty), amount: valRaw - costRaw });
          }
        });

        const endQty = runningQtyMap[key];
        const priceUltimo = getPrice(ticker, ultimoDate);
        const fxUltimo = getFx(cur, ultimoDate);
        const ultimoVal = endQty * priceUltimo * fxUltimo;

        const gain = ultimoVal - primoVal - flows;

        if (primoVal !== 0 || ultimoVal !== 0 || flows !== 0) {
          if (isAccountASK) reports[y].askGain += gain;
          else {
            reports[y].rubrik38 += gain;
            reports[y].breakdown.etfs.push({ ticker, account, gain, primoQty: startQty, primoVal, ultimoQty: endQty, ultimoVal, netFlows: flows, transactions: yearTransactions });
          }
        }
      });

      reports[y].askTax = Math.max(0, reports[y].askGain * 0.17);
      const r = reports[y];
      const shareIncome = r.rubrik66 + r.rubrik38 + r.rubrik61 + r.rubrik63;
      const limit = getTaxLimit(y) * (settings?.married ? 2 : 1);
      reports[y].totalNormalTax = calculateDanishTax(shareIncome, limit);
      if (r.rubrik345 > 0) reports[y].totalNormalTax += r.rubrik345 * 0.42;
    });

    // --- 6. LOSS CARRYFORWARD (Historical) ---
    let runningLossNormal = 0;
    let runningLossAsk = 0;

    allYearsSorted.forEach(y => {
      const r = reports[y];
      const shareIncomeRaw = r.rubrik66 + r.rubrik38 + r.rubrik61 + r.rubrik63;

      if (shareIncomeRaw < 0) {
        runningLossNormal += Math.abs(shareIncomeRaw);
        r.carriedLossNormal = runningLossNormal;
      } else {
        if (runningLossNormal > 0) {
          const used = Math.min(runningLossNormal, shareIncomeRaw);
          r.utilizedLossNormal = used;
          runningLossNormal -= used;
        }
        r.carriedLossNormal = runningLossNormal;
      }

      if (r.askGain < 0) {
        runningLossAsk += Math.abs(r.askGain);
        r.carriedLossAsk = runningLossAsk;
      } else {
        if (runningLossAsk > 0) {
          const used = Math.min(runningLossAsk, r.askGain);
          r.utilizedLossAsk = used;
          runningLossAsk -= used;
        }
        r.carriedLossAsk = runningLossAsk;
      }

      const taxableShareIncome = Math.max(0, shareIncomeRaw - r.utilizedLossNormal);
      const limit = getTaxLimit(y) * (settings?.married ? 2 : 1);
      r.totalNormalTax = calculateDanishTax(taxableShareIncome, limit);
      if (r.rubrik345 > 0) r.totalNormalTax += r.rubrik345 * 0.42;

      const taxableAsk = Math.max(0, r.askGain - r.utilizedLossAsk);
      r.askTax = taxableAsk * 0.17;
    });

    // --- 7. GRAPH GENERATION ---
    if (txs.length > 0) {
      const timeTxs = [...txs].sort((a, b) => a.date - b.date);
      let d = new Date(timeTxs[0].date);
      const now = new Date();
      const historyPortfolio = {};
      let txCursor = 0;
      let twrMultiplier = 1.0;
      let prevDayValue = 0;
      
      let lastYearProcessed = null;
      let carryForwardAsk = 0;
      
      totalValueGraph.push({ date: getLocalISO(d), value: 0, invested: 0, netValue: 0 });
      growthGraphData.push({ date: getLocalISO(d), value: 0 });

      while (d <= now) {
        const dStr = getLocalISO(d);
        const currentYear = d.getFullYear();
        
        // Yearly Reset & Loss Carry-Forward Logic
        if (lastYearProcessed && currentYear > lastYearProcessed) {
            let yearEndAskResult = 0;
            for (const key in historyPortfolio) {
                const p = historyPortfolio[key];
                if (keyInfo[key]?.isInventory) {
                    const price = getPrice(p.ticker, dStr);
                    const fx = getFx(p.cur, dStr);
                    const marketVal = (p.qty * price * fx);
                    
                    const gain = marketVal - p.taxCostBasis;
                    if (p.acc === config.askAccount) yearEndAskResult += gain;
                    
                    // Reset Cost Basis
                    p.taxCostBasis = marketVal; 
                }
            }
            const netResult = yearEndAskResult - carryForwardAsk;
            if (netResult < 0) carryForwardAsk = Math.abs(netResult);
            else carryForwardAsk = 0;
        }
        lastYearProcessed = currentYear;

        let dayInvestedFlow = 0;
        const holdingDayFlow = {};

        // Process daily transactions
        while (txCursor < timeTxs.length && timeTxs[txCursor].date <= d) {
          const tx = timeTxs[txCursor];
          const key = `${tx.ticker}_${tx.account}`;
          const accCur = (config.currencies?.[tx.account]) || 'DKK';
          const accFx = getFx(accCur, dStr);

          if (tx.assetType === 'Stock' || tx.assetType === 'ETF') {
            if (!historyPortfolio[key]) {
                historyPortfolio[key] = { 
                    qty: 0, cost: 0, taxCostBasis: 0, 
                    cur: tx.currency, ticker: tx.ticker, acc: tx.account 
                };
            }
            const p = historyPortfolio[key];
            const tradeValDKK = (Math.abs(tx.qty) * tx.price * tx.fxRate);
            const commDKK = (tx.commission * accFx);

            if (tx.type === 'BUY') {
              dayInvestedFlow += (tradeValDKK + commDKK);
              holdingDayFlow[tx.ticker] = (holdingDayFlow[tx.ticker] || 0) + (tradeValDKK + commDKK);
              p.qty += tx.qty;
              p.cost += (tradeValDKK + commDKK);
              p.taxCostBasis += (tradeValDKK + commDKK); 
            } else if (tx.type === 'SELL') {
              dayInvestedFlow -= (tradeValDKK - commDKK);
              holdingDayFlow[tx.ticker] = (holdingDayFlow[tx.ticker] || 0) - (tradeValDKK - commDKK);
              if (p.qty > 0) {
                const avgCost = p.cost / p.qty;
                const avgTaxCost = p.taxCostBasis / p.qty;
                const soldQty = Math.abs(tx.qty);
                p.cost -= (avgCost * soldQty);
                p.taxCostBasis -= (avgTaxCost * soldQty);
              }
              p.qty -= Math.abs(tx.qty);
            }
          } else if (tx.type === 'DIVIDEND') {
            const divValDKK = (tx.qty * (tx.price ?? 1) * tx.fxRate);
            const taxDKK = (tx.tax * accFx);
            dayInvestedFlow -= (divValDKK - taxDKK);
          }
          txCursor++;
        }

        let dayAssetValue = 0;
        let dayInvestedSum = 0;
        let dayUnrealizedGainAsk = 0;
        let dayUnrealizedGainNormal = 0;
        const perTickerDayValue = {};
        const perTickerInvested = {};

        for (const key in historyPortfolio) {
          const p = historyPortfolio[key];
          if (Math.abs(p.qty) > 0.0001) {
            const price = getPrice(p.ticker, dStr);
            const fx = getFx(p.cur, dStr);
            let posVal = 0;
            if (price) {
              posVal = (p.qty * price * fx);
              dayAssetValue += posVal;
              const tkr = p.ticker;
              perTickerDayValue[tkr] = (perTickerDayValue[tkr] || 0) + posVal;
            }
            dayInvestedSum += p.cost;
            
            const isInventory = keyInfo[key]?.isInventory;
            const isAskAccount = p.acc === config.askAccount;
            let gain = 0;
            if (isInventory) gain = posVal - p.taxCostBasis; 
            else gain = posVal - p.cost;

            if (isAskAccount) dayUnrealizedGainAsk += gain; 
            else dayUnrealizedGainNormal += gain;

            const tkr2 = p.ticker;
            perTickerInvested[tkr2] = (perTickerInvested[tkr2] || 0) + p.cost;
          }
        }

        let estimatedTaxLiability = 0;
        const taxableGainAsk = Math.max(0, dayUnrealizedGainAsk - carryForwardAsk);
        if (taxableGainAsk > 0) estimatedTaxLiability += (taxableGainAsk * 0.17);
        
        if (dayUnrealizedGainNormal > 0) {
            const yearStr = d.getFullYear().toString();
            const yearLimit = getTaxLimit(yearStr) * (settings?.married ? 2 : 1);
            estimatedTaxLiability += calculateDanishTax(dayUnrealizedGainNormal, yearLimit);
        }

        const dayNetValue = dayAssetValue - estimatedTaxLiability;

        const adjustedStart = prevDayValue + (dayInvestedFlow * 0.5);
        const dailyProfit = dayAssetValue - prevDayValue - dayInvestedFlow;

        if (adjustedStart > 1) {
          const dailyReturn = dailyProfit / adjustedStart;
          twrMultiplier = twrMultiplier * (1 + dailyReturn);
        }
        prevDayValue = dayAssetValue;

        if (twrMultiplier !== 1 || dayAssetValue > 0) {
          totalValueGraph.push({ date: dStr, value: dayAssetValue, invested: dayInvestedSum, netValue: dayNetValue });
          growthGraphData.push({ date: dStr, value: (twrMultiplier - 1) * 100 });
        }

        // Ticker Graphs
        for (const tkr in perTickerDayValue) {
            const curVal = perTickerDayValue[tkr] || 0;
            const flow = holdingDayFlow[tkr] || 0;
            if (!holdingGraphsByTicker[tkr]) holdingGraphsByTicker[tkr] = { twr: 1.0, prev: 0, value: [], growth: [] };
            const h = holdingGraphsByTicker[tkr];
            const adjustedStartH = h.prev + (flow * 0.5);
            const dailyProfitH = curVal - h.prev - flow;
            if (adjustedStartH > 1) {
                const dailyReturnH = dailyProfitH / adjustedStartH;
                h.twr = h.twr * (1 + dailyReturnH);
            }
            h.prev = curVal;
            const inv = perTickerInvested[tkr] || 0;
            h.value.push({ date: dStr, value: curVal, invested: inv });
            h.growth.push({ date: dStr, value: (h.twr - 1) * 100 });
        }
        d.setDate(d.getDate() + 1);
      }

      // --- 9. YEARLY STATS ---
      if (totalValueGraph.length > 0) {
        const firstYear = parseInt(totalValueGraph[0].date.slice(0, 4), 10);
        const lastYear = parseInt(totalValueGraph[totalValueGraph.length - 1].date.slice(0, 4), 10);
        const nearest = (target, dataset) => dataset.find(p => p.date >= target);

        for (let y = lastYear; y >= firstYear; y--) {
          const startNode = nearest(`${y}-01-01`, growthGraphData);
          let endNode = nearest(`${y}-12-31`, growthGraphData);
          if (y === new Date().getFullYear()) endNode = growthGraphData[growthGraphData.length - 1];
          else if (!endNode) {
            const yearData = growthGraphData.filter(p => p.date.startsWith(y.toString()));
            if (yearData.length) endNode = yearData[yearData.length - 1];
          }
          let yearReturn = 0;
          if (startNode && endNode) {
            const startMult = 1 + (startNode.value / 100);
            const endMult = 1 + (endNode.value / 100);
            yearReturn = ((endMult / startMult) - 1) * 100;
          }

          let vStart = 0; let vEnd = 0;
          const prevYearEnd = nearest(`${y - 1}-12-31`, totalValueGraph);
          if (prevYearEnd) vStart = prevYearEnd.value;
          else {
            const prevYearData = totalValueGraph.filter(p => p.date.startsWith((y - 1).toString()));
            if (prevYearData.length) vStart = prevYearData[prevYearData.length - 1].value;
          }
          const currYearEnd = nearest(`${y}-12-31`, totalValueGraph);
          if (currYearEnd) vEnd = currYearEnd.value;
          else if (y === new Date().getFullYear()) vEnd = totalValueGraph[totalValueGraph.length - 1].value;

          let netInvested = 0;
          let bankFlow = 0; let flowIn = 0; let flowOut = 0;

          txs.forEach(tx => {
            if (tx.date.getFullYear() === y) {
              const accCur = (config.currencies?.[tx.account]) || 'DKK';
              const accFx = getFx(accCur, getLocalISO(tx.date));
              if (tx.type === 'BUY') netInvested += (Math.abs(tx.qty) * tx.price * tx.fxRate) + (tx.commission * accFx);
              else if (tx.type === 'SELL') netInvested -= ((Math.abs(tx.qty) * tx.price * tx.fxRate) - (tx.commission * accFx));
              else if (tx.type === 'DIVIDEND') netInvested -= ((tx.qty * (tx.price ?? 1) * tx.fxRate) - (tx.tax * accFx));

              if (tx.assetType === 'Cash' && tx.type !== 'DIVIDEND' && tx.type !== 'INTEREST') {
                const val = (tx.qty * tx.fxRate);
                bankFlow += val;
                if (val > 0) flowIn += val; else flowOut += val;
              }
            }
          });

          yearlyStats.push({
            year: y,
            return: yearReturn,
            flow: bankFlow,
            gainAbs: vEnd - vStart - netInvested,
            breakdown: { in: flowIn, out: flowOut }
          });
        }
      }
    }

    // --- 10. CURRENT STATUS ---
    let currentVal = 0;
    let costBasisTotal = 0;
    let unrealizedRubrik66Gain = 0;
    const todayStr = getLocalISO(new Date());
    
    Object.values(portfolio).forEach(p => {
      if (Math.abs(p.qty) < 0.01) return;
      const price = getPrice(p.ticker, todayStr);
      const fx = getFx(p.cur, todayStr);
      const val = p.qty * price * fx;
      currentVal += val;
      costBasisTotal += (p.qty * p.avg); // Now correct because p.avg is synced!
      const pKey = `${p.ticker}_${p.acc}`;
      if (!keyInfo[pKey]?.isInventory) {
        unrealizedRubrik66Gain += (val - (p.qty * p.avg));
      }
    });

    let finalNetValue = currentVal;
    if (totalValueGraph.length > 0) {
        const lastPoint = totalValueGraph[totalValueGraph.length - 1];
        if (lastPoint) {
            finalNetValue = lastPoint.netValue;
        }
    }
    
    const currentTax = Math.max(0, currentVal - finalNetValue);

    const historicalGain = Object.values(reports).reduce((acc, r) =>
      acc + (r.rubrik66 || 0) + (r.rubrik38 || 0) + (r.rubrik345 || 0) + (r.rubrik61 || 0) + (r.rubrik63 || 0) + (r.askGain || 0), 0
    );
    const allTimeGain = historicalGain + unrealizedRubrik66Gain;
    const taxStats = Object.values(reports).reduce((acc, r) => ({
      normalTaxBill: acc.normalTaxBill + (r.totalNormalTax || 0),
      askTaxBill: acc.askTaxBill + (r.askTax || 0),
      divWithheld: acc.divWithheld + (r.withheldTax || 0)
    }), { normalTaxBill: 0, askTaxBill: 0, divWithheld: 0 });

    const totalHistoricTaxCost = taxStats.normalTaxBill + taxStats.askTaxBill;
    const totalTaxBurden = totalHistoricTaxCost + currentTax;
    const lifetimeNetInvested = yearlyStats.reduce((sum, y) => sum + (y.flow || 0), 0);
    const effectiveTaxRate = allTimeGain > 0 ? (totalTaxBurden / allTimeGain) * 100 : 0;
    const taxBreakdown = [
      { label: 'Skat betalt af udbytte', val: taxStats.divWithheld, icon: 'ph-coins', color: 'text-green-600', bg: 'bg-green-50' },
      { label: 'Skat af aktigevinster', val: Math.max(0, taxStats.normalTaxBill - taxStats.divWithheld), icon: 'ph-receipt', color: 'text-blue-600', bg: 'bg-blue-50' },
      { label: 'ASK Skat', val: taxStats.askTaxBill, icon: 'ph-piggy-bank', color: 'text-teal-600', bg: 'bg-teal-50' },
      { label: 'Urealiserede gevinster', val: currentTax, icon: 'ph-magic-wand', color: 'text-purple-600', bg: 'bg-purple-50', italic: true }
    ];

    const liquidation = {
      netResult: finalNetValue, 
      allTimeGain,
      lifetimeNetInvested,
      totalHistoricTaxCost,
      totalTaxBurden,
      effectiveTaxRate,
      taxBreakdown
    };

    return {
      portfolio, reports, totalValueGraph, growthGraphData,
      currentVal, currentTax, costBasisTotal, liquidation,
      liquidationNormalTax: 0, unrealizedStockGain: unrealizedRubrik66Gain, yearlyStats, warnings: executionWarnings,
      holdingGraphsByTicker
    };
  }, [txs, marketData, settings, config, years]);

  return calc;
}