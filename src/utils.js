export const MONTHS_DK = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const CSV_COLUMNS = ['Date', 'Type', 'Ticker', 'Qty', 'Price', 'Currency', 'FxRate', 'Commission', 'Withheld Tax', 'Account', 'Note'];
export const TYPE_OPTIONS = ['Stock', 'ETF', 'Cash', 'Dividend', 'Option'];
export const CURRENCY_OPTIONS = ['DKK', 'USD', 'EUR', 'NOK', 'SEK', 'GBP'];

export const TAX_LIMITS = {
    '2026': 79400,
    '2025': 67500,
    '2024': 61000,
    '2023': 58900,
    '2022': 57200,
    '2021': 56500,
    '2020': 55300,
    '2019': 54000,
    '2018': 52900,
    '2017': 51700
};

export const calculateDanishTax = (amount, limit) => {
    if (amount <= 0) return 0;
    if (amount <= limit) return amount * 0.27;
    return (limit * 0.27) + ((amount - limit) * 0.42);
};

export const toPrettyDate = (danishDate) => {
    if (!danishDate || danishDate.length < 8) return danishDate;
    const [d, m, y] = danishDate.split('/');
    if (!d || !m || !y) return danishDate;

    const mName = MONTHS_DK[parseInt(m, 10) - 1];
    // Ensure day is zero-padded (e.g. "6" -> "06")
    const dPad = d.toString().padStart(2, '0');
    return `${dPad}-${mName}-${y}`;
};

export const toIso = (danishDate) => {
    if (!danishDate || danishDate.length < 10) return '';
    const [d, m, y] = danishDate.split('/');
    if (!d || !m || !y) return '';
    return `${y}-${m}-${d}`;
};

// NEW: Convert YYYY-MM-DD (ISO from input) -> DD/MM/YYYY (Danish for storage)
export const fromIso = (isoDate) => {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
};

export const parseDanishNumber = (str) => {
    if (str == null || str === '') return 0;
    if (typeof str === 'number') return str;

    const s = String(str).trim();

    // If it contains a dot but NO comma, assume it's a standard JS/US number 
    // (This handles data coming back from GitHub Sync)
    if (s.includes('.') && !s.includes(',')) {
        const val = parseFloat(s);
        return isNaN(val) ? 0 : val;
    }

    // Otherwise, apply strict Danish Logic (Dots = Thousands, Comma = Decimal)
    const norm = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(norm);
    return isNaN(n) ? 0 : n;
};

export const parseDanishDate = (dateStr) => {
    if (!dateStr) return null;
    try {
        const parts = String(dateStr).trim().split(/[\/\.\s:]+/);
        if (parts.length < 3) return null;
        return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    } catch { return null; }
};

export const getLocalISO = (dateObj) => {
    if (!dateObj || isNaN(dateObj)) return '';
    const offset = dateObj.getTimezoneOffset() * 60000;
    return new Date(dateObj.getTime() - offset).toISOString().split('T')[0];
};

export const formatDanishNumber = (val, decimals = 2) => {
    const n = parseDanishNumber(val);
    return new Intl.NumberFormat('da-DK', {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals
    }).format(n);
};


export const formatCurrency = (val, currency = 'DKK') =>
    new Intl.NumberFormat('da-DK', { style: 'currency', currency }).format(val || 0);

// Helper: Format currency with no decimals
export const formatCurrencyNoDecimals = (val, currency = 'DKK') =>
    new Intl.NumberFormat('da-DK', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0);

export const normalizeDate = (rawStr) => {
    if (!rawStr) return '';
    const s = String(rawStr).trim();

    // 1. Split by any non-digit character (., -, /, space, :)
    const parts = s.split(/[^0-9]+/).filter(Boolean);

    // 2. If we have at least 3 parts (Day, Month, Year), reconstruct the date
    if (parts.length >= 3) {
        // Detection: If 1st part is 4 digits, assume ISO (YYYY-MM-DD) -> Convert to DD/MM/YYYY
        if (parts[0].length === 4) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        // Otherwise assume Danish/European (DD-MM-YYYY) -> Keep as DD/MM/YYYY
        // We intentionally ignore parts[3]+ (Time info)
        return `${parts[0]}/${parts[1]}/${parts[2]}`;
    }

    // Fallback
    return s;
};

export const formatNumber2 = (val) => new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parseDanishNumber(val) || 0);

export const displayDateToIso = (dStr) => {
    if (!dStr) return '';
    const parts = dStr.split('/');
    if (parts.length !== 3) return dStr;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

// --- IMPROVED CSV NORMALIZATION ---
export const determineType = (rawType, ticker, qty) => {
    const t = String(rawType || '').trim().toUpperCase();
    const typeMap = { 'STOCK': 'Stock', 'ETF': 'ETF', 'CASH': 'Cash', 'DIVIDEND': 'Dividend', 'OPTION': 'Option' };
    if (typeMap[t]) return typeMap[t];
    if (!t && ticker && parseDanishNumber(qty) !== 0) return 'Stock';
    return rawType || 'Cash';
};

export const normalizeCurrency = (raw) => {
    const map = { 'DANISH KRONE': 'DKK', 'KR': 'DKK', '': 'DKK' };
    const up = String(raw || '').trim().toUpperCase();
    return map[up] || (CURRENCY_OPTIONS.includes(up) ? up : 'DKK');
};

export const normalizeCsvRow = (row) => {
    // Legacy mapping (if loading old files, map Cost -> Commission by default)
    const legacyToNew = {
        'Dato': 'Date', 'Navn': 'Ticker', 'Antal': 'Qty', 'Kurs': 'Price',
        'Valuta': 'FxRate', 'Omkst./udbytteskat': 'Commission', // Map legacy cost to Commission
        'Konto': 'Account', 'Stock': 'Currency', 'Kilde': 'Note',
        'Cost': 'Commission' // Map English 'Cost' to 'Commission' for migration
    };

    const out = { ...row };
    Object.keys(legacyToNew).forEach((oldKey) => {
        if (out[oldKey] != null && out[legacyToNew[oldKey]] == null) {
            out[legacyToNew[oldKey]] = out[oldKey];
        }
    });

    out['Date'] = normalizeDate(out['Date']);
    out['Ticker'] = String(out['Ticker'] || '').trim();
    out['Account'] = String(out['Account'] || '').trim();
    out['Note'] = String(out['Note'] || '').trim();

    const resolvedType = determineType(out['Type'], out['Ticker'], out['Qty']);
    out['Type'] = resolvedType;
    out['Currency'] = normalizeCurrency(out['Currency']);

    const rawFx = parseDanishNumber(out['FxRate']);
    out['FxRate'] = rawFx === 0 ? 1 : rawFx;

    // Price defaults to 1 for Cash/Dividend
    const priceDefault = (resolvedType === 'Cash' || resolvedType === 'Dividend') ? 1 : 0;
    out['Price'] = parseDanishNumber(out['Price'] || priceDefault);

    out['Qty'] = parseDanishNumber(out['Qty'] || 0);
    out['Commission'] = parseDanishNumber(out['Commission'] || 0);
    out['Withheld Tax'] = parseDanishNumber(out['Withheld Tax'] || 0);

    // If it's a Dividend and someone used the legacy 'Cost' mapping, move Commission -> Tax
    if (resolvedType === 'Dividend' && out['Commission'] !== 0 && out['Withheld Tax'] === 0) {
        out['Withheld Tax'] = out['Commission'];
        out['Commission'] = 0;
    }

    return out;
};

export const normalizeAllRows = (rows) => rows.map(normalizeCsvRow);


export const validateData = (rows) => {
    const errors = [];
    const validTypes = ['STOCK', 'ETF', 'CASH', 'DIVIDEND', 'OPTION', ''];

    rows.forEach((row, index) => {
        // Check 1: Valid Type
        const type = (row['Type'] || '').trim().toUpperCase();
        if (!validTypes.includes(type)) {
            errors.push(`Row ${index + 1}: Invalid Type '${row['Type']}'`);
        }

        // Check 2: Valid Date
        const date = parseDanishDate(row['Date']);
        if (!date && row['Date']) {
            errors.push(`Row ${index + 1}: Invalid Date '${row['Date']}'`);
        }

        // Check 3: Required fields for Trades AND Dividends
        if ((type === 'STOCK' || type === 'ETF' || type === 'DIVIDEND') && !row['Ticker']) {
            errors.push(`Row ${index + 1}: ${type} missing Ticker symbol`);
        }

        // Check 4: Critical FxRate for non-DKK assets (Trades & Dividends)
        const cur = String(row['Currency'] || 'DKK').toUpperCase();
        const fx = row['FxRate'];

        // Logic: If it's foreign currency (not DKK) AND rate is missing or 1...
        if (cur !== 'DKK' && (!fx || fx === 1)) {
            // ...and it's a relevant type (Stock, ETF, or Dividend)
            if (['STOCK', 'ETF', 'DIVIDEND'].includes(type)) {
                errors.push(`Row ${index + 1}: Critical — ${cur} ${row['Type']} has invalid FxRate (1.00). Tax report will be wrong.`);
            }
        }
    });
    return errors;
};

// GitHub API
export function utf8_to_b64(str) { return window.btoa(unescape(encodeURIComponent(str))); }
export function b64_to_utf8(str) { return decodeURIComponent(escape(window.atob(str))); }

// --- LOGIC ---
export function rowsToTransactions(rows) {
    const txs = [];
    rows.forEach((row, index) => {
        const date = parseDanishDate(row['Date']);
        if (!date) return;

        const typeRaw = (row['Type'] || '').trim();
        if (typeRaw.toUpperCase() === 'OPTION') return;

        const qty = row['Qty'];
        const source = (row['Note'] || '').toLowerCase();
        const ticker = (row['Ticker'] || '').toString().trim();
        let account = (row['Account'] || '').toString().trim();
        if (!account) account = '(Unspecified)';

        let txType = 'UNKNOWN';
        let assetCategory = 'Stock'; // Default

        // Trust the CSV 'Type' column (case-insensitive)
        if (typeRaw.toUpperCase() === 'ETF') {
            assetCategory = 'ETF';
            txType = qty >= 0 ? 'BUY' : 'SELL';
        }
        else if (typeRaw.toUpperCase() === 'STOCK') {
            assetCategory = 'Stock';
            txType = qty >= 0 ? 'BUY' : 'SELL';
        }
        else if (typeRaw.toUpperCase() === 'CASH') {
            assetCategory = 'Cash';
            if (source.includes('udbytte') || source.includes('dividend')) txType = 'DIVIDEND';
            else if (source.includes('interest') || source.includes('rente')) txType = 'INTEREST';
            else txType = 'TRANSFER';
        } else if (typeRaw.toUpperCase() === 'DIVIDEND') {
            assetCategory = 'Cash';
            txType = 'DIVIDEND';
        } else {
            // Fallback for implicit types
            if (ticker && qty !== 0 && ticker !== 'DKK') txType = qty >= 0 ? 'BUY' : 'SELL';
        }

        txs.push({
            id: index,
            raw: row,
            date,
            type: txType,
            assetType: assetCategory,
            ticker,
            qty,
            price: row['Price'],
            fxRate: (row['FxRate'] || 1),
            commission: row['Commission'],
            tax: row['Withheld Tax'],
            currency: row['Currency'],
            account
        });
    });
    // Stable sort
    // Enhanced Sort: Date -> Buys First -> Original Order
    txs.sort((a, b) => {
        // 1. Date (Earliest first)
        const dateDiff = a.date - b.date;
        if (dateDiff !== 0) return dateDiff;

        // 2. Same Date? Process BUYS (positive Qty) before SELLS (negative Qty)
        // This ensures the Cost Basis pool is filled before we draw from it.
        if (a.qty >= 0 && b.qty < 0) return -1;
        if (a.qty < 0 && b.qty >= 0) return 1;

        // 3. Fallback to CSV order
        return a.id - b.id;
    });
    return txs;
}

/**
 * Compresses Yahoo object array to a minimal Tuple array for storage.
 * Input: [{ date: '2023-01-01', close: 100.5, ... }, ...]
 * Output: { u: 1672531200 (last_updated), h: [[19348, 100.5], [19349, 101.2]] } 
 * (We store days-since-epoch to save even more space than full timestamps)
 */
export const compressMarketData = (history) => {
    if (!history || history.length === 0) return [];
    
    return history.map(h => {
        // Store date as "Days since 1970" to save space (integer vs long string)
        const date = new Date(h.date);
        const days = Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
        // Round price to 2 decimals to save string length in JSON
        const price = Math.round(h.close * 100) / 100; 
        return [days, price];
    });
};

/**
 * Decompresses the Tuple array back to the Object format the app expects.
 */
export const decompressMarketData = (compressedHistory) => {
    if (!compressedHistory || !Array.isArray(compressedHistory)) return [];

    return compressedHistory.map(tuple => {
        const [days, price] = tuple;
        // Convert days-since-epoch back to YYYY-MM-DD
        const dateObj = new Date(days * 24 * 60 * 60 * 1000);
        const dateStr = dateObj.toISOString().split('T')[0];
        return {
            date: dateStr,
            close: price
        };
    });
};