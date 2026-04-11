import { createContext, useCallback, useContext, useState } from 'react';

const ToastCtx = createContext(
  /** @type {null | ((msg: string, type?: 'success' | 'error' | 'info') => void)} */ (null),
);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState(/** @type {{ id: number; message: string; type: string }[]} */ ([]));

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastCtx.Provider value={showToast}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role="status">
            {t.type === 'success' && <span className="toast-icon" aria-hidden>✓</span>}
            {t.type === 'error' && <span className="toast-icon" aria-hidden>!</span>}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const fn = useContext(ToastCtx);
  if (!fn) throw new Error('useToast must be used inside ToastProvider');
  return fn;
}
