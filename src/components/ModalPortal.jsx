import React, { useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

const ModalPortal = ({ children, onBackdropClick, backdropClassName = "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" }) => {
    const elRef = useRef(null);
    if (!elRef.current) elRef.current = document.createElement('div');
    
    useEffect(() => {
        const el = elRef.current;
        document.body.appendChild(el);
        return () => { try { document.body.removeChild(el); } catch { } };
    }, []);

    return ReactDOM.createPortal(
        <div className={backdropClassName} onClick={(e) => { e.stopPropagation(); if (onBackdropClick) onBackdropClick(e); }}>
            {children}
        </div>,
        elRef.current
    );
};
export default ModalPortal;