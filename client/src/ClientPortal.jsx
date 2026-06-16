import { useCallback, useEffect, useMemo, useState } from 'react';
import { clientApi, getClientToken, setClientToken } from './api.js';

function formatMoney(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

function formatPhoneInput(raw) {
  const d = String(raw || '').replace(/\D/g, '').replace(/^8/, '7').replace(/^7/, '');
  const p = d.slice(0, 10);
  const a = p.slice(0, 3);
  const b = p.slice(3, 6);
  const c = p.slice(6, 8);
  const e = p.slice(8, 10);
  let out = '';
  if (a) out += `(${a}`;
  if (a.length === 3) out += ') ';
  if (b) out += b;
  if (c) out += `-${c}`;
  if (e) out += `-${e}`;
  return out;
}

const PRESET_PROBES = ['585', '750', '999'];

export function ClientPortal() {
  // 'checking' | 'login' | 'authed'
  const [phase, setPhase] = useState('checking');
  const [tab, setTab] = useState('calc');

  // login state
  const [step, setStep] = useState('phone'); // 'phone' | 'code'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [phoneMasked, setPhoneMasked] = useState('');
  const [resendIn, setResendIn] = useState(0);

  // Проверяем сохранённый токен.
  useEffect(() => {
    if (!getClientToken()) {
      setPhase('login');
      return;
    }
    clientApi
      .me()
      .then(() => setPhase('authed'))
      .catch(() => {
        setClientToken('');
        setPhase('login');
      });
  }, []);

  // Таймер повторной отправки.
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const id = setInterval(() => setResendIn((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const phoneDigits = phone.replace(/\D/g, '');

  async function requestCode(e) {
    e?.preventDefault?.();
    setErr('');
    if (phoneDigits.length !== 10) {
      setErr('Введите номер телефона полностью');
      return;
    }
    setBusy(true);
    try {
      const out = await clientApi.requestCode(`7${phoneDigits}`);
      setPhoneMasked(out.phoneMasked || '');
      setStep('code');
      setResendIn(60);
    } catch (e2) {
      setErr(e2?.message || 'Не удалось отправить код');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e) {
    e?.preventDefault?.();
    setErr('');
    const c = code.replace(/\D/g, '');
    if (c.length !== 6) {
      setErr('Введите 6 цифр из СМС');
      return;
    }
    setBusy(true);
    try {
      await clientApi.verify(`7${phoneDigits}`, c);
      setPhase('authed');
      setCode('');
    } catch (e2) {
      setErr(e2?.message || 'Неверный код');
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    setClientToken('');
    setPhase('login');
    setStep('phone');
    setPhone('');
    setCode('');
    setErr('');
    setPhoneMasked('');
  }

  return (
    <div className="cpx-root">
      <div className="cpx-orb cpx-orb--a" aria-hidden />
      <div className="cpx-orb cpx-orb--b" aria-hidden />

      <header className="cpx-topbar">
        <span className="cpx-brand">
          <span className="cpx-brand-mark">
            <img src="/logo_reactivo1.png" alt="REAKTIVO" />
          </span>
          REAKTIVO <span className="cpx-brand-pro">кабинет</span>
        </span>
        {phase === 'authed' && (
          <button type="button" className="cpx-logout" onClick={logout}>
            Выйти
          </button>
        )}
      </header>

      <main className="cpx-main">
        {phase === 'checking' && (
          <div className="cpx-center">
            <span className="cpx-spinner" /> Загрузка…
          </div>
        )}

        {phase === 'login' && (
          <div className="cpx-card cpx-login">
            <h1 className="cpx-title">Личный кабинет</h1>
            <p className="cpx-sub">
              Вход по номеру телефона, указанному в договоре. Мы отправим SMS с кодом подтверждения.
            </p>

            {step === 'phone' && (
              <form onSubmit={requestCode} className="cpx-form">
                <label className="cpx-field">
                  <span className="cpx-field-label">Номер телефона</span>
                  <div className="cpx-phone">
                    <span className="cpx-phone-prefix">+7</span>
                    <input
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                      placeholder="(900) 000-00-00"
                      autoFocus
                    />
                  </div>
                </label>
                {err && <p className="cpx-err">{err}</p>}
                <button type="submit" className="cpx-btn" disabled={busy}>
                  {busy ? <><span className="cpx-spinner" /> Отправляем…</> : 'Получить код'}
                </button>
              </form>
            )}

            {step === 'code' && (
              <form onSubmit={verifyCode} className="cpx-form">
                <p className="cpx-code-hint">
                  Код отправлен на {phoneMasked || 'ваш номер'}. Введите 6 цифр из SMS.
                </p>
                <label className="cpx-field">
                  <span className="cpx-field-label">Код из SMS</span>
                  <input
                    className="cpx-code-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    autoFocus
                  />
                </label>
                {err && <p className="cpx-err">{err}</p>}
                <button type="submit" className="cpx-btn" disabled={busy}>
                  {busy ? <><span className="cpx-spinner" /> Проверяем…</> : 'Войти'}
                </button>
                <div className="cpx-code-actions">
                  <button
                    type="button"
                    className="cpx-link"
                    onClick={() => { setStep('phone'); setCode(''); setErr(''); }}
                  >
                    Изменить номер
                  </button>
                  <button
                    type="button"
                    className="cpx-link"
                    disabled={resendIn > 0 || busy}
                    onClick={requestCode}
                  >
                    {resendIn > 0 ? `Отправить ещё раз через ${resendIn}с` : 'Отправить код ещё раз'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {phase === 'authed' && (
          <div className="cpx-authed">
            <div className="cpx-tabs">
              <button
                type="button"
                className={`cpx-tab${tab === 'calc' ? ' cpx-tab--on' : ''}`}
                onClick={() => setTab('calc')}
              >
                Калькулятор
              </button>
              <button
                type="button"
                className={`cpx-tab${tab === 'history' ? ' cpx-tab--on' : ''}`}
                onClick={() => setTab('history')}
              >
                Мои сделки
              </button>
            </div>

            {tab === 'calc' && <ClientCalculator />}
            {tab === 'history' && <ClientDeals onAuthExpired={logout} />}
          </div>
        )}
      </main>

      <footer className="cpx-foot">© {new Date().getFullYear()} REAKTIVO · оценка и выкуп золота</footer>

      <style>{CSS}</style>
    </div>
  );
}

function ClientCalculator() {
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [weight, setWeight] = useState('');
  const [purity, setPurity] = useState('585');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    clientApi
      .buybackQuote('moex')
      .then((q) => { if (alive) { setQuote(q); setErr(''); } })
      .catch((e) => { if (alive) setErr(e?.message || 'Не удалось загрузить курс'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const probeOptions = useMemo(() => {
    const fromQuote = quote?.perGram ? Object.keys(quote.perGram) : [];
    const all = [...new Set([...PRESET_PROBES, ...fromQuote])]
      .map((p) => Number(p))
      .filter((p) => Number.isFinite(p) && p > 0)
      .sort((a, b) => a - b)
      .map(String);
    return all.length ? all : PRESET_PROBES;
  }, [quote]);

  const result = useMemo(() => {
    const w = parseFloat(String(weight).replace(',', '.'));
    const perGram = quote?.perGram?.[purity];
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(perGram)) return null;
    const mid = perGram * w;
    const half = Number(quote?.rangeHalfWidthPercent) || 0;
    return {
      mid,
      low: mid * (1 - half / 100),
      high: mid * (1 + half / 100),
      perGram,
      half,
    };
  }, [weight, purity, quote]);

  return (
    <div className="cpx-card">
      <h2 className="cpx-h2">Сколько вы получите</h2>
      <p className="cpx-sub">Укажите вес изделия и пробу — покажем сумму выкупа по текущему курсу.</p>

      {loading && <p className="cpx-muted"><span className="cpx-spinner" /> Загружаем курс…</p>}
      {err && !loading && <p className="cpx-err">{err}</p>}

      {!loading && (
        <>
          <div className="cpx-calc-fields">
            <label className="cpx-field">
              <span className="cpx-field-label">Вес, г</span>
              <input
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="например 7.42"
              />
            </label>
            <div className="cpx-field">
              <span className="cpx-field-label">Проба</span>
              <div className="cpx-probes">
                {probeOptions.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`cpx-probe${purity === p ? ' cpx-probe--on' : ''}`}
                    onClick={() => setPurity(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {result ? (
            <div className="cpx-result">
              <span className="cpx-result-label">Сумма выкупа</span>
              <p className="cpx-result-range">
                {formatMoney(result.low)}
                <span className="cpx-dash"> — </span>
                {formatMoney(result.high)}
              </p>
              <span className="cpx-result-mid">ориентир {formatMoney(result.mid)}</span>
            </div>
          ) : (
            <div className="cpx-result cpx-result--empty">
              <span className="cpx-muted">Введите вес, чтобы увидеть сумму</span>
            </div>
          )}

          {quote?.updatedAt && (
            <p className="cpx-quote-meta">
              Курс обновлён {formatDate(quote.updatedAt)} · {formatMoney(quote.goldRubPerGram)} / г (биржа)
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ClientDeals({ onAuthExpired }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setErr('');
    clientApi
      .deals()
      .then(setData)
      .catch((e) => {
        if (e?.status === 401) { onAuthExpired?.(); return; }
        setErr(e?.message || 'Не удалось загрузить сделки');
      })
      .finally(() => setLoading(false));
  }, [onAuthExpired]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="cpx-card cpx-muted"><span className="cpx-spinner" /> Загружаем сделки…</div>;
  if (err) return <div className="cpx-card cpx-err">{err}</div>;

  const deals = data?.deals || [];

  return (
    <div className="cpx-deals">
      <div className="cpx-card cpx-deals-summary">
        <div className="cpx-summary-item">
          <span className="cpx-summary-k">Всего сделок</span>
          <span className="cpx-summary-v">{data?.dealsCount ?? 0}</span>
        </div>
        <div className="cpx-summary-item">
          <span className="cpx-summary-k">На сумму</span>
          <span className="cpx-summary-v cpx-summary-v--gold">{formatMoney(data?.totalRub)}</span>
        </div>
      </div>

      {deals.length === 0 && (
        <div className="cpx-card cpx-muted">Сделок по вашему номеру пока нет.</div>
      )}

      {deals.map((d) => (
        <div key={d.id} className="cpx-card cpx-deal">
          <div className="cpx-deal-head">
            <div>
              <div className="cpx-deal-no">{d.contractNo ? `Договор № ${d.contractNo}` : 'Без номера'}</div>
              <div className="cpx-deal-date">{formatDate(d.createdAt)}</div>
            </div>
            <div className="cpx-deal-sum">{formatMoney(d.totalRub)}</div>
          </div>
          {Array.isArray(d.rows) && d.rows.length > 0 && (
            <ul className="cpx-deal-rows">
              {d.rows.filter((r) => r.itemName || r.probe || r.priceRub).map((r, i) => (
                <li key={i} className="cpx-deal-row">
                  <span className="cpx-deal-row-name">
                    {r.itemName || 'Изделие'}
                    {r.probe ? ` · проба ${r.probe}` : ''}
                    {r.weightGross ? ` · ${r.weightGross} г` : ''}
                  </span>
                  {r.priceRub != null && <span className="cpx-deal-row-price">{formatMoney(r.priceRub)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

const CSS = `
.cpx-root {
  --cpx-bg: #0e1116;
  --cpx-panel: #ffffff;
  --cpx-ink: #1a1d23;
  --cpx-muted: #6b7280;
  --cpx-stroke: #e6e8ec;
  --cpx-accent: #b8893a;
  --cpx-accent-soft: rgba(184, 137, 58, 0.12);
  --cpx-gold: #a9772b;
  --cpx-emerald: #1e6b4f;
  position: relative;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(1200px 600px at 50% -10%, #1b2230 0%, #0e1116 60%);
  color: var(--cpx-ink);
  font-family: var(--font-ui, system-ui, sans-serif);
  overflow-x: hidden;
}
.cpx-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  pointer-events: none;
  z-index: 0;
}
.cpx-orb--a { top: -10%; left: -8%; width: 44vw; height: 44vw; max-width: 560px; max-height: 560px; background: radial-gradient(circle, rgba(184,137,58,0.35), transparent 65%); }
.cpx-orb--b { bottom: -14%; right: -10%; width: 40vw; height: 40vw; max-width: 520px; max-height: 520px; background: radial-gradient(circle, rgba(30,107,79,0.3), transparent 65%); }

.cpx-topbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
}
.cpx-brand {
  display: flex; align-items: center; gap: 10px;
  font-family: var(--font-display, serif);
  font-size: 1.15rem; font-weight: 700; letter-spacing: 0.04em;
  color: #fff;
}
.cpx-brand-mark {
  width: 38px; height: 38px; border-radius: 11px; background: #fff;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  box-shadow: 0 4px 18px rgba(0,0,0,0.3);
}
.cpx-brand-mark img { width: 100%; height: 100%; object-fit: contain; padding: 5px; box-sizing: border-box; }
.cpx-brand-pro { font-size: 0.72rem; font-weight: 600; color: var(--cpx-accent); letter-spacing: 0.12em; text-transform: uppercase; }
.cpx-logout {
  border: 1px solid rgba(255,255,255,0.25); background: rgba(255,255,255,0.06);
  color: #fff; border-radius: 9px; padding: 8px 14px; font-size: 0.82rem; font-weight: 600; cursor: pointer;
  transition: background 0.16s;
}
.cpx-logout:hover { background: rgba(255,255,255,0.14); }

.cpx-main {
  position: relative; z-index: 2;
  flex: 1; width: 100%; max-width: 720px; margin: 0 auto; padding: 8px 20px 28px;
}
.cpx-center { color: #fff; text-align: center; padding: 60px 0; display: flex; align-items: center; justify-content: center; gap: 10px; }

.cpx-card {
  background: var(--cpx-panel);
  border: 1px solid var(--cpx-stroke);
  border-radius: 18px;
  padding: 22px 20px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.18);
  margin-bottom: 14px;
}
.cpx-login { max-width: 440px; margin: 24px auto 0; }
.cpx-title { font-family: var(--font-display, serif); font-size: 1.55rem; font-weight: 700; margin: 0 0 8px; letter-spacing: -0.02em; }
.cpx-h2 { font-family: var(--font-display, serif); font-size: 1.25rem; font-weight: 700; margin: 0 0 6px; }
.cpx-sub { margin: 0 0 18px; font-size: 0.88rem; line-height: 1.5; color: var(--cpx-muted); }
.cpx-muted { color: var(--cpx-muted); font-size: 0.88rem; display: flex; align-items: center; gap: 8px; }

.cpx-form { display: flex; flex-direction: column; gap: 14px; }
.cpx-field { display: flex; flex-direction: column; gap: 6px; }
.cpx-field-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; color: var(--cpx-muted); }
.cpx-field input, .cpx-phone input {
  width: 100%; padding: 13px 14px; border-radius: 11px; border: 1px solid var(--cpx-stroke);
  font-size: 1rem; color: var(--cpx-ink); background: #fff; box-sizing: border-box; outline: none;
  transition: border-color 0.16s, box-shadow 0.16s;
}
.cpx-field input:focus, .cpx-phone input:focus { border-color: var(--cpx-accent); box-shadow: 0 0 0 3px var(--cpx-accent-soft); }
.cpx-phone { display: flex; align-items: stretch; gap: 8px; }
.cpx-phone-prefix {
  display: flex; align-items: center; padding: 0 14px; border-radius: 11px;
  border: 1px solid var(--cpx-stroke); background: #f6f7f9; font-weight: 700; color: var(--cpx-ink);
}
.cpx-phone input { flex: 1; min-width: 0; }
.cpx-code-input { letter-spacing: 0.5em; font-size: 1.4rem; text-align: center; font-weight: 700; }
.cpx-code-hint { margin: 0; font-size: 0.85rem; color: var(--cpx-muted); line-height: 1.5; }

.cpx-btn {
  margin-top: 4px; width: 100%; padding: 14px 18px; border: none; border-radius: 12px;
  background: linear-gradient(135deg, #c79544, #a9772b); color: #fff; font-size: 0.95rem; font-weight: 700;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
  box-shadow: 0 6px 22px rgba(169,119,43,0.35); transition: filter 0.16s, transform 0.14s;
}
.cpx-btn:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-1px); }
.cpx-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.cpx-code-actions { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
.cpx-link { background: none; border: none; color: var(--cpx-accent); font-size: 0.82rem; font-weight: 600; cursor: pointer; padding: 4px 0; }
.cpx-link:disabled { color: var(--cpx-muted); cursor: not-allowed; }
.cpx-link:hover:not(:disabled) { text-decoration: underline; }

.cpx-err { color: #d14343; font-size: 0.85rem; margin: 0; }

.cpx-tabs { display: flex; gap: 8px; margin-bottom: 14px; background: rgba(255,255,255,0.08); padding: 5px; border-radius: 13px; }
.cpx-tab {
  flex: 1; padding: 11px 14px; border: none; border-radius: 9px; background: transparent;
  color: rgba(255,255,255,0.75); font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: background 0.16s, color 0.16s;
}
.cpx-tab--on { background: #fff; color: var(--cpx-ink); box-shadow: 0 3px 12px rgba(0,0,0,0.2); }

.cpx-calc-fields { display: flex; flex-direction: column; gap: 14px; margin-bottom: 16px; }
.cpx-probes { display: flex; gap: 8px; flex-wrap: wrap; }
.cpx-probe {
  padding: 10px 16px; border-radius: 10px; border: 1px solid var(--cpx-stroke); background: #fff;
  color: var(--cpx-muted); font-size: 0.92rem; font-weight: 600; cursor: pointer; transition: all 0.15s;
}
.cpx-probe--on { background: var(--cpx-accent-soft); border-color: var(--cpx-accent); color: var(--cpx-gold); }

.cpx-result {
  text-align: center; padding: 22px 16px; border-radius: 14px;
  background: linear-gradient(135deg, rgba(184,137,58,0.1), rgba(184,137,58,0.04));
  border: 1px solid var(--cpx-accent-soft);
}
.cpx-result--empty { background: #f6f7f9; border-color: var(--cpx-stroke); }
.cpx-result-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--cpx-muted); font-weight: 700; }
.cpx-result-range { font-family: var(--font-display, serif); font-size: 1.7rem; font-weight: 700; color: var(--cpx-gold); margin: 8px 0 4px; line-height: 1.2; }
.cpx-dash { color: var(--cpx-muted); font-weight: 400; }
.cpx-result-mid { font-size: 0.82rem; color: var(--cpx-muted); }
.cpx-quote-meta { margin: 14px 0 0; font-size: 0.76rem; color: var(--cpx-muted); text-align: center; }

.cpx-deals-summary { display: flex; gap: 16px; }
.cpx-summary-item { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.cpx-summary-k { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--cpx-muted); font-weight: 700; }
.cpx-summary-v { font-size: 1.3rem; font-weight: 700; color: var(--cpx-ink); }
.cpx-summary-v--gold { color: var(--cpx-gold); }

.cpx-deal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.cpx-deal-no { font-weight: 700; font-size: 0.95rem; }
.cpx-deal-date { font-size: 0.8rem; color: var(--cpx-muted); margin-top: 2px; }
.cpx-deal-sum { font-weight: 700; font-size: 1.1rem; color: var(--cpx-gold); white-space: nowrap; }
.cpx-deal-rows { list-style: none; margin: 14px 0 0; padding: 14px 0 0; border-top: 1px solid var(--cpx-stroke); display: flex; flex-direction: column; gap: 8px; }
.cpx-deal-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 0.85rem; }
.cpx-deal-row-name { color: var(--cpx-ink); }
.cpx-deal-row-price { color: var(--cpx-muted); white-space: nowrap; }

.cpx-foot { position: relative; z-index: 2; text-align: center; padding: 18px; font-size: 0.72rem; color: rgba(255,255,255,0.5); }

.cpx-spinner {
  width: 1em; height: 1em; border-radius: 50%;
  border: 2px solid currentColor; border-top-color: transparent;
  display: inline-block; animation: cpxSpin 0.7s linear infinite; flex-shrink: 0;
}
@keyframes cpxSpin { to { transform: rotate(360deg); } }

@media (max-width: 480px) {
  .cpx-result-range { font-size: 1.4rem; }
  .cpx-result-range .cpx-dash { display: block; font-size: 0.95rem; margin: 2px 0; }
}
`;
