import React from 'react';

const Sparkline = ({ data, positive, onClick }) => {
    if (!data || data.length < 2) {
        return (
            <div className="w-16 h-8 flex items-center justify-center cursor-default">
                <div className="w-full h-px bg-gray-200"></div>
            </div>
        );
    }
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = range * 0.1;
    const vMin = min - padding;
    const vMax = max + padding;
    const vRange = vMax - vMin;

    const w = 64;
    const h = 32;

    const pts = data.map((d, i) => {
        const x = (i / (data.length - 1)) * w;
        const y = h - ((d - vMin) / vRange) * h;
        return `${x},${y}`;
    }).join(' ');

    const color = positive ? '#16a34a' : '#dc2626';

    return (
        <svg
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            className="overflow-visible cursor-pointer hover:opacity-75 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}
        >
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

export default Sparkline;
