import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api.js';
import { computeClientView } from './clientView.js';
import { ClientResultView, CLIENT_RESULT_CSS } from './ClientResultView.jsx';

/**
 * Полноэкранный режим «Показать клиенту» — ОВЕРЛЕЙ на экране оператора.
 *
 * Для показа на отдельном экране клиента (второй монитор / планшет) см. ClientDisplay.jsx.
 * Здесь — быстрый локальный показ зелёного экрана поверх калькулятора оператора.
 *
 * Светлая/тёмная палитра фиксированная (тёмный премиум) — чтобы клиент через стол
 * видел контрастно и без «компьютерных» цветов.
 */
export function ClientPresentation({ open, onClose, formatMoney, price, weight, purity, brandName = 'REAKTIVO PRO' }) {
  const [settings, setSettings] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryErr, setSummaryErr] = useState(null);
  const [cityId, setCityId] = useState(() => {
    try { return localStorage.getItem('cg_client_view_city') || ''; } catch { return ''; }
  });
  const overlayRef = useRef(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSummaryLoading(true);
    setSummaryErr(null);
    Promise.all([
      api.settings().catch(() => null),
      api.goldIndexPublicSummary().catch((e) => { throw e; }),
    ])
      .then(([s, sum]) => {
        if (!alive) return;
        setSettings(s);
        setSummary(sum || null);
      })
      .catch((e) => {
        if (!alive) return;
        setSummaryErr(e?.message || 'Не удалось загрузить сводку по рынку');
      })
      .finally(() => {
        if (alive) setSummaryLoading(false);
      });
    return () => { alive = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      document.body.classList.add('cg-cp-open');
      document.documentElement.classList.add('cg-cp-open');
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('cg-cp-open');
      document.documentElement.classList.remove('cg-cp-open');
      wasOpenRef.current = false;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !summary?.cities?.length) return;
    if (!cityId) {
      setCityId(summary.cities[0].id);
    } else if (!summary.cities.some((c) => c.id === cityId)) {
      setCityId(summary.cities[0].id);
    }
  }, [open, summary, cityId]);

  useEffect(() => {
    if (!cityId) return;
    try { localStorage.setItem('cg_client_view_city', cityId); } catch { /* ignore */ }
  }, [cityId]);

  const view = useMemo(
    () => computeClientView({ settings, price, summary, cityId, weight, purity }),
    [settings, price, summary, cityId, weight, purity],
  );

  const handleBackdropClick = useCallback((e) => {
    if (e.target === overlayRef.current) onClose?.();
  }, [onClose]);

  if (!open) return null;

  const cityControl = (
    <div className="cg-cp__city-pick">
      <span className="cg-cp__city-label">Город:</span>
      <select
        className="cg-cp__city-select"
        value={cityId || ''}
        onChange={(e) => setCityId(e.target.value)}
      >
        {(summary?.cities || []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.cityName} · {c.regionName}
          </option>
        ))}
        {!summary?.cities?.length && <option value="">Нет городов</option>}
      </select>
    </div>
  );

  const node = (
    <div
      ref={overlayRef}
      className="cg-cp"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Показать клиенту"
    >
      <div className="cg-cp__sheet">
        <header className="cg-cp__header">
          <div className="cg-cp__brand">
            <span className="cg-cp__brand-mark">
              <img src="/logo-reaktivo-mark.svg" alt={brandName} />
            </span>
            <span className="cg-cp__brand-name">{brandName}</span>
          </div>
          <button type="button" className="cg-cp__close" onClick={onClose} aria-label="Закрыть">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <main className="cg-cp__body">
          <ClientResultView view={view} formatMoney={formatMoney} cityControl={cityControl} />

          {summaryErr && !summaryLoading && (
            <p className="cg-cp__err">{summaryErr}</p>
          )}

          <footer className="cg-cp__footer">
            <span className="cg-cp__footer-note">
              Биржевая цена сегодня: {view.goldRubPerGram != null ? formatMoney(view.goldRubPerGram) : '—'} / г чистого
            </span>
            <button type="button" className="cg-cp__back" onClick={onClose}>
              К калькулятору
            </button>
          </footer>
        </main>
      </div>

      <style>{CSS}</style>
    </div>
  );

  return createPortal(node, document.body);
}

const CSS = `
html.cg-cp-open, body.cg-cp-open {
  overflow: hidden !important;
}

${CLIENT_RESULT_CSS}

/* ─── Клиентский экран (Stage 7) — тёмный премиум ─── */
.cg-cp {
  position: fixed; inset: 0;
  z-index: 200;
  background:
    radial-gradient(ellipse 80% 50% at 0% 100%, rgba(55, 58, 64, 0.35), transparent 60%),
    radial-gradient(ellipse 70% 45% at 100% 0%, rgba(48, 50, 56, 0.30), transparent 55%),
    linear-gradient(180deg, #1a1b1e 0%, #141516 100%);
  color: #f4f5f7;
  color-scheme: dark;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom));
  animation: cgCpFade 0.25s ease;
  overflow-y: auto;
  font-family: 'Noto Sans', system-ui, sans-serif;
}
@keyframes cgCpFade { from { opacity: 0; } to { opacity: 1; } }

.cg-cp__sheet {
  width: 100%;
  max-width: 960px;
  background: rgba(22, 24, 30, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.5);
  border-radius: 28px;
  padding: 28px 36px 24px;
  -webkit-backdrop-filter: blur(24px);
  backdrop-filter: blur(24px);
  animation: cgCpRise 0.38s cubic-bezier(0.2, 0.8, 0.2, 1);
  display: flex;
  flex-direction: column;
  gap: 22px;
}
@keyframes cgCpRise {
  from { opacity: 0; transform: translateY(24px) scale(0.985); }
  to { opacity: 1; transform: none; }
}

.cg-cp__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  padding-bottom: 16px;
}
.cg-cp__brand { display: flex; align-items: center; gap: 12px; }
.cg-cp__brand-mark {
  width: 44px; height: 44px;
  border-radius: 12px;
  background: transparent;
  border: none;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  box-shadow: 0 4px 18px rgba(254, 0, 0, 0.35);
}
.cg-cp__brand-mark img { width: 100%; height: 100%; object-fit: cover; box-sizing: border-box; }
.cg-cp__brand-name {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #fff;
}
.cg-cp__close {
  width: 44px; height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.18s, color 0.18s, transform 0.12s, border-color 0.18s;
}
.cg-cp__close:hover { background: rgba(255,255,255,0.1); color: #fff; border-color: rgba(255, 255, 255, 0.25); }
.cg-cp__close:active { transform: scale(0.94); }

.cg-cp__body { display: flex; flex-direction: column; gap: 22px; }

.cg-cp__city-pick { display: flex; align-items: center; gap: 8px; }
.cg-cp__city-label { font-size: 0.85rem; color: rgba(244, 245, 247, 0.55); }
.cg-cp__city-select {
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #f4f5f7;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}
.cg-cp__city-select:focus { outline: 2px solid #4ade80; outline-offset: 1px; }
.cg-cp__city-select option { background: #1b1e25; color: #f4f5f7; }

.cg-cp__err {
  margin: 0;
  font-size: 0.85rem;
  color: #fda4af;
  text-align: center;
}

.cg-cp__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}
.cg-cp__footer-note { font-size: 0.82rem; color: rgba(244, 245, 247, 0.5); }
.cg-cp__back {
  padding: 11px 24px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: background 0.18s, transform 0.12s, border-color 0.18s;
}
.cg-cp__back:hover { background: rgba(255, 255, 255, 0.14); border-color: rgba(255, 255, 255, 0.3); }
.cg-cp__back:active { transform: scale(0.97); }
.cg-cp__back:focus-visible { outline: 2px solid #4ade80; outline-offset: 2px; }

@media (max-width: 720px) {
  .cg-cp { padding: 0; align-items: stretch; }
  .cg-cp__sheet {
    border-radius: 0;
    max-width: none;
    padding: max(20px, env(safe-area-inset-top)) 18px max(20px, env(safe-area-inset-bottom));
    box-shadow: none;
    border: none;
    background: rgba(16, 18, 24, 0.97);
    min-height: 100dvh;
  }
}
`;
