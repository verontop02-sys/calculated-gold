import { useCallback, useEffect, useRef, useState } from 'react';
import { connectClientDisplayStream, clientDisplayGet, pingApiHealth } from './api.js';
import { ClientResultView, CLIENT_RESULT_CSS } from './ClientResultView.jsx';

const ExpandIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
  </svg>
);
const ShrinkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
    <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
  </svg>
);

/** Метка Яндекс Карт — как на стойке «оставьте отзыв». */
function YandexPin({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 86" aria-hidden="true">
      <path
        fill="#FC3F1D"
        d="M32 0C15.4 0 2 13.8 2 30.8 2 54.2 32 86 32 86s30-31.8 30-55.2C62 13.8 48.6 0 32 0z"
      />
      <circle fill="#fff" cx="32" cy="30" r="13.5" />
    </svg>
  );
}

/**
 * Экран клиента (покупательский дисплей) — отдельная страница `/display`.
 *
 * Стоит на втором мониторе оператора или на отдельном планшете. По умолчанию —
 * белая заставка «оставьте отзыв» с QR на Яндекс Карты. Когда оператор нажимает
 * «Показать клиенту», сюда прилетает расчёт с суммой выкупа. «Очистить» снова
 * возвращает заставку с отзывом.
 *
 * Привязка к рабочему месту — по короткому коду (из URL `?code=` или вводится вручную).
 */
const CODE_KEY = 'cg_display_code';

function formatMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(n));
}

function readInitialCode() {
  try {
    const url = new URL(window.location.href);
    const fromUrl = (url.searchParams.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (fromUrl) {
      localStorage.setItem(CODE_KEY, fromUrl);
      return fromUrl;
    }
    return (localStorage.getItem(CODE_KEY) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  } catch {
    return '';
  }
}

export function ClientDisplay() {
  const [code, setCode] = useState(readInitialCode);
  const [state, setState] = useState({ mode: 'idle', view: null, brandName: 'REAKTIVO PRO' });
  const [connected, setConnected] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const closeRef = useRef(null);
  const pollRef = useRef(null);
  const retryRef = useRef(null);
  const aliveRef = useRef(true);

  const stopAll = useCallback(() => {
    closeRef.current?.();
    closeRef.current = null;
    clearTimeout(retryRef.current);
    clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    if (!code) { stopAll(); setConnected(false); return undefined; }

    let sseFails = 0;

    const startPolling = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(async () => {
        try {
          const s = await clientDisplayGet(code);
          if (aliveRef.current) { setState(s); setConnected(true); }
        } catch {
          if (aliveRef.current) setConnected(false);
        }
      }, 2000);
    };

    const connect = async () => {
      closeRef.current = await connectClientDisplayStream(
        code,
        (data) => {
          if (!aliveRef.current) return;
          sseFails = 0;
          setConnected(true);
          setState(data);
        },
        (status) => {
          if (!aliveRef.current) return;
          setConnected(false);
          closeRef.current = null;
          sseFails += 1;
          if (status === 400) return; // плохой код — не долбим
          if (sseFails >= 3) {
            // SSE не держится (напр. бесплатный хостинг) — переходим на polling
            startPolling();
            void pingApiHealth({ timeout: 60_000 }).catch(() => {});
          } else {
            retryRef.current = setTimeout(connect, 2500);
          }
        },
      );
    };

    connect();

    return () => {
      aliveRef.current = false;
      stopAll();
    };
  }, [code, stopAll]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch(() => {});
    } else {
      const el = document.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch(() => {});
    }
  }, []);

  const submitCode = (e) => {
    e.preventDefault();
    const c = codeInput.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!c) return;
    try { localStorage.setItem(CODE_KEY, c); } catch { /* ignore */ }
    setCode(c);
  };

  // Нет кода — экран ввода кода привязки.
  if (!code) {
    return (
      <div className="cg-disp cg-disp--pair">
        <form className="cg-disp__pair-card" onSubmit={submitCode}>
          <span className="cg-disp__pair-mark"><img src="/logo-reaktivo-mark.svg" alt="REAKTIVO PRO" /></span>
          <h1 className="cg-disp__pair-title">Экран клиента</h1>
          <p className="cg-disp__pair-hint">Введите код с экрана оператора, чтобы привязать дисплей.</p>
          <input
            className="cg-disp__pair-input"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
            placeholder="КОД"
            autoFocus
            inputMode="text"
            autoCapitalize="characters"
          />
          <button type="submit" className="cg-disp__pair-btn" disabled={!codeInput.trim()}>Подключить</button>
        </form>
        <style>{CSS}</style>
      </div>
    );
  }

  const showing = state.mode === 'show' && state.view;

  return (
    <div
      className={`cg-disp${showing ? '' : ' cg-disp--review'}`}
      onDoubleClick={toggleFullscreen}
      title="Двойной клик — полный экран"
    >
      {/* Заставка с отзывом / результат расчёта */}
      {showing ? (
        <div className="cg-disp__result">
          <header className="cg-disp__bar">
            <div className="cg-disp__brand">
              <span className="cg-disp__brand-mark"><img src="/logo-reaktivo-mark.svg" alt={state.brandName} /></span>
              <span className="cg-disp__brand-name">{state.brandName || 'REAKTIVO PRO'}</span>
            </div>
          </header>
          <div className="cg-disp__result-body">
            <ClientResultView view={state.view} formatMoney={formatMoney} />
          </div>
        </div>
      ) : (
        <div className="cg-disp__idle">
          <div className="cg-disp__idle-copy">
            <div className="cg-disp__idle-ym">
              <div className="cg-disp__idle-ym-title">Яндекс Карты</div>
              <div className="cg-disp__idle-ym-sub">Приложение к городу</div>
            </div>
            <YandexPin className="cg-disp__idle-pin" />
            <div className="cg-disp__idle-cta">
              <div className="cg-disp__idle-cta-lead">Оставьте</div>
              <div className="cg-disp__idle-cta-word">ОТЗЫВ</div>
            </div>
            <p className="cg-disp__idle-text">
              <b>Reaktivo</b> благодарит вас за посещение. Если вы хотите поделиться отзывом
              и поставить оценку, перейдите по ссылке в QR-коде.
            </p>
          </div>
          <div className="cg-disp__idle-qr">
            <img
              src="/yandex-review-qr.png"
              alt="QR-код отзыва о Reaktivo на Яндекс Картах"
              width="656"
              height="656"
              draggable="false"
            />
          </div>
        </div>
      )}

      {/* Кнопка полноэкранного режима */}
      <button
        type="button"
        className="cg-disp__fs-btn"
        onClick={toggleFullscreen}
        title={isFullscreen ? 'Выйти из полного экрана' : 'Полный экран'}
        aria-label={isFullscreen ? 'Выйти из полного экрана' : 'Полный экран'}
      >
        {isFullscreen ? <ShrinkIcon /> : <ExpandIcon />}
      </button>

      {/* Индикатор связи */}
      <span className={`cg-disp__dot${connected ? ' cg-disp__dot--on' : ''}`} title={connected ? 'Связь с рабочим местом' : 'Нет связи'} />

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
html, body { margin: 0; height: 100%; background: #0b0c10; }
#root { height: 100%; }

${CLIENT_RESULT_CSS}

.cg-disp {
  position: fixed; inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 0% 100%, rgba(55, 58, 64, 0.35), transparent 60%),
    radial-gradient(ellipse 70% 45% at 100% 0%, rgba(48, 50, 56, 0.30), transparent 55%),
    linear-gradient(180deg, #1a1b1e 0%, #141516 100%);
  color: #f4f5f7;
  color-scheme: dark;
  font-family: var(--font-display, 'Geometria', system-ui, sans-serif);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Заставка: отзыв на Яндекс Картах ── */
.cg-disp--review {
  background: #fff;
  color: #111;
  color-scheme: light;
  align-items: stretch;
  justify-content: stretch;
}
.cg-disp__idle {
  width: 100%; height: 100%;
  box-sizing: border-box;
  display: flex; flex-direction: column; align-items: center; justify-content: space-between;
  text-align: center;
  padding: max(18px, env(safe-area-inset-top)) 28px max(18px, env(safe-area-inset-bottom));
  animation: cgDispIdleIn 0.45s ease;
}
@keyframes cgDispIdleIn { from { opacity: 0; } to { opacity: 1; } }
.cg-disp__idle-copy {
  display: flex; flex-direction: column; align-items: center;
  gap: clamp(10px, 2.2vh, 22px);
  width: 100%; max-width: 640px;
  flex: 1 1 auto;
  justify-content: center;
}
.cg-disp__idle-ym-title {
  font-size: clamp(1.55rem, 4.6vw, 2.35rem);
  font-weight: 800; letter-spacing: -0.03em; color: #111; line-height: 1.1;
}
.cg-disp__idle-ym-sub {
  margin-top: 4px;
  font-size: clamp(0.85rem, 2.2vw, 1.05rem);
  color: #9aa0a6; font-weight: 500;
}
.cg-disp__idle-pin {
  width: clamp(64px, 14vw, 112px);
  height: auto;
  flex-shrink: 0;
}
.cg-disp__idle-cta-lead {
  font-size: clamp(1.35rem, 4vw, 2rem);
  font-weight: 800; color: #111; letter-spacing: -0.03em; line-height: 1.1;
}
.cg-disp__idle-cta-word {
  font-size: clamp(2.1rem, 7vw, 3.4rem);
  font-weight: 800; color: #111; letter-spacing: 0.04em; line-height: 1;
  text-transform: uppercase;
}
.cg-disp__idle-text {
  margin: 0;
  max-width: 36em;
  font-size: clamp(0.92rem, 2.4vw, 1.18rem);
  line-height: 1.45; color: #1a1a1a; font-weight: 500;
}
.cg-disp__idle-text b { font-weight: 800; }
.cg-disp__idle-qr {
  flex: 0 0 auto;
  width: min(78vw, 48vh, 400px);
  padding: 8px;
  background: #fff;
  user-select: none;
  -webkit-touch-callout: none;
}
.cg-disp__idle-qr img {
  display: block; width: 100%; height: auto;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  -ms-interpolation-mode: nearest-neighbor;
}
.cg-disp--review .cg-disp__fs-btn {
  background: rgba(0,0,0,0.06);
  border-color: rgba(0,0,0,0.10);
  color: rgba(0,0,0,0.38);
}
.cg-disp--review .cg-disp__fs-btn:hover { background: rgba(0,0,0,0.12); color: rgba(0,0,0,0.75); }
.cg-disp--review .cg-disp__dot { opacity: 0.7; }

/* Планшет лёжа: текст слева, QR крупно справа — чтобы код не сжимался */
@media (orientation: landscape) and (min-width: 700px) {
  .cg-disp__idle {
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: clamp(24px, 6vw, 72px);
    padding: 28px 40px;
  }
  .cg-disp__idle-copy {
    flex: 1 1 0; max-width: 520px;
    align-items: flex-start; text-align: left;
    justify-content: center;
  }
  .cg-disp__idle-qr { width: min(42vw, 72vh, 420px); }
}

/* ── Результат ── */
.cg-disp__result {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  padding: clamp(16px, 3vw, 44px);
  box-sizing: border-box;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  animation: cgDispResIn 0.4s ease;
}
@keyframes cgDispResIn { from { opacity: 0; } to { opacity: 1; } }
.cg-disp__bar { display: flex; align-items: center; justify-content: center; margin-bottom: clamp(10px, 2.4vw, 30px); flex-shrink: 0; }
.cg-disp__brand { display: flex; align-items: center; gap: 14px; }
.cg-disp__brand-mark {
  width: clamp(38px, 6vw, 52px); height: clamp(38px, 6vw, 52px); border-radius: 12px; background: transparent;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  box-shadow: 0 6px 22px rgba(254, 0, 0, 0.35); flex-shrink: 0;
}
.cg-disp__brand-mark img { width: 100%; height: 100%; object-fit: cover; box-sizing: border-box; }
.cg-disp__brand-name { font-size: clamp(1rem, 2.5vw, 1.3rem); font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #fff; }
.cg-disp__result-body {
  flex: 1;
  display: flex; align-items: flex-start; justify-content: center;
  width: 100%;
}
.cg-disp__result-body .cg-crv { max-width: 1100px; }
.cg-disp__result-body .cg-crv__hero-value { font-size: clamp(4rem, 11vw, 9rem); }
.cg-disp__result-body .cg-crv__pillar-value { font-size: clamp(2.2rem, 5vw, 3.6rem); }

/* ── Кнопка полного экрана ── */
.cg-disp__fs-btn {
  position: fixed; right: 14px; bottom: 34px;
  width: 36px; height: 36px; border-radius: 10px;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.10);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.45);
  opacity: 0;
  transition: opacity 0.22s, background 0.15s, color 0.15s;
  z-index: 50;
  backdrop-filter: blur(6px);
}
/* Показывать при наведении на экран (десктоп) */
.cg-disp:hover .cg-disp__fs-btn { opacity: 1; }
.cg-disp__fs-btn:hover { background: rgba(255,255,255,0.15); color: rgba(255,255,255,0.9); }
.cg-disp__fs-btn:active { transform: scale(0.94); }
/* Touch-устройства: всегда слегка виден */
@media (hover: none) {
  .cg-disp__fs-btn { opacity: 0.25; }
  .cg-disp__fs-btn:active { opacity: 1; background: rgba(255,255,255,0.2); }
}

/* ── Индикатор связи ── */
.cg-disp__dot {
  position: fixed; right: 14px; bottom: 14px;
  width: 9px; height: 9px; border-radius: 50%;
  background: #fb7185; box-shadow: 0 0 8px rgba(251,113,133,0.7);
  opacity: 0.5; transition: background 0.3s, box-shadow 0.3s;
}
.cg-disp__dot--on { background: #4ade80; box-shadow: 0 0 8px rgba(74,222,128,0.7); }

/* ── Ввод кода ── */
.cg-disp--pair { padding: 24px; }
.cg-disp__pair-card {
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  background: rgba(22, 24, 30, 0.92);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 24px;
  padding: clamp(24px, 5vw, 36px) clamp(20px, 5vw, 40px);
  box-shadow: 0 40px 100px rgba(0,0,0,0.5);
  width: 100%; max-width: 380px;
}
.cg-disp__pair-mark {
  width: 72px; height: 72px; border-radius: 16px; background: transparent;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  box-shadow: 0 8px 28px rgba(254, 0, 0, 0.3);
}
.cg-disp__pair-mark img { width: 100%; height: 100%; object-fit: cover; }
.cg-disp__pair-title { margin: 6px 0 0; font-size: 1.4rem; font-weight: 700; color: #fff; }
.cg-disp__pair-hint { margin: 0; font-size: 0.9rem; color: rgba(244,245,247,0.55); text-align: center; line-height: 1.5; }
.cg-disp__pair-input {
  width: 100%; box-sizing: border-box;
  padding: 14px 16px; border-radius: 12px; text-align: center;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16);
  color: #fff; font-size: 1.6rem; font-weight: 700; letter-spacing: 0.3em;
  text-transform: uppercase; outline: none;
}
.cg-disp__pair-input:focus { border-color: #fe0000; }
.cg-disp__pair-btn {
  width: 100%; padding: 13px; border-radius: 12px; border: none;
  background: #fe0000; color: #fff; font-size: 0.95rem; font-weight: 700; cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}
.cg-disp__pair-btn:hover:not(:disabled) { opacity: 0.92; }
.cg-disp__pair-btn:active:not(:disabled) { transform: scale(0.98); }
.cg-disp__pair-btn:disabled { opacity: 0.4; cursor: not-allowed; }
`;
