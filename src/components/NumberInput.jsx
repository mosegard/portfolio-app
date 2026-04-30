import React, { useState } from 'react';
import { formatDanishNumber, parseDanishNumber } from '../utils';

const NumberInput = ({ value, onCommit, extraClass = "", title = "" }) => {
    const [raw, setRaw] = useState(null); // null = not editing

    const displayValue = raw !== null ? raw : formatDanishNumber(value, 10);

    const handleFocus = (e) => {
        setRaw(e.target.value);
    };

    const handleChange = (e) => {
        setRaw(e.target.value);
    };

    const handleBlur = () => {
        if (raw !== null) {
            onCommit(parseDanishNumber(raw));
            setRaw(null);
        }
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
            onFocus={handleFocus}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
        />
    );
};
export default NumberInput;