import React, { useState, useRef, useEffect } from 'react';
import ModalPortal from './ModalPortal';
import FlatpickrDate from './FlatpickrDate';
import { CURRENCY_OPTIONS, normalizeDate } from '../utils';

const today = () => normalizeDate(new Date().toISOString().split('T')[0]);

const Field = ({ label, children }) => (
    <div className="space-y-1">
        <label className="text-xs font-medium text-gray-600">{label}</label>
        {children}
    </div>
);

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none";
const selectCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 outline-none bg-white";

// ─── TICKER COMBOBOX ────────────────────────────────────────────────
const TickerCombobox = ({ value, onChange, tickers = [] }) => {
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const wrapperRef = useRef(null);

    const filtered = tickers.filter(t =>
        t.toLowerCase().includes(value.toLowerCase())
    );

    useEffect(() => {
        const handleClick = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const showList = open && filtered.length > 0;

    return (
        <div ref={wrapperRef} className="relative">
            <div className="flex">
                <input
                    className={`${inputCls} rounded-r-none border-r-0`}
                    value={value}
                    onChange={e => { onChange(e.target.value); setOpen(true); }}
                    onFocus={() => { setFocused(true); setOpen(true); }}
                    onBlur={() => setFocused(false)}
                    placeholder="e.g. AAPL"
                    required
                />
                <button
                    type="button"
                    className="px-2 border border-gray-200 rounded-r-lg bg-gray-50 hover:bg-gray-100 text-gray-500"
                    onClick={() => setOpen(prev => !prev)}
                    tabIndex={-1}
                >
                    <i className={`ph ph-caret-${open ? 'up' : 'down'} text-sm`}></i>
                </button>
            </div>
            {showList && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-auto">
                    {filtered.map(t => (
                        <button
                            key={t}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 focus:bg-blue-50"
                            onMouseDown={() => { onChange(t); setOpen(false); }}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── BUY / SELL MODAL ──────────────────────────────────────────────
export const BuySellModal = ({ type, onClose, onSubmit, accounts, tickers = [], filterAccount, defaultCurrency }) => {
    const isSell = type === 'sell';
    const [form, setForm] = useState({
        date: today(),
        account: filterAccount !== 'All' ? filterAccount : (accounts[0] || ''),
        assetType: 'Stock',
        ticker: '',
        qty: '',
        price: '',
        currency: defaultCurrency,
        fxRate: '1',
        commission: '',
    });

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const handleSubmit = (e) => {
        e.preventDefault();
        const qty = parseFloat(form.qty.replace(',', '.')) || 0;
        const price = parseFloat(form.price.replace(',', '.')) || 0;
        const fxRate = parseFloat(form.fxRate.replace(',', '.')) || 1;
        const commission = parseFloat(form.commission.replace(',', '.')) || 0;

        onSubmit([{
            _id: crypto.randomUUID(),
            _createdAt: Date.now(),
            'Date': form.date,
            'Type': form.assetType,
            'Ticker': form.ticker.toUpperCase().trim(),
            'Qty': isSell ? -Math.abs(qty) : Math.abs(qty),
            'Price': price,
            'FxRate': fxRate,
            'Commission': commission,
            'Withheld Tax': 0,
            'Currency': form.currency,
            'Account': form.account,
            'Note': `${isSell ? 'Sell' : 'Buy'} ${form.ticker.toUpperCase().trim()}`
        }]);
        onClose();
    };

    return (
        <ModalPortal onBackdropClick={onClose}>
            <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <i className={`ph ${isSell ? 'ph-arrow-down-right' : 'ph-arrow-up-right'} ${isSell ? 'text-red-500' : 'text-green-500'}`}></i>
                    {isSell ? 'Sell' : 'Buy'} Stock/ETF
                </h2>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Date">
                        <FlatpickrDate value={form.date} onChange={v => set('date', v)} />
                    </Field>
                    <Field label="Account">
                        <select className={selectCls} value={form.account} onChange={e => set('account', e.target.value)}>
                            {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Asset Type">
                        <select className={selectCls} value={form.assetType} onChange={e => set('assetType', e.target.value)}>
                            <option value="Stock">Stock</option>
                            <option value="ETF">ETF</option>
                        </select>
                    </Field>
                    <Field label="Ticker">
                        <TickerCombobox value={form.ticker} onChange={v => set('ticker', v)} tickers={tickers} />
                    </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Quantity">
                        <input className={inputCls} inputMode="decimal" value={form.qty} onChange={e => set('qty', e.target.value)} placeholder="0" required />
                    </Field>
                    <Field label="Price per unit">
                        <input className={inputCls} inputMode="decimal" value={form.price} onChange={e => set('price', e.target.value)} placeholder="0,00" required />
                    </Field>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <Field label="Currency">
                        <select className={selectCls} value={form.currency} onChange={e => set('currency', e.target.value)}>
                            {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </Field>
                    <Field label="FX Rate">
                        <input className={inputCls} inputMode="decimal" value={form.fxRate} onChange={e => set('fxRate', e.target.value)} />
                    </Field>
                    <Field label="Commission">
                        <input className={inputCls} inputMode="decimal" value={form.commission} onChange={e => set('commission', e.target.value)} placeholder="0" />
                    </Field>
                </div>

                <div className="flex gap-2 pt-2">
                    <button type="submit" className={`flex-1 py-2 rounded-lg text-white font-medium ${isSell ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                        {isSell ? 'Sell' : 'Buy'}
                    </button>
                    <button type="button" onClick={onClose} className="px-4 py-2 text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
            </form>
        </ModalPortal>
    );
};

// ─── CASH TRANSFER MODAL ────────────────────────────────────────────
export const CashTransferModal = ({ onClose, onSubmit, accounts, filterAccount, config, detectedCurrencies }) => {
    const getCurrency = (acc) => (config.currencies[acc] || detectedCurrencies[acc] || 'DKK').toUpperCase();

    const initFrom = filterAccount !== 'All' ? filterAccount : (accounts[0] || '');
    const initTo = accounts.length > 1 ? accounts.find(a => a !== initFrom) || '' : '';

    const [form, setForm] = useState({
        date: today(),
        fromAccount: initFrom,
        toAccount: initTo,
        toExternal: false,
        fromAmount: '',
        toAmount: '',
    });

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const fromCurrency = getCurrency(form.fromAccount);
    const toCurrency = form.toAccount ? getCurrency(form.toAccount) : fromCurrency;
    const sameCurrency = fromCurrency === toCurrency;

    // Compute implied FxRate for cross-currency transfers
    const fromAmtPreview = parseFloat((form.fromAmount || '').replace(',', '.')) || 0;
    const toAmtPreview = parseFloat((form.toAmount || '').replace(',', '.')) || 0;
    const impliedRate = !sameCurrency && fromAmtPreview > 0 && toAmtPreview > 0
        ? (fromCurrency === 'DKK' ? fromAmtPreview / toAmtPreview
           : toCurrency === 'DKK' ? toAmtPreview / fromAmtPreview
           : null)
        : null;
    const impliedForeignCur = fromCurrency === 'DKK' ? toCurrency : toCurrency === 'DKK' ? fromCurrency : null;

    const handleSubmit = (e) => {
        e.preventDefault();
        const fromAmt = parseFloat(form.fromAmount.replace(',', '.')) || 0;
        const toAmt = sameCurrency ? fromAmt : (parseFloat(form.toAmount.replace(',', '.')) || fromAmt);
        const now = Date.now();

        // Calculate FxRate for non-DKK sides
        let fromFx = 1, toFx = 1;
        if (!sameCurrency && fromAmt > 0 && toAmt > 0) {
            if (fromCurrency === 'DKK') {
                toFx = fromAmt / toAmt;  // DKK per 1 foreign unit
            } else if (toCurrency === 'DKK') {
                fromFx = toAmt / fromAmt;  // DKK per 1 foreign unit
            }
        }

        const rows = [];

        // Outgoing from source account (negative qty)
        rows.push({
            _id: crypto.randomUUID(),
            _createdAt: now,
            'Date': form.date,
            'Type': 'Cash',
            'Ticker': fromCurrency,
            'Qty': -Math.abs(fromAmt),
            'Price': 1,
            'FxRate': fromFx,
            'Commission': 0,
            'Withheld Tax': 0,
            'Currency': fromCurrency,
            'Account': form.fromAccount,
            'Note': form.toExternal ? `Transfer out (external)` : `Transfer to ${form.toAccount}`
        });

        // Incoming to destination (only if not external)
        if (!form.toExternal && form.toAccount) {
            rows.push({
                _id: crypto.randomUUID(),
                _createdAt: now + 1,
                'Date': form.date,
                'Type': 'Cash',
                'Ticker': toCurrency,
                'Qty': Math.abs(toAmt),
                'Price': 1,
                'FxRate': toFx,
                'Commission': 0,
                'Withheld Tax': 0,
                'Currency': toCurrency,
                'Account': form.toAccount,
                'Note': `Transfer from ${form.fromAccount}`
            });
        }

        onSubmit(rows);
        onClose();
    };

    return (
        <ModalPortal onBackdropClick={onClose}>
            <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <i className="ph ph-arrows-left-right text-blue-500"></i>
                    Cash Transfer
                </h2>

                <Field label="Date">
                    <FlatpickrDate value={form.date} onChange={v => set('date', v)} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="From Account">
                        <select className={selectCls} value={form.fromAccount} onChange={e => set('fromAccount', e.target.value)}>
                            {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </Field>
                    <Field label={`Amount (${fromCurrency})`}>
                        <input className={inputCls} inputMode="decimal" value={form.fromAmount} onChange={e => set('fromAmount', e.target.value)} placeholder="0,00" required />
                    </Field>
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" className="accent-blue-600" checked={form.toExternal} onChange={e => set('toExternal', e.target.checked)} />
                    Transfer to external (withdrawal)
                </label>

                {!form.toExternal && (
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="To Account">
                            <select className={selectCls} value={form.toAccount} onChange={e => set('toAccount', e.target.value)}>
                                {accounts.filter(a => a !== form.fromAccount).map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </Field>
                        {!sameCurrency && (
                            <Field label={`Amount received (${toCurrency})`}>
                                <input className={inputCls} inputMode="decimal" value={form.toAmount} onChange={e => set('toAmount', e.target.value)} placeholder="0,00" required />
                            </Field>
                        )}
                    </div>
                )}

                {impliedRate && impliedForeignCur && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-sm text-blue-700">
                        <i className="ph ph-arrows-left-right"></i>
                        <span>Implied rate: <span className="font-mono font-medium">{impliedRate.toFixed(4)}</span> DKK per 1 {impliedForeignCur}</span>
                    </div>
                )}

                <div className="flex gap-2 pt-2">
                    <button type="submit" className="flex-1 py-2 rounded-lg text-white font-medium bg-blue-600 hover:bg-blue-700">Transfer</button>
                    <button type="button" onClick={onClose} className="px-4 py-2 text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
            </form>
        </ModalPortal>
    );
};

// ─── DIVIDEND MODAL ─────────────────────────────────────────────────
export const DividendModal = ({ onClose, onSubmit, accounts, tickers = [], filterAccount, defaultCurrency }) => {
    const [form, setForm] = useState({
        date: today(),
        account: filterAccount !== 'All' ? filterAccount : (accounts[0] || ''),
        ticker: '',
        amount: '',
        currency: defaultCurrency,
        fxRate: '1',
        withheldTax: '',
    });

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const handleSubmit = (e) => {
        e.preventDefault();
        const amount = parseFloat(form.amount.replace(',', '.')) || 0;
        const fxRate = parseFloat(form.fxRate.replace(',', '.')) || 1;
        const tax = parseFloat(form.withheldTax.replace(',', '.')) || 0;

        onSubmit([{
            _id: crypto.randomUUID(),
            _createdAt: Date.now(),
            'Date': form.date,
            'Type': 'Dividend',
            'Ticker': form.ticker.toUpperCase().trim(),
            'Qty': amount,
            'Price': 1,
            'FxRate': fxRate,
            'Commission': 0,
            'Withheld Tax': tax,
            'Currency': form.currency,
            'Account': form.account,
            'Note': `Dividend ${form.ticker.toUpperCase().trim()}`
        }]);
        onClose();
    };

    return (
        <ModalPortal onBackdropClick={onClose}>
            <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <i className="ph ph-coins text-yellow-500"></i>
                    Dividend
                </h2>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Date">
                        <FlatpickrDate value={form.date} onChange={v => set('date', v)} />
                    </Field>
                    <Field label="Account">
                        <select className={selectCls} value={form.account} onChange={e => set('account', e.target.value)}>
                            {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </Field>
                </div>

                <Field label="Ticker">
                    <TickerCombobox value={form.ticker} onChange={v => set('ticker', v)} tickers={tickers} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Total Dividend Amount">
                        <input className={inputCls} inputMode="decimal" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0,00" required />
                    </Field>
                    <Field label="Withheld Tax">
                        <input className={inputCls} inputMode="decimal" value={form.withheldTax} onChange={e => set('withheldTax', e.target.value)} placeholder="0" />
                    </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Currency">
                        <select className={selectCls} value={form.currency} onChange={e => set('currency', e.target.value)}>
                            {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </Field>
                    <Field label="FX Rate">
                        <input className={inputCls} inputMode="decimal" value={form.fxRate} onChange={e => set('fxRate', e.target.value)} />
                    </Field>
                </div>

                <div className="flex gap-2 pt-2">
                    <button type="submit" className="flex-1 py-2 rounded-lg text-white font-medium bg-yellow-600 hover:bg-yellow-700">Add Dividend</button>
                    <button type="button" onClick={onClose} className="px-4 py-2 text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
            </form>
        </ModalPortal>
    );
};

// ─── INTEREST MODAL ─────────────────────────────────────────────────
export const InterestModal = ({ onClose, onSubmit, accounts, filterAccount, config, detectedCurrencies }) => {
    const getCurrency = (acc) => (config.currencies[acc] || detectedCurrencies[acc] || 'DKK').toUpperCase();
    const initAccount = filterAccount !== 'All' ? filterAccount : (accounts[0] || '');

    const [form, setForm] = useState({
        date: today(),
        account: initAccount,
        amount: '',
    });

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
    const currency = getCurrency(form.account);

    const handleSubmit = (e) => {
        e.preventDefault();
        const amount = parseFloat(form.amount.replace(',', '.')) || 0;

        onSubmit([{
            _id: crypto.randomUUID(),
            _createdAt: Date.now(),
            'Date': form.date,
            'Type': 'Cash',
            'Ticker': currency,
            'Qty': amount,
            'Price': 1,
            'FxRate': 1,
            'Commission': 0,
            'Withheld Tax': 0,
            'Currency': currency,
            'Account': form.account,
            'Note': 'Interest'
        }]);
        onClose();
    };

    return (
        <ModalPortal onBackdropClick={onClose}>
            <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <i className="ph ph-percent text-emerald-500"></i>
                    Interest
                </h2>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Date">
                        <FlatpickrDate value={form.date} onChange={v => set('date', v)} />
                    </Field>
                    <Field label="Account">
                        <select className={selectCls} value={form.account} onChange={e => set('account', e.target.value)}>
                            {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </Field>
                </div>

                <Field label={`Amount (${currency})`}>
                    <input className={inputCls} inputMode="decimal" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0,00" required />
                </Field>

                <div className="flex gap-2 pt-2">
                    <button type="submit" className="flex-1 py-2 rounded-lg text-white font-medium bg-emerald-600 hover:bg-emerald-700">Add Interest</button>
                    <button type="button" onClick={onClose} className="px-4 py-2 text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
            </form>
        </ModalPortal>
    );
};
