import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const RESEND_COOLDOWN_SEC = 60;

/**
 * Первый вход с нового устройства: пароль уже проверен, теперь код с почты.
 * После подтверждения устройство запоминается — дальше вход как обычно.
 */
export function DeviceVerify({ onVerified, onSignOut }) {
  const [stage, setStage] = useState('sending'); // sending | code | error
  const [emailMasked, setEmailMasked] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef(null);
  const requestedRef = useRef(false);

  const sendCode = useCallback(async () => {
    setErr('');
    try {
      const out = await api.deviceCheck();
      if (out?.trusted) {
        onVerified?.();
        return;
      }
      setEmailMasked(out?.emailMasked || '');
      setStage('code');
      setCooldown(RESEND_COOLDOWN_SEC);
      setTimeout(() => inputRef.current?.focus(), 60);
    } catch (e) {
      setErr(e?.message || 'Не удалось отправить код');
      setStage('error');
    }
  }, [onVerified]);

  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    void sendCode();
  }, [sendCode]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleSubmit(e) {
    e.preventDefault();
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) {
      setErr('Введите 6 цифр из письма');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      const out = await api.deviceVerify(digits);
      if (out?.trusted) {
        onVerified?.();
        return;
      }
      setErr('Не удалось подтвердить. Попробуйте ещё раз.');
    } catch (ex) {
      setErr(ex?.message || 'Неверный код');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dv-wrap">
      <div className="dv-card">
        <div className="dv-icon" aria-hidden>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2 className="dv-title">Подтвердите вход</h2>

        {stage === 'sending' && (
          <p className="dv-sub">
            <span className="spinner inline" /> Отправляем код на почту…
          </p>
        )}

        {stage === 'code' && (
          <>
            <p className="dv-sub">
              Вы входите с нового устройства. Мы отправили 6-значный код на
              {' '}<b>{emailMasked || 'вашу почту'}</b>. Введите его — и это устройство
              больше не будет спрашивать код.
            </p>
            <form onSubmit={handleSubmit} className="dv-form">
              <input
                ref={inputRef}
                className="dv-code-input mono-nums"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              {err && <p className="dv-err">{err}</p>}
              <button type="submit" className="dv-submit" disabled={busy || code.length !== 6}>
                {busy ? (<><span className="spinner inline" /> Проверяем…</>) : 'Подтвердить'}
              </button>
            </form>
            <button
              type="button"
              className="dv-resend"
              disabled={cooldown > 0}
              onClick={() => sendCode()}
            >
              {cooldown > 0 ? `Отправить код ещё раз (${cooldown} с)` : 'Отправить код ещё раз'}
            </button>
          </>
        )}

        {stage === 'error' && (
          <>
            <p className="dv-err">{err}</p>
            <button type="button" className="dv-submit" onClick={() => sendCode()}>
              Попробовать снова
            </button>
          </>
        )}

        <button type="button" className="dv-signout" onClick={onSignOut}>
          Выйти и войти другим аккаунтом
        </button>
      </div>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.dv-wrap {
  min-height: 100dvh;
  display: flex; align-items: center; justify-content: center;
  padding: 24px 16px;
  background: var(--bg-deep);
  background-image: var(--bg-gradient);
}
.dv-card {
  width: 100%; max-width: 420px;
  padding: 30px 28px 24px;
  border-radius: 20px;
  border: 1px solid var(--stroke-soft);
  background: var(--bg-panel-solid);
  box-shadow: var(--shadow-card);
  display: flex; flex-direction: column; align-items: center;
  text-align: center;
}
.dv-icon {
  width: 52px; height: 52px; border-radius: 15px;
  background: var(--accent-soft); color: var(--text-strong);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
}
.dv-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem; font-weight: 700; letter-spacing: -0.02em;
  color: var(--text-strong);
}
.dv-sub {
  margin: 10px 0 0;
  font-size: 0.87rem; color: var(--text-muted); line-height: 1.55;
}
.dv-sub b { color: var(--text); }
.dv-form { width: 100%; margin-top: 18px; display: flex; flex-direction: column; gap: 12px; }
.dv-code-input {
  width: 100%;
  text-align: center;
  font-size: 1.6rem; font-weight: 700; letter-spacing: 0.4em;
  padding: 12px 10px 12px 18px;
  border-radius: 12px;
  border: 1px solid var(--stroke);
  background: var(--surface);
  color: var(--text-strong);
  outline: none;
}
.dv-code-input:focus { border-color: var(--accent); }
.dv-err { margin: 0; color: var(--danger, #ff5a63); font-size: 0.84rem; }
.dv-submit {
  width: 100%;
  padding: 13px 18px;
  border: none; border-radius: 12px;
  background: var(--accent-grad);
  color: #fff; font-size: 0.92rem; font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 22px var(--accent-glow);
  display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: filter 0.18s, transform 0.16s;
}
.dv-submit:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
.dv-submit:disabled { opacity: 0.55; cursor: not-allowed; }
.dv-resend {
  margin-top: 14px;
  border: none; background: none;
  color: var(--accent); font-size: 0.82rem; font-weight: 600;
  cursor: pointer;
}
.dv-resend:disabled { color: var(--text-dim); cursor: default; }
.dv-signout {
  margin-top: 18px;
  border: none; background: none;
  color: var(--text-dim); font-size: 0.78rem;
  cursor: pointer; text-decoration: underline;
}
.dv-signout:hover { color: var(--text-muted); }
`;
