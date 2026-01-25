import { useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';

// Components
import ErrorBoundary from './components/ErrorBoundary';
import TaxReportView from './components/views/TaxReportView';
import HoldingsView from './components/views/HoldingsView';
import SplitToolView from './components/views/SplitToolView';
import EditorView from './components/views/EditorView';
import DashboardView from './components/views/DashboardView';
import CacheInspectorView from './components/views/CacheInspectorView';

// Utilities
import {
    CSV_COLUMNS,
    parseDanishDate,
    normalizeAllRows,
    validateData, rowsToTransactions, utf8_to_b64, b64_to_utf8
} from './utils';

import usePortfolioEngine from './hooks/usePortfolioEngine';
import useMarketData from './hooks/useMarketData';
import usePersistentState from './hooks/usePersistentState';

function App() {

    const [config, setConfig] = useState({
        askAccount: '',
        currencies: {},
        hidden: []
    });
    // 1. Load Rows (Transactions) from Cache
    const [rows, setRows] = usePersistentState('portfolio_rows', []);

    // 2. Save Rows to Cache whenever they change
    useEffect(() => {
        try {
            localStorage.setItem('portfolio_rows', JSON.stringify(rows));
        } catch (e) { console.warn('Row storage failed', e); }
    }, [rows]);
    const [view, setView] = useState('dashboard');
    const [filterAccount, setFilterAccount] = useState('All');
    const [taxYear, setTaxYear] = useState(new Date().getFullYear().toString());
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
const [showCacheInspector, setShowCacheInspector] = useState(false);

    const [settings, setSettings] = usePersistentState('portfolio_settings', {
        proxyUrl: 'https://corsproxy.io/?',
        married: true,
        anonymityBlur: true,
        benchmarkTicker: ''
    });
    const [ghConfig, setGhConfig] = usePersistentState('gh_config', {
        owner: '',
        repo: 'portfolio',
        path: 'portfolio-data.csv',
        token: ''
    });
    const [showSettings, setShowSettings] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [fileSha, setFileSha] = useState(null);
    const [schemaErrors, setSchemaErrors] = useState([]);

    // Restore persisted GitHub settings
    useEffect(() => {
        try {
            const saved = localStorage.getItem('gh_config');
            if (saved) setGhConfig(JSON.parse(saved));
        } catch { return; }
    }, []);

    // Persist settings (including anonymityBlur) to localStorage on change
    useEffect(() => {
        try {
            localStorage.setItem('portfolio_settings', JSON.stringify(settings));
        } catch { return; }
    }, [settings]);


    const [setWinSize] = useState({ w: window.innerWidth, h: window.innerHeight });
    useEffect(() => {
        const onResize = () => setWinSize({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Anonymity blur state (restored)
    const [blurActive, setBlurActive] = useState(false);
    useEffect(() => {
        if (!settings.anonymityBlur) return;
        const onBlur = () => setBlurActive(true);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('blur', onBlur);
        };
    }, [settings.anonymityBlur]);
    useEffect(() => {
        if (settings.anonymityBlur && document.hasFocus() === false) setBlurActive(true);
    }, [settings.anonymityBlur]);
    // Derived data used by the calculation engine
    const txs = useMemo(() => rowsToTransactions(rows), [rows]);
    const uniqueTickers = useMemo(() => [...new Set(txs.map(t => t.ticker).filter(t => t && !['DKK', 'USD', 'EUR', 'GBP', 'SEK', 'NOK'].includes(t)))], [txs]);

    const { marketData, loading, lastUpdate, fetchMarketData } = useMarketData(txs, settings, uniqueTickers);


    const accounts = useMemo(() => [...new Set(rows.map(r => r['Account']).filter(Boolean))].sort(), [rows]);
    const years = useMemo(() => {
        const yr = new Set(txs.map(t => t.date.getFullYear().toString()));
        yr.add(new Date().getFullYear().toString());
        return [...yr].sort().reverse();
    }, [txs]);

    const calc = usePortfolioEngine(txs, marketData, settings, config, years);

    // Stabilize dependencies for useEffect
    // Stabilize dependencies for useEffect
    // 4. Auto-Load & Refresh Logic
    const uniqueTickersCount = uniqueTickers.length;
    const uniqueTickersKey = useMemo(() => uniqueTickers.join(','), [uniqueTickers]);

    useEffect(() => {
        // If we have no tickers (and no benchmark), stop.
        if (uniqueTickersCount === 0 && !settings.benchmarkTicker) return;

        const checkAndFetch = () => {
            const now = Date.now();
            let isStale = true;

            // Check if our current lastUpdate is recent enough (less than 60s old)
            if (lastUpdate && (now - lastUpdate.getTime() < 60000)) {
                isStale = false;
            }

            if (isStale) {
                console.log("Data is stale or missing, fetching...");
                fetchMarketData(true); // true = silent fetch
            }
        };

        // Run immediately on mount/update
        checkAndFetch();

        // Run interval every 60 seconds
        const interval = setInterval(() => {
            fetchMarketData(true);
        }, 60000);

        return () => clearInterval(interval);
    }, [uniqueTickersKey, uniqueTickersCount, settings.benchmarkTicker, fetchMarketData, lastUpdate]);



    const loadFromGithub = async () => {
        if (!ghConfig.token) return;
        setStatusMsg('Loading...');
        try {
            const headers = { 'Authorization': `token ${ghConfig.token}` };
            const repoBase = `https://api.github.com/repos/${ghConfig.owner}/${ghConfig.repo}/contents/`;
            const [resData, resSettings] = await Promise.all([
                fetch(`${repoBase}${ghConfig.path}`, { headers }),
                fetch(`${repoBase}portfolio-settings.csv`, { headers })
            ]);
            if (!resData.ok) throw new Error('Repo Error');
            const dataJson = await resData.json();
            setFileSha(dataJson.sha);
            const dataCsv = b64_to_utf8(dataJson.content);

            Papa.parse(dataCsv, {
                header: true, skipEmptyLines: true,
                complete: (r) => {
                    const normalized = normalizeAllRows(r.data);
                    setRows(normalized);
                    const errs = validateData(normalized);
                    setSchemaErrors(errs);
                }
            });

            if (resSettings.ok) {
                const setJson = await resSettings.json();
                const setCsv = b64_to_utf8(setJson.content);
                Papa.parse(setCsv, {
                    header: true, skipEmptyLines: true,
                    complete: (r) => {
                        const newConfig = { askAccount: '', currencies: {}, hidden: [] };
                        r.data.forEach(row => {
                            const type = (row['Type'] || '').trim().toUpperCase();
                            const key = (row['Key'] || '').trim();
                            const val = (row['Value'] || '').trim();
                            if (type === 'ASK') newConfig.askAccount = val;
                            if (type === 'CURRENCY') newConfig.currencies[key] = val;
                            if (type === 'HIDDEN') newConfig.hidden.push(key);
                        });
                        setConfig(newConfig);
                        console.log("Settings loaded:", newConfig);
                    }
                });
            } else { console.log("No settings file found, using defaults."); }
            setStatusMsg('Loaded');
            setTimeout(() => setStatusMsg(''), 2000);
        } catch (e) {
            console.error(e);
            setStatusMsg('Error Loading');
        }
    };

    const saveToGithub = async () => {
        if (!ghConfig.token) { setShowSettings(true); return; }
        setStatusMsg('Saving...');
        const sorted = [...rows].sort((a, b) => (parseDanishDate(a['Date']) || 0) - (parseDanishDate(b['Date']) || 0));
        const csv = Papa.unparse(sorted, { columns: CSV_COLUMNS });
        try {
            const res = await fetch(`https://api.github.com/repos/${ghConfig.owner}/${ghConfig.repo}/contents/${ghConfig.path}`, {
                method: 'PUT', headers: { 'Authorization': `token ${ghConfig.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'Update', content: utf8_to_b64(csv), sha: fileSha })
            });
            const d = await res.json();
            setFileSha(d.content.sha);
            setStatusMsg('Saved!');
        } catch { setStatusMsg('Err'); }
        setTimeout(() => setStatusMsg(''), 2000);
    };

    const handleFileUpload = (e) => {
        Papa.parse(e.target.files[0], {
            header: true,
            skipEmptyLines: true,
            complete: (r) => {
                const normalized = normalizeAllRows(r.data);
                setRows(normalized);
                const errs = validateData(normalized);
                setSchemaErrors(errs);
                if (errs.length > 0) setStatusMsg('Data Warnings Found');
            }
        });
    };


    // --- LAYOUT ---
    return (
        <div className="flex h-screen w-full bg-white relative font-sans text-gray-800">

            {showCacheInspector && (
                <CacheInspectorView onClose={() => setShowCacheInspector(false)} />
            )}

            {/* Anonymity Blur Overlay */}
            {settings.anonymityBlur && blurActive && (
                <div className="anonymity-blur-overlay">
                    <div className="anonymity-blur-icon" title="Klik for at vise" onClick={() => { setBlurActive(false); fetchMarketData(false); }}>
                        <i className="ph ph-eye-slash"></i>
                        <span>Vis indhold</span>
                    </div>
                </div>
            )}

            {/* SETTINGS MODAL */}
            {showSettings && (
                <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-96 space-y-4">
                        <h2 className="font-bold text-lg">Indstillinger</h2>
                        <input className="w-full border p-2 rounded" placeholder="Ejer (Bruger)" value={ghConfig.owner} onChange={e => setGhConfig({ ...ghConfig, owner: e.target.value })} />
                        <input className="w-full border p-2 rounded" placeholder="Repo-navn" value={ghConfig.repo} onChange={e => setGhConfig({ ...ghConfig, repo: e.target.value })} />
                        <input className="w-full border p-2 rounded" placeholder="Filsti (data.csv)" value={ghConfig.path} onChange={e => setGhConfig({ ...ghConfig, path: e.target.value })} />
                        <input className="w-full border p-2 rounded" type="password" placeholder="GitHub Token (Repo-adgang)" value={ghConfig.token} onChange={e => setGhConfig({ ...ghConfig, token: e.target.value })} />
                        {/* Import CSV moved here */}
                        <div className="flex flex-col gap-2 pt-2">
                            <label className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium cursor-pointer">
                                <i className="ph ph-upload-simple"></i> Importer CSV
                                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                            </label>
                        </div>
                        {/* Anonymity Blur Toggle */}
                        <div className="flex items-center gap-2 pt-2">
                            <input id="anonymity-blur-toggle" type="checkbox" className="accent-blue-600" checked={!!settings.anonymityBlur} onChange={e => setSettings(s => ({ ...s, anonymityBlur: e.target.checked }))} />
                            <label htmlFor="anonymity-blur-toggle" className="text-sm text-gray-700 cursor-pointer select-none">
                                Slør app ved tab af fokus (anonymitet)
                            </label>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => { localStorage.setItem('gh_config', JSON.stringify(ghConfig)); setShowSettings(false); loadFromGithub(); }} className="flex-1 bg-blue-600 text-white py-2 rounded font-medium">Ok</button>
                            <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-gray-500">Luk</button>
                        </div>
                        <button
                            onClick={() => { setShowSettings(false); setShowCacheInspector(true); }}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg text-sm font-medium transition-colors"
                        >
                            <i className="ph ph-database"></i> Inspect Cache Data
                        </button>
                    </div>
                </div>
            )}

            {/* SIDEBAR NAVIGATION (hidden on small screens) */}
            <div className="hidden md:flex md:w-64 bg-gray-50 border-r border-gray-200 flex-col shrink-0">


                <div className="flex-1 overflow-y-auto p-3 space-y-2">

                    {/* 1. Dashboard */}
                    <button type="button" onClick={() => setView('dashboard')} className={`nav-item w-full text-left ${view === 'dashboard' ? 'active' : ''}`}>
                        <i className="ph ph-chart-line-up text-lg"></i> Oversigt
                    </button>

                    {/* 2. Holdings */}
                    <button type="button" onClick={() => setView('holdings')} className={`nav-item w-full text-left ${view === 'holdings' ? 'active' : ''}`}>
                        <i className="ph ph-briefcase text-lg"></i> Beholdninger
                    </button>


                    {/* 3. Transactions Editor Section */}
                    <div>
                        <button type="button" onClick={() => { setView('editor'); setFilterAccount('All'); }} className={`nav-item w-full text-left ${view === 'editor' && filterAccount === 'All' ? 'active' : ''}`}>
                            <i className="ph ph-list-dashes text-lg"></i> Transaktioner
                        </button>
                        {/* Account Filters */}
                        <div className="mt-1 space-y-0.5">
                            {accounts
                                .filter(acc => !config.hidden.includes(acc)) // 1. Filter out hidden accounts
                                .map(acc => {
                                    // 2. Lookup currency (default to DKK)
                                    const currency = config.currencies[acc] || 'DKK';

                                    return (
                                        <button
                                            key={acc}
                                            onClick={() => { setView('editor'); setFilterAccount(acc); }}
                                            className={`sub-nav-item ${view === 'editor' && filterAccount === acc ? 'active' : ''} flex justify-between items-center pr-2`}
                                        >
                                            <span className="truncate" title={acc}>{acc}</span>
                                            <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1 rounded ml-2">
                                                {currency}
                                            </span>
                                        </button>
                                    );
                                })}
                        </div>
                    </div>

                    {/* 4. Tax Report Section */}
                    <div>
                        <button type="button" onClick={() => setView('tax')} className={`nav-item w-full text-left ${view === 'tax' ? 'active' : ''}`}>
                            <i className="ph ph-bank text-lg"></i> Skatterapport
                        </button>
                        {/* Year Selector */}
                        <div className="mt-1 space-y-0.5">
                            {years.map(y => (
                                <button type="button" key={y} onClick={() => { setView('tax'); setTaxYear(y); }} className={`sub-nav-item ${view === 'tax' && taxYear === y ? 'active' : ''}`}>
                                    {y}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 5. Split Tool (moved to last) */}
                    <button type="button" onClick={() => setView('split')} className={`nav-item w-full text-left ${view === 'split' ? 'active' : ''}`}>
                        <i className="ph ph-arrows-split text-lg"></i> Split-værktøj
                    </button>

                </div>

                {/* Bottom Actions: Only Settings button for desktop sidebar */}
                <div className="p-4 border-t border-gray-200 flex flex-col gap-2">
                    <button onClick={() => setShowSettings(true)} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 text-gray-700">
                        <i className="ph ph-gear-six"></i> Indstillinger
                    </button>
                </div>
            </div>

            {/* MOBILE OVERLAY NAV */}
            {mobileNavOpen && (
                <div className="fixed inset-0 z-50 md:hidden">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)}></div>
                    {/* CHANGED: right-0 -> left-0 AND border-l -> border-r */}
                    <div className="absolute top-0 left-0 w-64 h-full bg-white shadow-xl border-r border-gray-200 flex flex-col z-10">
                        <div className="p-5 border-b border-gray-200 flex justify-between items-center">
                            <div className="font-bold text-lg flex items-center gap-2"><i className="ph ph-wallet text-blue-600"></i> Menu</div>
                            <button onClick={() => setMobileNavOpen(false)} className="text-gray-400 hover:text-gray-700"><i className="ph ph-x"></i></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {/* 1. Dashboard */}
                            <button type="button" onClick={() => { setView('dashboard'); setMobileNavOpen(false); }} className={`nav-item w-full text-left ${view === 'dashboard' ? 'active' : ''}`}>
                                <i className="ph ph-chart-line-up text-lg"></i> Oversigt
                            </button>

                            {/* 2. Holdings */}
                            <button type="button" onClick={() => { setView('holdings'); setMobileNavOpen(false); }} className={`nav-item w-full text-left ${view === 'holdings' ? 'active' : ''}`}>
                                <i className="ph ph-briefcase text-lg"></i> Beholdninger
                            </button>

                            {/* 3. Transactions Editor Section */}
                            <div>
                                <button type="button" onClick={() => { setView('editor'); setFilterAccount('All'); setMobileNavOpen(false); }} className={`nav-item w-full text-left ${view === 'editor' && filterAccount === 'All' ? 'active' : ''}`}>
                                    <i className="ph ph-list-dashes text-lg"></i> Transaktioner
                                </button>
                                {/* Account Filters */}
                                <div className="mt-1 space-y-0.5">
                                    {accounts
                                        .filter(acc => !config.hidden.includes(acc))
                                        .map(acc => {
                                            const currency = config.currencies[acc] || 'DKK';
                                            return (
                                                <button
                                                    key={acc}
                                                    onClick={() => { setView('editor'); setFilterAccount(acc); setMobileNavOpen(false); }}
                                                    className={`sub-nav-item ${view === 'editor' && filterAccount === acc ? 'active' : ''} flex justify-between items-center pr-2`}
                                                >
                                                    <span className="truncate" title={acc}>{acc}</span>
                                                    <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1 rounded ml-2">
                                                        {currency}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                </div>
                            </div>

                            {/* 4. Tax Report Section */}
                            <div>
                                <button type="button" onClick={() => { setView('tax'); setMobileNavOpen(false); }} className={`nav-item w-full text-left ${view === 'tax' ? 'active' : ''}`}>
                                    <i className="ph ph-bank text-lg"></i> Skatterapport
                                </button>
                                {/* Year Selector */}
                                <div className="mt-1 space-y-0.5">
                                    {years.map(y => (
                                        <button type="button" key={y} onClick={() => { setView('tax'); setTaxYear(y); setMobileNavOpen(false); }} className={`sub-nav-item ${view === 'tax' && taxYear === y ? 'active' : ''}`}>
                                            {y}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 5. Split Tool */}
                            <button type="button" onClick={() => { setView('split'); setMobileNavOpen(false); }} className={`nav-item w-full text-left ${view === 'split' ? 'active' : ''}`}>
                                <i className="ph ph-arrows-split text-lg"></i> Split-værktøj
                            </button>
                        </div>

                        {/* Bottom Actions */}
                        <div className="p-4 border-t border-gray-200 flex flex-col gap-2">
                            <button onClick={() => { setShowSettings(true); setMobileNavOpen(false); }} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 text-gray-700">
                                <i className="ph ph-gear-six"></i> Indstillinger
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">

                {/* Context Header */}
                <div className="h-14 border-b border-gray-100 flex items-center justify-between px-4 md:px-8 shrink-0 bg-white relative">

                    {/* 1. LEFT: Hamburger Menu (Mobile Only) - Moved here */}
                    <button
                        onClick={() => setMobileNavOpen(true)}
                        className="md:hidden p-2 -ml-2 text-gray-700 hover:text-gray-900"
                        aria-label="Open menu"
                    >
                        <i className="ph ph-list text-2xl"></i>
                    </button>

                    {/* 2. CENTER/LEFT: Title */}
                    <div className="flex-1 flex items-center justify-center md:justify-start">
                        <h1 className="text-xl font-bold text-gray-800 text-center w-full md:w-auto">
                            {view === 'editor' && (filterAccount === 'All' ? 'Alle transaktioner' : `${filterAccount}`)}
                            {view === 'dashboard' && 'Oversigt'}
                            {view === 'holdings' && 'Beholdninger'}
                            {view === 'split' && 'Split-værktøj'}
                            {view === 'tax' && `Skatterapport: ${taxYear}`}
                        </h1>
                    </div>

                    {/* 3. RIGHT: Single Unified Update Button */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => fetchMarketData(false)}
                            className="p-2 w-10 h-10 rounded-full bg-white border border-gray-200 hover:bg-blue-50 text-blue-600 text-lg shadow-sm flex items-center justify-center"
                            title={lastUpdate ? `Sidst opdateret: ${lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : "Opdater priser"}
                        >
                            {loading ? <i className="ph ph-spinner animate-spin"></i> : <i className="ph ph-arrows-clockwise"></i>}
                        </button>

                        {/* Status Message Bubble */}
                        {statusMsg && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full animate-pulse hidden sm:inline-block">{statusMsg}</span>}
                    </div>
                </div>



                {/* VALIDATION WARNING BANNER */}
                {schemaErrors.length > 0 && (
                    <div className="bg-red-50 border-b border-red-200 p-4 max-h-40 overflow-y-auto">
                        <div className="flex items-center gap-2 text-red-800 font-bold mb-2">
                            <i className="ph ph-warning-circle text-xl"></i>
                            <span>Dataintegritetsfejl ({schemaErrors.length})</span>
                            <button onClick={() => setSchemaErrors([])} className="ml-auto text-xs bg-red-100 hover:bg-red-200 px-2 py-1 rounded text-red-700">Luk</button>
                        </div>
                        <ul className="list-disc list-inside text-sm text-red-700 space-y-1 font-mono">
                            {schemaErrors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                    </div>
                )}

                {/* --- CALCULATION WARNINGS BANNER (MISSING LIMITS/RATES) --- */}
                {calc.warnings && calc.warnings.length > 0 && (
                    <div className="bg-orange-50 border-b border-orange-200 p-4 max-h-40 overflow-y-auto animate-in slide-in-from-top-2">
                        <div className="flex items-center gap-2 text-orange-900 font-bold mb-2">
                            <i className="ph ph-warning-octagon text-xl text-orange-600"></i>
                            <span>Kritiske Beregningsfejl ({calc.warnings.length})</span>
                        </div>
                        <div className="text-sm text-orange-800 mb-2">
                            Følgende mangler forhindrer korrekt skatteberegning:
                        </div>
                        <ul className="list-disc list-inside text-xs text-orange-800 space-y-1 font-mono bg-white/50 p-2 rounded border border-orange-100">
                            {calc.warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* View Container */}
                <div className="flex-1 overflow-auto overflow-x-auto bg-gray-50">
                    {view === 'editor' && (
                        <EditorView
                            rows={rows}
                            setRows={setRows}
                            filterAccount={filterAccount}
                            config={config}
                            saveToGithub={saveToGithub}
                            statusMsg={statusMsg}
                            handleFileUpload={handleFileUpload}
                        />
                    )}
                    {view === 'dashboard' && (
                        <DashboardView
                            calc={calc}
                            marketData={marketData}
                            settings={settings}
                            setSettings={setSettings}
                            fetchMarketData={fetchMarketData}
                            uniqueTickers={uniqueTickers}
                            years={years}
                        />
                    )}
                    {view === 'holdings' && (
                        <HoldingsView
                            portfolio={calc.portfolio}
                            marketData={marketData}
                            loading={loading}
                            lastUpdate={lastUpdate}
                        />
                    )}
                    {view === 'split' && (
                        <SplitToolView
                            rows={rows}
                            setRows={setRows}
                            marketData={marketData}
                            tickers={uniqueTickers}
                            txs={txs}
                        />
                    )}
                    {view === 'tax' && (
                        <TaxReportView
                            taxYear={taxYear}
                            settings={settings}
                            calc={calc}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
export default function WrappedApp() {
    return (
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    );
}