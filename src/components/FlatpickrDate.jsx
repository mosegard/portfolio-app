import React, { useRef, useEffect } from 'react';
import flatpickr from 'flatpickr';
import { Danish } from 'flatpickr/dist/l10n/da.js';

const FlatpickrDate = ({ value, onChange, onKeyDown }) => {
    const inputRef = useRef(null);
    const fpRef = useRef(null);

    useEffect(() => {
        if (inputRef.current) {
            fpRef.current = flatpickr(inputRef.current, {
                defaultDate: value,
                // Display and value use Danish format (one input only)
                dateFormat: "d/m/Y",
                // Prevent duplicate visible inputs (altInput adds a second input)
                altInput: false,
                locale: Danish,
                allowInput: true,
                onChange: (selectedDates, dateStr) => {
                    onChange(dateStr);
                }
            });
        }
        return () => {
            if (fpRef.current) fpRef.current.destroy();
        };
    }, []);

    useEffect(() => {
        if (fpRef.current && value) {
            fpRef.current.setDate(value, false);
        }
    }, [value]);

    return <input ref={inputRef} className="w-24 input-base p-1 rounded font-mono cursor-pointer" onKeyDown={onKeyDown} />;
};
export default FlatpickrDate;