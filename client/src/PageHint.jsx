import { useState } from 'react';

const HINTS_FLAG = 'cg_show_hints';
const DISMISS_PREFIX = 'cg_hint_dismissed_';

export function getShowHints() {
  try {
    return localStorage.getItem(HINTS_FLAG) !== '0';
  } catch {
    return true;
  }
}
export function setShowHints(on) {
  try {
    localStorage.setItem(HINTS_FLAG, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}
/** Сбросить все индивидуально скрытые подсказки (показать заново). */
export function resetDismissedHints() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DISMISS_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/**
 * Контекстная подсказка вверху раздела. Статичный текст по разделу.
 * Скрывается крестиком (запоминается per-id) и глобальным тумблером в профиле.
 */
export function PageHint({ id, title, children, tone = 'accent' }) {
  const [hidden, setHidden] = useState(() => {
    if (!getShowHints()) return true;
    try {
      return localStorage.getItem(DISMISS_PREFIX + id) === '1';
    } catch {
      return false;
    }
  });

  if (hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_PREFIX + id, '1');
    } catch {
      /* ignore */
    }
    setHidden(true);
  }

  return (
    <div className={`ph ph--${tone}`} role="note">
      <span className="ph__icon" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      </span>
      <div className="ph__body">
        {title && <div className="ph__title">{title}</div>}
        <div className="ph__text">{children}</div>
      </div>
      <button type="button" className="ph__close" onClick={dismiss} aria-label="Скрыть подсказку">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <style>{`
        .ph {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 14px 16px; border-radius: 14px;
          border: 1px solid var(--stroke-soft);
          background: var(--bg-elevated);
          margin-bottom: 16px;
          animation: phIn 420ms cubic-bezier(0.22,1,0.36,1) both;
          will-change: transform, opacity;
        }
        @keyframes phIn { from { opacity: 0; transform: translate3d(0,-8px,0); } }
        .ph--accent { background: linear-gradient(120deg, var(--accent-soft), var(--bg-elevated) 70%); border-color: color-mix(in srgb, var(--accent) 22%, transparent); }
        .ph--emerald { background: linear-gradient(120deg, var(--emerald-soft), var(--bg-elevated) 70%); border-color: color-mix(in srgb, var(--emerald) 22%, transparent); }
        .ph__icon { flex-shrink: 0; margin-top: 1px; }
        .ph--accent .ph__icon { color: var(--accent); }
        .ph--emerald .ph__icon { color: var(--emerald); }
        .ph__body { flex: 1; min-width: 0; }
        .ph__title { font-size: 0.86rem; font-weight: 700; color: var(--text-strong); margin-bottom: 2px; }
        .ph__text { font-size: 0.82rem; line-height: 1.5; color: var(--text-muted); }
        .ph__text b, .ph__text strong { color: var(--text); font-weight: 600; }
        .ph__close {
          flex-shrink: 0; border: none; background: transparent; color: var(--text-muted);
          cursor: pointer; padding: 4px; border-radius: 7px; display: flex;
          transition: color 160ms, background 160ms;
        }
        .ph__close:hover { color: var(--text); background: var(--surface); }
      `}</style>
    </div>
  );
}
