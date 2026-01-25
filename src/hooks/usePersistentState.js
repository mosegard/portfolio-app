import { useState, useEffect } from 'react';

export default function usePersistentState(key, initialValue) {
    const [state, setState] = useState(() => {
        try {
            const saved = localStorage.getItem(key);
            return saved ? JSON.parse(saved) : initialValue;
        } catch {
            return initialValue;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch (e) {
            console.warn(`Failed to save ${key}`, e);
        }
    }, [key, state]);

    return [state, setState];
}