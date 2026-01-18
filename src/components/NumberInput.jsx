import React from 'react';
import { formatDanishNumber, parseDanishNumber } from '../utils';

const NumberInput = ({ row, fieldKey, rawKey, setRows, extraClass = "", title = "" }) => {
    if (!row) return null;

    const displayValue = row[rawKey] !== undefined
        ? row[rawKey]
        : formatDanishNumber(row[fieldKey], 10);

    const handleChange = (e) => {
        const newVal = e.target.value;
        setRows(prev => {
            const n = [...prev];
            if (n[row._idx]) {
                n[row._idx] = { ...n[row._idx], [rawKey]: newVal };
            }
            return n;
        });
    };

    const handleBlur = () => {
        setRows(prev => {
            const n = [...prev];
            if (n[row._idx] && n[row._idx][rawKey] !== undefined) {
                n[row._idx][fieldKey] = parseDanishNumber(n[row._idx][rawKey]);
                delete n[row._idx][rawKey];
            }
            return n;
        });
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.target.blur();
            const currentRow = e.target.closest('tr');
            if (currentRow) {
                const inputs = Array.from(currentRow.querySelectorAll('input, select'));
                const index = inputs.indexOf(e.target);
                const nextInput = e.shiftKey ? inputs[index - 1] : inputs[index + 1];
                if (nextInput) nextInput.focus();
            }
        }
    };

    return (
        <input
            inputMode="decimal"
            className={`w-16 input-base p-1 rounded text-right font-mono ${extraClass}`}
            title={title}
            value={displayValue}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
        />
    );
};
export default NumberInput;