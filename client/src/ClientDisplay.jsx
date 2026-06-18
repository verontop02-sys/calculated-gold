import { useCallback, useEffect, useRef, useState } from 'react';
import { connectClientDisplayStream, clientDisplayGet, pingApiHealth } from './api.js';
import { ClientResultView, CLIENT_RESULT_CSS } from './ClientResultView.jsx';

/**
 * Экран клиента (покупательский дисплей) — отдельная страница `/display`.
 *
 * Стоит на втором мониторе оператора или на отдельном планшете. По умолчанию —
 * заставка с логотипом REAKTIVO. Когда оператор нажимает «Показать клиенту»,
 * сюда прилетает готовый расчёт и крупно загорается зелёный экран с суммой выкупа.
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

  const enterFullscreen = useCallback(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
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
          <span className="cg-disp__pair-mark"><img src="/logo_reactivo1.png" alt="REAKTIVO PRO" /></span>
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
    <div className="cg-disp" onDoubleClick={enterFullscreen} title="Двойной клик — на весь экран">
      {/* Заставка / результат */}
      {showing ? (
        <div className="cg-disp__result">
          <header className="cg-disp__bar">
            <div className="cg-disp__brand">
              <span className="cg-disp__brand-mark"><img src="/logo_reactivo1.png" alt={state.brandName} /></span>
              <span className="cg-disp__brand-name">{state.brandName || 'REAKTIVO PRO'}</span>
            </div>
          </header>
          <div className="cg-disp__result-body">
            <ClientResultView view={state.view} formatMoney={formatMoney} />
          </div>
        </div>
      ) : (
        <div className="cg-disp__idle">
          <span className="cg-disp__idle-mark"><img src="/logo_reactivo1.png" alt="REAKTIVO PRO" /></span>
          <span className="cg-disp__idle-name">REAKTIVO <b>PRO</b></span>
          <span className="cg-disp__idle-sub">Оценка драгоценных металлов</span>
        </div>
      )}

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
    radial-gradient(ellipse 110% 75% at 50% -15%, rgba(139, 124, 255, 0.16), transparent 55%),
    radial-gradient(ellipse 70% 50% at 100% 100%, rgba(74, 222, 128, 0.08), transparent 60%),
    linear-gradient(180deg, #101218 0%, #0b0c10 100%);
  color: #f4f5f7;
  color-scheme: dark;
  font-family: 'DM Sans', 'Inter', system-ui, sans-serif;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Заставка ── */
.cg-disp__idle {
  display: flex; flex-direction: column; align-items: center; gap: 18px;
  text-align: center;
  animation: cgDispIdleIn 0.6s ease;
}
@keyframes cgDispIdleIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }
.cg-disp__idle-mark {
  width: clamp(120px, 18vw, 200px); height: clamp(120px, 18vw, 200px);
  border-radius: 32px;
  background: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 30px 90px rgba(0,0,0,0.5), 0 0 80px rgba(139, 124, 255, 0.18);
  animation: cgDispPulse 4s ease-in-out infinite;
}
.cg-disp__idle-mark img { width: 74%; height: 74%; object-fit: contain; }
@keyframes cgDispPulse { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
.cg-disp__idle-name {
  font-size: clamp(1.6rem, 4vw, 2.6rem); font-weight: 700; letter-spacing: 0.14em;
  text-transform: uppercase; color: #fff;
}
.cg-disp__idle-name b { color: #8b7cff; font-weight: 800; }
.cg-disp__idle-sub { font-size: clamp(0.9rem, 1.6vw, 1.15rem); color: rgba(244,245,247,0.55); letter-spacing: 0.04em; }

/* ── Результат ── */
.cg-disp__result {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  padding: clamp(20px, 3vw, 44px);
  box-sizing: border-box;
  animation: cgDispResIn 0.4s ease;
}
@keyframes cgDispResIn { from { opacity: 0; } to { opacity: 1; } }
.cg-disp__bar { display: flex; align-items: center; justify-content: center; margin-bottom: clamp(14px, 2.4vw, 30px); }
.cg-disp__brand { display: flex; align-items: center; gap: 14px; }
.cg-disp__brand-mark {
  width: 52px; height: 52px; border-radius: 14px; background: #fff;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  box-shadow: 0 6px 22px rgba(0,0,0,0.35);
}
.cg-disp__brand-mark img { width: 100%; height: 100%; object-fit: contain; padding: 6px; box-sizing: border-box; }
.cg-disp__brand-name { font-size: 1.3rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #fff; }
.cg-disp__result-body {
  flex: 1;
  display: flex; align-items: center; justify-content: center;
  width: 100%;
}
.cg-disp__result-body .cg-crv { max-width: 1100px; }
.cg-disp__result-body .cg-crv__hero-value { font-size: clamp(4rem, 11vw, 9rem); }
.cg-disp__result-body .cg-crv__pillar-value { font-size: clamp(2.2rem, 5vw, 3.6rem); }

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
  padding: 36px 40px;
  box-shadow: 0 40px 100px rgba(0,0,0,0.5);
  width: 100%; max-width: 380px;
}
.cg-disp__pair-mark {
  width: 72px; height: 72px; border-radius: 18px; background: #fff;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.cg-disp__pair-mark img { width: 70%; height: 70%; object-fit: contain; }
.cg-disp__pair-title { margin: 6px 0 0; font-size: 1.4rem; font-weight: 700; color: #fff; }
.cg-disp__pair-hint { margin: 0; font-size: 0.9rem; color: rgba(244,245,247,0.55); text-align: center; line-height: 1.5; }
.cg-disp__pair-input {
  width: 100%; box-sizing: border-box;
  padding: 14px 16px; border-radius: 12px; text-align: center;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16);
  color: #fff; font-size: 1.6rem; font-weight: 700; letter-spacing: 0.3em;
  text-transform: uppercase; outline: none;
}
.cg-disp__pair-input:focus { border-color: #8b7cff; }
.cg-disp__pair-btn {
  width: 100%; padding: 13px; border-radius: 12px; border: none;
  background: #8b7cff; color: #fff; font-size: 0.95rem; font-weight: 700; cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}
.cg-disp__pair-btn:hover:not(:disabled) { opacity: 0.92; }
.cg-disp__pair-btn:active:not(:disabled) { transform: scale(0.98); }
.cg-disp__pair-btn:disabled { opacity: 0.4; cursor: not-allowed; }
`;
