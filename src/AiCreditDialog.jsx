import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';

export default function AiCreditDialog({ onClose, children }) {
  const root = useRef(null);
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; root.current?.querySelector('button')?.focus();
    const keys = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const items = [...root.current.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keys);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keys); previous?.focus?.(); };
  }, [onClose]);
  return createPortal(<div className="ai-credit-scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={root} className="ai-credit-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-credit-dialog-title"><div className="ai-credit-dialog-heading"><div><h2 id="ai-credit-dialog-title">Get AI credits</h2><p>Your image and print settings stay in the original tab. Checkout opens in a new tab.</p></div><button aria-label="Close AI credit purchase" onClick={onClose}><X size={22}/></button></div>{children}</section></div>, document.body);
}
