import React from 'react';
import {
    TAX_LIMITS,
    calculateDanishTax,
    formatCurrency,
    formatCurrencyNoDecimals,
    formatNumber2
} from '../../utils'; 

const TaxReportView = ({ taxYear, settings, calc }) => {
    const r = calc.reports[taxYear] || {
        rubrik66: 0, rubrik38: 0, rubrik345: 0, rubrik61: 0, rubrik63: 0, withheldTax: 0,
        askGain: 0, askTax: 0, paidTax: 0, paidAskTax: 0, breakdown: { stocks: [], etfs: [], dividends: [] },
        utilizedLossNormal: 0, carriedLossNormal: 0, utilizedLossAsk: 0, carriedLossAsk: 0
    };

    const currentYearStr = new Date().getFullYear().toString();
    const isCurrentYear = taxYear === currentYearStr;

    // --- 1. CALCULATIONS ---
    const shareIncome = (r.rubrik66 || 0) + (r.rubrik38 || 0) + (r.rubrik61 || 0) + (r.rubrik63 || 0);

    // Taxable Income = Gross Income - Utilized Loss
    const taxableIncome = Math.max(0, shareIncome - r.utilizedLossNormal);

    // Tax Limits (27% bracket limit)
    const limitBase = TAX_LIMITS[taxYear] || 50000;
    const limitActual = limitBase * (settings.married ? 2 : 1);

    let taxBill = calculateDanishTax(taxableIncome, limitActual);

    // Capital Income Tax (Rubrik 345)
    const kapIncomeTax = (r.rubrik345 || 0) * 0.42;
    taxBill += kapIncomeTax;

    const taxToPay = Math.max(0, taxBill - (r.withheldTax || 0) - (r.paidTax || 0));
    const askTaxToPay = Math.max(0, (r.askTax || 0) - (r.paidAskTax || 0));

    // --- UNREALIZED GAINS PLANNING (Using Engine Data) ---
    // The engine provides 'unrealizedStockGain' which is strictly (Value - Cost) for realization-taxed stocks.
    const unrealized = calc.unrealizedStockGain || 0;
    
    // "Ekstra Skat" is the calculated tax liability if you sold everything today.
    // The engine calculates this as 'currentTax'
    const extraTaxIfSoldNow = calc.currentTax || 0;

    // Optimization Scenario: Spreading sales over years to stay in 27% bracket
    const remaining27Room = Math.max(0, limitActual - taxableIncome);
    
    // Simple math: If we could realize ALL of it at 27%, what would the tax be?
    // Note: This ignores ASK tax (17%), but 'unrealized' here usually refers to Stocks anyway.
    const optimalLiquidationTax = Math.max(0, unrealized) * 0.27; 

    const yearsToSellAll = (() => {
        if (unrealized <= 0) return 0;
        if (remaining27Room >= unrealized) return 1; 
        const remainingAfterThisYear = unrealized - remaining27Room;
        const extraYears = Math.ceil(remainingAfterThisYear / limitActual);
        return 1 + extraYears; 
    })();

    return (
        <div className="p-6 md:p-8 space-y-6 max-w-6xl mx-auto animate-in fade-in duration-300">

            {/* 1. SUMMARIES ROW */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* LEFT: NORMAL TAX (Frie Midler) */}
                <div className="card flex flex-col h-full relative overflow-hidden">
                    <div className="flex justify-between items-end mb-2">
                        <div>
                            <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                <i className="ph ph-briefcase text-blue-600"></i>Aktieindkomst
                            </h3>
                        </div>
                        <div className="text-right">
                            <div className={`text-xl font-bold leading-none ${taxableIncome >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                                {formatCurrencyNoDecimals(taxableIncome)}
                            </div>
                        </div>
                    </div>
                    {/* Minimalist Single-Line Bar */}
                    <div className="mb-8 flex items-center gap-3">
                        <div className="relative h-2.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="absolute top-0 left-0 h-full bg-blue-600 transition-all duration-500 ease-out"
                                style={{
                                    width: `${Math.min(100, (Math.min(taxableIncome, limitActual) / Math.max(taxableIncome, limitActual)) * 100)}%`,
                                    zIndex: 2
                                }}
                            />
                            {taxableIncome > limitActual && (
                                <div
                                    className="absolute top-0 left-0 h-full bg-orange-500 transition-all duration-500 ease-out"
                                    style={{
                                        width: '100%',
                                        clipPath: `inset(0 0 0 ${Math.min(100, (limitActual / taxableIncome) * 100)}%)`
                                    }}
                                />
                            )}
                            <div
                                className="absolute top-0 bottom-0 w-[2px] bg-white z-10 opacity-50 mix-blend-overlay"
                                style={{
                                    left: `${taxableIncome > limitActual ? (limitActual / taxableIncome) * 100 : 100}%`
                                }}
                            />
                        </div>
                        <span className={`text-xs font-bold font-mono min-w-[3.5rem] text-right ${taxableIncome > limitActual ? 'text-orange-500' : 'text-blue-600'}`}>
                            {taxableIncome > 0 ? ((taxBill / taxableIncome) * 100).toFixed(1) : '0.0'}%
                        </span>
                    </div>

                    <div className="space-y-3 mb-6 flex-1">
                        {[
                            { label: 'Gevinst/tab aktier', rubrik: '66', val: r.rubrik66 },
                            { label: 'Gevinst/tab ETF', rubrik: '38', val: r.rubrik38 },
                            { label: 'Udbytte (DK)', rubrik: '61', val: r.rubrik61 },
                            { label: 'Udbytte (Udland)', rubrik: '63', val: r.rubrik63 },
                        ].map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm border-b border-gray-50 pb-2 last:border-0">
                                <div className="flex items-center gap-2">
                                    <span className="bg-gray-100 text-gray-600 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded text-xs">
                                        R{item.rubrik}
                                    </span>
                                    <span className="text-gray-600">{item.label}</span>
                                </div>
                                <span className={`font-mono font-medium ${item.val < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                    {item.val !== 0 ? formatCurrencyNoDecimals(item.val) : '—'}
                                </span>
                            </div>
                        ))}

                        {r.utilizedLossNormal > 0 && (
                            <div className="flex justify-between items-center text-sm pt-2 text-green-700 bg-green-50 p-2 rounded border border-green-50">
                                <div className="flex items-center gap-2">
                                    <i className="ph ph-arrow-u-down-left"></i>
                                    <span>Fradrag fra tidligere års tab</span>
                                </div>
                                <span className="font-mono font-bold">-{formatCurrencyNoDecimals(r.utilizedLossNormal)}</span>
                            </div>
                        )}

                        {r.carriedLossNormal > 0 && shareIncome < 0 && (
                            <div className="flex justify-between items-center text-sm pt-2 text-gray-500 italic">
                                <span>Tab til fremførsel (næste år)</span>
                                <span className="font-mono">{formatCurrencyNoDecimals(r.carriedLossNormal)}</span>
                            </div>
                        )}

                        {r.rubrik345 !== 0 && (
                            <div className="flex justify-between items-center text-sm pt-2 mt-2 border-t border-gray-50 border-dashed">
                                <div className="flex items-center gap-2">
                                    <span className="bg-purple-100 text-purple-700 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded text-xs">R345</span>
                                    <span className="text-gray-600">Kapitalindkomst</span>
                                </div>
                                <span className="font-mono font-medium text-gray-900">{formatCurrencyNoDecimals(r.rubrik345)}</span>
                            </div>
                        )}
                    </div>

                    <div className="bg-gray-50 -mx-5 -mb-5 p-5 border-t border-gray-50 rounded-b-xl mt-auto">
                        <div className="space-y-1 text-sm mb-3">
                            <div className="flex justify-between text-gray-500">
                                <span>Beregnet skat</span>
                                <span>{formatCurrencyNoDecimals(taxBill)}</span>
                            </div>
                            <div className="flex justify-between text-green-600">
                                <span>Betalt udbytteskat</span>
                                <span>-{formatCurrencyNoDecimals(r.withheldTax || 0)}</span>
                            </div>
                            {(r.paidTax || 0) > 0 && (
                                <div className="flex justify-between text-green-600">
                                    <span>Allerede betalt</span>
                                    <span>-{formatCurrencyNoDecimals(r.paidTax)}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                            <span className="font-bold text-gray-900">Restskat</span>
                            <span className={`font-bold text-xl ${taxToPay > 0 ? 'text-blue-600' : 'text-green-600'}`}>
                                {formatCurrencyNoDecimals(taxToPay)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* RIGHT: ASK (Aktiesparekonto) */}
                <div className="card flex flex-col h-full">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                <i className="ph ph-bank text-teal-600"></i> Aktiesparekonto
                            </h3>
                        </div>
                        <div className="text-right">
                            <div className={`text-xl font-bold ${r.askGain >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatCurrencyNoDecimals(Math.max(0, r.askGain - r.utilizedLossAsk))}</div>
                        </div>
                    </div>

                    <div className="flex-1">
                        {r.askGain === 0 && r.askTax === 0 && r.utilizedLossAsk === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full pb-10 text-gray-400 text-sm italic">
                                <i className="ph ph-prohibit text-2xl mb-2 text-gray-300"></i>
                                Ingen aktivitet på ASK.
                            </div>
                        ) : (
                            <div className="space-y-3 mb-6 mt-8">
                                <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-teal-50 text-teal-700 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded text-xs">Lager</span>
                                        <span className="text-gray-600">Gevinst/tab</span>
                                    </div>
                                    <span className="font-mono font-medium text-gray-900">{formatCurrencyNoDecimals(r.askGain)}</span>
                                </div>
                                {r.utilizedLossAsk > 0 && (
                                    <div className="flex justify-between items-center text-sm text-green-700 bg-green-50 p-2 rounded border border-green-50">
                                        <div className="flex items-center gap-2">
                                            <i className="ph ph-arrow-u-down-left"></i>
                                            <span>Modregnet tab</span>
                                        </div>
                                        <span className="font-mono font-bold">-{formatCurrencyNoDecimals(r.utilizedLossAsk)}</span>
                                    </div>
                                )}
                                {r.carriedLossAsk > 0 && r.askGain < 0 && (
                                    <div className="flex justify-between items-center text-sm text-gray-500 italic pb-2">
                                        <span>Tab til fremførsel</span>
                                        <span className="font-mono">{formatCurrencyNoDecimals(r.carriedLossAsk)}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="bg-gray-50 -mx-5 -mb-5 p-5 border-t border-teal-50 rounded-b-xl mt-auto">
                        <div className="space-y-1 text-sm mb-3">
                            <div className="flex justify-between text-gray-500">
                                <span>Beregnet skat</span>
                                <span>{formatCurrencyNoDecimals(r.askTax)}</span>
                            </div>
                            {(r.paidAskTax || 0) > 0 && (
                                <div className="flex justify-between text-green-600">
                                    <span>Allerede betalt</span>
                                    <span>-{formatCurrencyNoDecimals(r.paidAskTax)}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                            <span className="font-bold text-teal-900">Restskat</span>
                            <span className="font-bold text-xl text-teal-700">{formatCurrencyNoDecimals(askTaxToPay)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Additional Tax if All Sold (Standalone) */}
            {isCurrentYear && (
                <div className="card">
                    <div className="mb-2 flex items-center justify-between">
                        <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                            <i className="ph ph-magic-wand text-purple-600"></i>
                            Urealiserede gevinster (Aktier)
                        </h3>
                        <div className="text-right">
                            <div className={`text-xl font-bold leading-none ${unrealized >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                                {formatCurrencyNoDecimals(unrealized)}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Tile: Sell Everything Now */}
                        <div className="p-4 rounded border border-gray-50 bg-white">
                            <div className="text-xs font-bold text-gray-500 uppercase">Ekstra Skat</div>
                            <div className="mt-1 text-2xl font-bold text-purple-700">{formatCurrencyNoDecimals(extraTaxIfSoldNow)}</div>
                        </div>

                        {/* Tile: Optimal Liquidation (27%) */}
                        <div className="p-4 rounded border border-gray-50 bg-white">
                            <div className="text-xs font-bold text-gray-500 uppercase">Ekstra skat - ved 27%</div>
                            <div className="mt-1 text-2xl font-bold text-blue-700">{formatCurrencyNoDecimals(optimalLiquidationTax)}</div>
                        </div>

                        {/* Tile: Years to Complete */}
                        <div className="p-4 rounded border border-gray-50 bg-white">
                            <div className="text-xs font-bold text-gray-500 uppercase">År - ved 27%</div>
                            <div className="mt-1 text-2xl font-bold text-gray-900">{yearsToSellAll}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. DETAILS SECTION (Full Width) */}
            <div className="card">
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <i className="ph ph-list-magnifying-glass"></i> Transaktionsdetaljer
                </h3>

                <div className="space-y-10">
                    {/* Stocks Table */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-gray-100 pb-2">Aktier (Realisationsprincip)</h4>
                        {r.breakdown.stocks.length === 0 ? (
                            <p className="text-sm text-gray-400 italic">Ingen realiserede aktiegevinster.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-gray-500 bg-gray-50">
                                        <tr>
                                            <th className="py-2 px-3 rounded-l font-medium">Dato</th>
                                            <th className="py-2 px-3 font-medium">Papir</th>
                                            <th className="py-2 px-3 text-right font-medium">Antal</th>
                                            <th className="py-2 px-3 text-right font-medium">Køb</th>
                                            <th className="py-2 px-3 text-right font-medium">Salg</th>
                                            <th className="py-2 px-3 rounded-r text-right font-medium">Gevinst</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {r.breakdown.stocks.map((s, i) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{s.date}</td>
                                                <td className="py-2 px-3 font-medium text-gray-900">{s.ticker} <span className="text-gray-400 font-normal text-xs ml-1">({s.account})</span></td>
                                                <td className="py-2 px-3 text-right font-mono text-gray-600">{formatNumber2(s.qty)}</td>
                                                <td className="py-2 px-3 text-right font-mono text-gray-600">{formatCurrency(s.costBasis)}</td>
                                                <td className="py-2 px-3 text-right font-mono text-gray-600">{formatCurrency(s.proceeds)}</td>
                                                <td className={`py-2 px-3 text-right font-mono font-bold ${s.gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {formatCurrency(s.gain)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Dividends Table */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-gray-100 pb-2">Udbytter</h4>
                        {r.breakdown.dividends.length === 0 ? (
                            <p className="text-sm text-gray-400 italic">Ingen udbytter.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-gray-500 bg-gray-50">
                                        <tr>
                                            <th className="py-2 px-3 rounded-l font-medium">Dato</th>
                                            <th className="py-2 px-3 font-medium">Papir</th>
                                            <th className="py-2 px-3 text-right font-medium">Brutto</th>
                                            <th className="py-2 px-3 rounded-r text-right font-medium">Tilbageholdt Skat</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {r.breakdown.dividends.map((d, i) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{d.date}</td>
                                                <td className="py-2 px-3 font-medium text-gray-900">{d.ticker}</td>
                                                <td className="py-2 px-3 text-right font-mono text-gray-900">{formatCurrency(d.amount)}</td>
                                                <td className="py-2 px-3 text-right font-mono text-gray-500">{formatCurrency(d.withheldTax)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* ETF Table */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-gray-100 pb-2">ETF (Lagerbeskattet)</h4>
                        {r.breakdown.etfs.length === 0 ? (
                            <p className="text-sm text-gray-400 italic">Ingen ETF'er.</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {r.breakdown.etfs.map((e, i) => (
                                    <div key={i} className="border border-gray-100 rounded p-3 hover:bg-gray-50">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-bold text-gray-900 text-sm">{e.ticker} <span className="font-normal text-gray-400 text-xs">({e.account})</span></span>
                                            <span className={`font-mono font-bold text-sm ${e.gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(e.gain)}</span>
                                        </div>
                                        <div className="text-[10px] text-gray-500 font-mono flex justify-between">
                                            <span>Ultimo: {formatCurrencyNoDecimals(e.ultimoVal)}</span>
                                            <span>Primo: {formatCurrencyNoDecimals(e.primoVal)}</span>
                                            <span>Netto Køb: {formatCurrencyNoDecimals(e.netFlows)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};

export default TaxReportView;