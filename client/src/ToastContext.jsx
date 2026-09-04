import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CookieBanner } from './CookieBanner.jsx';

const ToastCtx = createContext(
  /** @type {null | ((msg: string, type?: 'success' | 'error' | 'info') => void)} */ (null),
);

const DEDUPE_MS = 4500;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState(/** @type {{ id: number; message: string; type: string }[]} */ ([]));
  const recentRef = useRef(/** @type {Map<string, number>} */ (new Map()));

  const showToast = useCallback((message, type = 'info') => {
    const key = `${type}::${message}`;
    const now = Date.now();
    const last = recentRef.current.get(key) || 0;
    if (now - last < DEDUPE_MS) return;
    recentRef.current.set(key, now);

    const id = now + Math.random();
    setToasts((prev) => {
      if (prev.some((t) => t.message === message && t.type === type)) return prev;
      return [...prev, { id, message, type }];
    });
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastCtx.Provider value={showToast}>
      {children}
      <CookieBanner />
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
