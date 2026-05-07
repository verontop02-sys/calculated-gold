import { useCallback, useEffect, useState } from 'react';
import { publicFieldDealSessionGet, publicFieldDealSessionVerify } from './api.js';
import { ThemeToggle } from './ThemeToggle.jsx';

function formatMoney(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(n);
}

export function FieldDealConfirm({ token }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const d = await publicFieldDealSessionGet(token);
      setInfo(d);
    } catch (e) {
      setErr(e?.message || 'Не удалось загрузить');
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const c = String(code).replace(/\D/g, '');
    if (c.length !== 6) {
      setErr('Введите 6 цифр из СМС');
      return;
    }
    setBusy(true);
    try {
      await publicFieldDealSessionVerify(token, c);
      setDone(true);
    } catch (e) {
      setErr(e?.message || 'Ошибка');
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fd-confirm-wrap">
      <div className="fd-confirm-theme">
        <ThemeToggle />
      </div>
      <div className="glass fd-confirm-card">
        <h1 className="fd-confirm-title">Подтверждение сделки</h1>
        <p className="muted fd-confirm-lead">
          Введите код из СМС. После подтверждения сделка фиксируется в учёте REAKTIVO PRO.
        </p>

        {loading && <p className="muted">Загрузка…</p>}
        {!loading && err && !info && <p className="fd-err">{err}</p>}

        {!loading && info && (
          <>
            {info.status !== 'pending' && !done && (
              <p className="fd-err">
                {info.status === 'confirmed'
                  ? 'Эта ссылка уже использована.'
                  : info.status === 'expired'
                    ? 'Срок действия кода истёк. Попросите сотрудника отправить ссылку заново.'
                    : 'Сессия недоступна.'}
              </p>
            )}

            {(info.status === 'pending' || done) && (
              <div className="fd-summary">
                <div>
                  <span className="muted small">Сумма</span>
                  <p className="fd-sum mono-nums">{formatMoney(info.totalRub)}</p>
                </div>
                <div>
                  <span className="muted small">Телефон</span>
                  <p className="mono-nums">+7 ··· {info.phoneLast4}</p>
                </div>
                <div>
                  <span className="muted small">Продавец</span>
                  <p>{info.sellerName}</p>
                </div>
              </div>
            )}

            {done && (
              <p className="fd-success">
                Готово: сделка зафиксирована. PDF с квитанцией отправлен на почту сотрудника (если настроена почта на
                сервере). Можно закрыть эту страницу.
              </p>
            )}

            {info.status === 'pending' && info.canEnterCode && !done && (
              <form className="fd-form" onSubmit={submit}>
                <label className="field">
                  <span className="field-label">Код из СМС</span>
                  <input
                    className="fd-code-input mono-nums"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </label>
                {err && <p className="fd-err">{err}</p>}
                <p className="muted small">
                  Попыток: {info.attemptsUsed} / {info.attemptsMax}. Код действует до окончания таймера на стороне
                  сервера.
                </p>
                <button type="submit" className="btn-primary fd-submit" disabled={busy}>
                  {busy ? 'Проверяем…' : 'Подтвердить'}
                </button>
              </form>
            )}

            {info.status === 'pending' && !info.canEnterCode && !done && (
              <p className="fd-err">Попытки исчерпаны или время истекло. Запросите новую ссылку у сотрудника.</p>
            )}
          </>
        )}
      </div>
      <style>{`
        .fd-confirm-wrap {
          min-height: 100dvh;
          padding: max(16px, env(safe-area-inset-top)) 16px 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          background: var(--bg, #0c0a08);
        }
        .fd-confirm-theme {
          align-self: flex-end;
          margin-bottom: 12px;
        }
        .fd-confirm-card {
          width: 100%;
          max-width: 400px;
          padding: 22px 18px 24px;
          border-radius: 18px;
        }
        .fd-confirm-title {
          font-family: var(--font-display, inherit);
          font-size: 1.25rem;
          margin: 0 0 8px;
          color: var(--text, #faf8f4);
        }
        .fd-confirm-lead {
          margin: 0 0 18px;
          line-height: 1.45;
          font-size: 0.9rem;
        }
        .fd-summary {
          display: grid;
          gap: 12px;
          margin-bottom: 18px;
          padding: 14px;
          border-radius: 12px;
          border: 1px solid var(--stroke, rgba(255,255,255,0.1));
          background: var(--input-bg, rgba(255,255,255,0.03));
        }
        .fd-sum {
          font-size: 1.35rem;
          font-weight: 700;
          margin: 4px 0 0;
          color: var(--gold, #e8c547);
        }
        .fd-form .field {
          margin-bottom: 12px;
        }
        .fd-code-input {
          font-size: 1.5rem;
          letter-spacing: 0.2em;
          text-align: center;
          width: 100%;
          padding: 12px;
        }
        .fd-submit {
          width: 100%;
          margin-top: 8px;
        }
        .fd-err {
          color: var(--danger, #f87171);
          font-size: 0.9rem;
          margin: 8px 0;
          line-height: 1.4;
        }
        .fd-success {
          color: #86efac;
          font-size: 0.92rem;
          line-height: 1.45;
          margin: 12px 0 0;
        }
      `}</style>
    </div>
  );
}
