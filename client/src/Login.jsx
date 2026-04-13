import { useState } from 'react';
import { supabase } from './supabase.js';
import { ThemeToggle } from './ThemeToggle.jsx';

function mapLoginError(ex) {
  const msg = String(ex?.message || '');
  if (/invalid login credentials|invalid_credentials/i.test(msg)) return 'Неверный email или пароль';
  if (/email not confirmed/i.test(msg)) return 'Подтвердите email в письме от Supabase';
  return msg || 'Ошибка входа';
}

export function Login({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (!data.session?.access_token) throw new Error('Сессия не создана, попробуйте ещё раз');
      await onSuccess();
    } catch (ex) {
      setErr(mapLoginError(ex));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-theme-bar">
        <ThemeToggle />
      </div>
      <div className="login-card glass">
        <div className="login-brand">
          <span className="login-mark">
            <img src="/logo_reactivo1.png" alt="REAKTIVO PRO" />
          </span>
          <div>
            <h1 className="login-title">
              REAKTIVO <span className="login-title-pro">PRO</span>
            </h1>
            <p className="login-sub muted">Вход для сотрудников</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="field">
            <span className="field-label">Email</span>
            <input autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.ru" />
          </label>
          <label className="field">
            <span className="field-label">Пароль</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль"
            />
          </label>
          {err && <p className="err">{err}</p>}
          <button type="submit" className="btn-primary login-btn" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner inline" /> Вход…
              </>
            ) : (
              'Войти'
            )}
          </button>
        </form>
      </div>
      <style>{`
        .login-wrap { position: relative; min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 24px 16px; }
        .login-theme-bar { position: absolute; top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right)); z-index: 2; }
        .login-card { width: 100%; max-width: 400px; padding: 32px 28px 28px; }
        .login-brand { display: flex; gap: 14px; align-items: center; margin-bottom: 28px; min-width: 0; }
        .login-brand > div:last-child { min-width: 0; }
        .login-mark { width: 72px; height: 72px; border-radius: 18px; background: #fff; border: 1px solid var(--stroke); box-shadow: 0 2px 10px rgba(0,0,0,0.08); display: inline-flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
        .login-mark img { width: 100%; height: 100%; object-fit: contain; object-position: center; padding: 6px; box-sizing: border-box; display: block; }
        .login-title {
          font-family: var(--font-display);
          font-size: clamp(1.35rem, 5vw, 1.75rem);
          font-weight: 600;
          margin: 0;
          letter-spacing: 0.06em;
          line-height: 1.2;
          word-break: break-word;
          text-transform: uppercase;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35em;
        }
        .login-title-pro {
          font-size: 0.62em;
          font-weight: 700;
          letter-spacing: 0.14em;
          padding: 0.2em 0.45em 0.22em;
          border-radius: 6px;
          background: var(--gold-soft);
          border: 1px solid var(--stroke-strong);
          color: var(--gold);
          line-height: 1;
        }
        .login-sub { margin: 4px 0 0; font-size: 0.85rem; }
        .login-form { display: flex; flex-direction: column; gap: 16px; }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .field-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
        .err { color: var(--danger); font-size: 0.85rem; margin: 0; }
        .login-btn { width: 100%; margin-top: 8px; }
      `}</style>
    </div>
  );
}
