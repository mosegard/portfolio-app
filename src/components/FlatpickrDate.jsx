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
                dateFormat: "d/m/Y",
                altInput: true,
                altFormat: "d-M-Y",
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