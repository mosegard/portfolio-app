import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

const ModalPortal = ({ children, onBackdropClick, backdropClassName = "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" }) => {
    const [el] = useState(() => document.createElement('div'));
    
    useEffect(() => {
        document.body.appendChild(el);
        return () => { try { document.body.removeChild(el); } catch (e) { } };
    }, [el]);

    return ReactDOM.createPortal(
        <div className={backdropClassName} onClick={(e) => { e.stopPropagation(); if (onBackdropClick) onBackdropClick(e); }}>
            {children}
        </div>,
        el
    );
};
export default ModalPortal;