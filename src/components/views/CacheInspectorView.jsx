import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../utils';

const CacheInspectorView = ({ onClose }) => {
    const [cacheData, setCacheData] = useState({});
    const [cacheSize, setCacheSize] = useState(0);

    useEffect(() => {
        loadCache();
    }, []);

    const loadCache = () => {
        try {
            const raw = localStorage.getItem('marketDataCache') || '{}';
            // Calculate size in KB
            const size = new Blob([raw]).size;
            setCacheSize(size);
            setCacheData(JSON.parse(raw));
        } catch (e) {
            console.error("Failed to load cache", e);
        }
    };

    const deleteTicker = (ticker) => {
        if (!confirm(`Delete cache for ${ticker}?`)) return;
        const newCache = { ...cacheData };
        delete newCache[ticker];
        localStorage.setItem('marketDataCache', JSON.stringify(newCache));
        loadCache(); // Refresh UI
    };

    const clearAll = () => {
        if (!confirm("ARE YOU SURE? This will delete ALL market data prices.")) return;
        localStorage.removeItem('marketDataCache');
        loadCache();
        window.location.reload(); // Reload to force app to re-fetch
    };

    const sortedKeys = Object.keys(cacheData).sort();

    return (
        <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col p-6 animate-in slide-in-from-bottom-10">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <i className="ph ph-database text-purple-600"></i> Cache Inspector
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Size: <span className={`font-mono font-bold ${cacheSize > 4000000 ? 'text-red-600' : 'text-green-600'}`}>
                            {(cacheSize / 1024).toFixed(2)} KB
                        </span> / ~5000 KB (LocalStorage Limit)
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={clearAll} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium">
                        <i className="ph ph-trash"></i> Reset All
                    </button>
                    <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
                        Luk
                    </button>
                </div>
            </div>

            {/* Content Table */}
            <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                <div className="overflow-y-auto p-0">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200">
                            <tr>
                                <th className="p-3 font-semibold text-gray-600">Ticker</th>
                                <th className="p-3 font-semibold text-gray-600">Last Updated</th>
                                <th className="p-3 font-semibold text-gray-600 text-right">Price</th>
                                <th className="p-3 font-semibold text-gray-600 text-right">Data Points</th>
                                <th className="p-3 font-semibold text-gray-600 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {sortedKeys.map(ticker => {
                                const item = cacheData[ticker];
                                const date = item.lastUpdated ? new Date(item.lastUpdated).toLocaleString() : 'Unknown';
                                const points = item.history ? item.history.length : 0;
                                return (
                                    <tr key={ticker} className="hover:bg-gray-50">
                                        <td className="p-3 font-bold text-gray-800">{ticker}</td>
                                        <td className="p-3 text-gray-500 font-mono text-xs">{date}</td>
                                        <td className="p-3 text-right font-mono">{formatCurrency(item.price)}</td>
                                        <td className="p-3 text-right font-mono text-gray-500">{points}</td>
                                        <td className="p-3 text-center">
                                            <button 
                                                onClick={() => deleteTicker(ticker)}
                                                className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50"
                                                title="Delete this entry"
                                            >
                                                <i className="ph ph-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {sortedKeys.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="p-8 text-center text-gray-400 italic">Cache is empty.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default CacheInspectorView;