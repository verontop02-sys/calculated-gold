import { useCallback, useEffect, useMemo, useState } from 'react';
import { clientApi, getClientToken, setClientToken, fintechApi, getFintechToken } from './api.js';
import { FintechInvest } from './FintechInvest.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import { ClientSidebar } from './ClientSidebar.jsx';

const TAB_TITLES = { home: 'Личный кабинет', calc: 'Калькулятор', history: 'Мои сделки', invest: 'Инвестиции' };
const TAB_SUBTITLES = {
  home: 'Обзор сделок, инвестиций и безопасность входа',
  calc: 'Оценка золота по текущему биржевому курсу',
  history: 'История ваших сделок с Reaktivo',
  invest: 'Золотой счёт: покупка, портфель, аналитика',
};

function maskPhoneClient(normalized) {
  const d = String(normalized || '').replace(/\D/g, '');
  return d.length >= 4 ? `+7 ••• ••• ${d.slice(-4, -2)} ${d.slice(-2)}` : '';
}

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
  const [step, setStep] = useState('phone'); // 'phone' | 'pin' | 'code' | 'setpin'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [hasPin, setHasPin] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [phoneMasked, setPhoneMasked] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [phoneNormalized, setPhoneNormalized] = useState('');
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    try {
      const v = localStorage.getItem('cpx_sidebar_pinned');
      return v == null ? true : v === '1';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('cpx_sidebar_pinned', sidebarPinned ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sidebarPinned]);

  // Проверяем сохранённый токен.
  useEffect(() => {
    if (!getClientToken()) {
      setPhase('login');
      return;
    }
    clientApi
      .me()
      .then((out) => {
        setPhoneNormalized(out?.phoneNormalized || '');
        setHasPin(!!out?.hasPin);
        setPhase('authed');
      })
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

  // Шаг 1: телефон → узнаём способ входа. Есть PIN — просим его, нет — шлём SMS.
  async function submitPhone(e) {
    e?.preventDefault?.();
    setErr('');
    if (phoneDigits.length !== 10) {
      setErr('Введите номер телефона полностью');
      return;
    }
    setBusy(true);
    try {
      const m = await clientApi.loginMethod(`7${phoneDigits}`);
      setPhoneMasked(m.phoneMasked || '');
      setHasPin(!!m.hasPin);
      if (m.hasPin) {
        setStep('pin');
      } else {
        const out = await clientApi.requestCode(`7${phoneDigits}`);
        setPhoneMasked(out.phoneMasked || '');
        setStep('code');
        setResendIn(60);
      }
    } catch (e2) {
      setErr(e2?.message || 'Не удалось выполнить вход');
    } finally {
      setBusy(false);
    }
  }

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

  async function verifyPinLogin(e) {
    e?.preventDefault?.();
    setErr('');
    const p = pin.replace(/\D/g, '');
    if (p.length !== 6) {
      setErr('Введите 6 цифр PIN-кода');
      return;
    }
    setBusy(true);
    try {
      await clientApi.verifyPin(`7${phoneDigits}`, p);
      setPhoneNormalized(phoneDigits);
      setPin('');
      setPhase('authed');
    } catch (e2) {
      setErr(e2?.message || 'Неверный PIN-код');
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
      setPhoneNormalized(phoneDigits);
      setCode('');
      // Первый вход без PIN — предлагаем придумать его для быстрых последующих входов.
      if (!hasPin) {
        setStep('setpin');
      } else {
        setPhase('authed');
      }
    } catch (e2) {
      setErr(e2?.message || 'Неверный код');
    } finally {
      setBusy(false);
    }
  }

  async function submitCreatePin(e) {
    e?.preventDefault?.();
    setErr('');
    const p1 = newPin.replace(/\D/g, '');
    const p2 = newPin2.replace(/\D/g, '');
    if (p1.length !== 6) {
      setErr('PIN-код — ровно 6 цифр');
      return;
    }
    if (p1 !== p2) {
      setErr('PIN-коды не совпадают');
      return;
    }
    setBusy(true);
    try {
      await clientApi.setPin(p1);
      setHasPin(true);
      setNewPin('');
      setNewPin2('');
      setPhase('authed');
    } catch (e2) {
      setErr(e2?.message || 'Не удалось сохранить PIN-код');
    } finally {
      setBusy(false);
    }
  }

  const logout = useCallback(() => {
    setClientToken('');
    setPhase('login');
    setStep('phone');
    setPhone('');
    setCode('');
    setPin('');
    setNewPin('');
    setNewPin2('');
    setErr('');
    setPhoneMasked('');
  }, []);

  if (phase === 'authed') {
    return (
      <div className={`cpx-root cpx-shell${sidebarPinned ? ' cpx-shell--pinned' : ''}`}>
        <ClientSidebar
          tab={tab}
          onChange={setTab}
          phoneMasked={maskPhoneClient(phoneNormalized)}
          onOpenCabinet={() => setTab('home')}
          onSignOut={logout}
          pinned={sidebarPinned}
          onPinnedChange={setSidebarPinned}
        />

        <div className="cpx-shell__main">
          <header className="cpx-topbar cpx-topbar--shell">
            <div className="cpx-topbar__title">
              <h1 className="cpx-topbar__heading">{TAB_TITLES[tab] || 'Кабинет'}</h1>
              <p className="cpx-topbar__sub">{TAB_SUBTITLES[tab] || ''}</p>
            </div>
            <div className="cpx-topbar-actions">
              <ThemeToggle />
              <button type="button" className="cpx-logout" onClick={logout}>
                Выйти
              </button>
            </div>
          </header>

          <main className={`cpx-shell__content${tab === 'invest' || tab === 'home' ? ' cpx-shell__content--wide' : ''}`}>
            {tab === 'home' && (
              <ClientHome
                hasPin={hasPin}
                onPinChanged={() => setHasPin(true)}
                phoneMasked={maskPhoneClient(phoneNormalized)}
                onNavigate={setTab}
              />
            )}
            {tab === 'calc' && <ClientCalculator />}
            {tab === 'history' && <ClientDeals onAuthExpired={logout} />}
            {tab === 'invest' && <FintechInvest clientToken={getClientToken()} />}
          </main>

          <nav className="cpx-mobile-tabs" aria-label="Разделы">
            <button type="button" className={`cpx-mobile-tab${tab === 'home' ? ' cpx-mobile-tab--on' : ''}`} onClick={() => setTab('home')}>Кабинет</button>
            <button type="button" className={`cpx-mobile-tab${tab === 'calc' ? ' cpx-mobile-tab--on' : ''}`} onClick={() => setTab('calc')}>Калькулятор</button>
            <button type="button" className={`cpx-mobile-tab${tab === 'history' ? ' cpx-mobile-tab--on' : ''}`} onClick={() => setTab('history')}>Сделки</button>
            <button type="button" className={`cpx-mobile-tab${tab === 'invest' ? ' cpx-mobile-tab--on' : ''}`} onClick={() => setTab('invest')}>Инвестиции</button>
          </nav>
        </div>

        <style>{CSS}</style>
      </div>
    );
  }

  return (
    <div className="cpx-root">
      <div className="cpx-orb cpx-orb--a" aria-hidden />
      <div className="cpx-orb cpx-orb--b" aria-hidden />

      <header className="cpx-topbar">
        <a className="cpx-brand" href="/" title="На главную страницу" style={{ textDecoration: 'none' }}>
          <span className="cpx-brand-mark">
            <img src="/logo-reaktivo-mark.svg" alt="" />
          </span>
          Reaktivo <span className="cpx-brand-pro">кабинет</span>
        </a>
        <div className="cpx-topbar-actions">
          <a className="cpx-logout" href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>← На главную</a>
          <ThemeToggle />
        </div>
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
              {step === 'pin'
                ? 'Быстрый вход по PIN-коду, который вы установили.'
                : step === 'setpin'
                  ? 'Последний шаг: придумайте PIN-код для быстрого входа.'
                  : 'Вход по номеру телефона. Первый раз подтвердим его SMS-кодом, дальше — быстрый вход по PIN.'}
            </p>

            {step === 'phone' && (
              <form onSubmit={submitPhone} className="cpx-form">
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
                  {busy ? <><span className="cpx-spinner" /> Проверяем…</> : 'Продолжить'}
                </button>
              </form>
            )}

            {step === 'pin' && (
              <form onSubmit={verifyPinLogin} className="cpx-form">
                <p className="cpx-code-hint">Номер {phoneMasked || 'подтверждён'}. Введите ваш PIN-код.</p>
                <label className="cpx-field">
                  <span className="cpx-field-label">PIN-код</span>
                  <input
                    className="cpx-code-input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="current-password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    autoFocus
                  />
                </label>
                {err && <p className="cpx-err">{err}</p>}
                <button type="submit" className="cpx-btn" disabled={busy}>
                  {busy ? <><span className="cpx-spinner" /> Входим…</> : 'Войти'}
                </button>
                <div className="cpx-code-actions">
                  <button
                    type="button"
                    className="cpx-link"
                    onClick={() => { setStep('phone'); setPin(''); setErr(''); }}
                  >
                    Изменить номер
                  </button>
                  <button type="button" className="cpx-link" disabled={busy} onClick={requestCode}>
                    Забыли PIN? Войти по SMS
                  </button>
                </div>
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

            {step === 'setpin' && (
              <form onSubmit={submitCreatePin} className="cpx-form">
                <p className="cpx-code-hint">
                  6 цифр — как на банковской карте. Понадобится при каждом следующем входе; сменить можно в настройках кабинета.
                </p>
                <label className="cpx-field">
                  <span className="cpx-field-label">Придумайте PIN-код</span>
                  <input
                    className="cpx-code-input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    autoFocus
                  />
                </label>
                <label className="cpx-field">
                  <span className="cpx-field-label">Повторите PIN-код</span>
                  <input
                    className="cpx-code-input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    value={newPin2}
                    onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                  />
                </label>
                {err && <p className="cpx-err">{err}</p>}
                <button type="submit" className="cpx-btn" disabled={busy}>
                  {busy ? <><span className="cpx-spinner" /> Сохраняем…</> : 'Сохранить и войти'}
                </button>
                <div className="cpx-code-actions">
                  <button type="button" className="cpx-link" onClick={() => setPhase('authed')}>
                    Пропустить — установлю позже
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </main>

      <footer className="cpx-foot">© {new Date().getFullYear()} REAKTIVO · оценка и выкуп золота</footer>

      <style>{CSS}</style>
    </div>
  );
}

/** Обзор личного кабинета: статистика сделок/инвестиций + PIN + быстрые переходы. */
function formatGramsHome(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `${Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 4 })} г`;
}

function ClientHome({ hasPin, onPinChanged, phoneMasked, onNavigate }) {
  const [dealsSummary, setDealsSummary] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [fintechStatus, setFintechStatus] = useState(null); // null | 'none' | status string
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const dealsP = clientApi.deals().catch(() => null);
        let fintechP = Promise.resolve(null);
        try {
          if (!getFintechToken() && getClientToken()) {
            await fintechApi.sessionFromClient(getClientToken());
          }
          if (getFintechToken()) {
            fintechP = Promise.all([
              fintechApi.profile().catch(() => null),
              fintechApi.portfolio().catch(() => null),
            ]).then(([me, p]) => ({ me, portfolio: p }));
          }
        } catch {
          fintechP = Promise.resolve(null);
        }

        const [deals, fin] = await Promise.all([dealsP, fintechP]);
        if (cancelled) return;
        setDealsSummary(deals);
        if (fin?.me) {
          setFintechStatus(fin.me.status || 'none');
          setPortfolio(fin.portfolio);
        } else {
          setFintechStatus('none');
          setPortfolio(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const recentDeals = (dealsSummary?.deals || []).slice(0, 5);
  const investLabel = fintechStatus === 'approved'
    ? 'Инвестиции активны'
    : fintechStatus === 'pending_review'
      ? 'Заявка на проверке'
      : fintechStatus === 'rejected'
        ? 'Нужна повторная отправка'
        : 'Ещё не подключены';

  return (
    <div className="cpx-home">
      <div className="cpx-home-hero cpx-card">
        <div className="cpx-home-hero-main">
          <span className="cpx-home-avatar" aria-hidden>К</span>
          <div>
            <h2 className="cpx-home-title">Личный кабинет</h2>
            <p className="cpx-home-sub">
              {phoneMasked || '—'} · вход: {hasPin ? 'PIN-код' : 'SMS-код'}
            </p>
          </div>
        </div>
        <div className="cpx-home-hero-actions">
          <button type="button" className="cpx-fin-pdf-btn" onClick={() => onNavigate?.('calc')}>Калькулятор</button>
          <button type="button" className="cpx-fin-pdf-btn" onClick={() => onNavigate?.('invest')}>Инвестиции</button>
        </div>
      </div>

      {loading ? (
        <div className="cpx-card cpx-muted"><span className="cpx-spinner" /> Загружаем сводку…</div>
      ) : (
        <div className="cpx-home-kpis">
          <button type="button" className="cpx-home-kpi" onClick={() => onNavigate?.('history')}>
            <span className="cpx-home-kpi-label">Сделки скупки</span>
            <span className="cpx-home-kpi-value">{dealsSummary?.dealsCount ?? 0}</span>
            <span className="cpx-home-kpi-meta">Перейти к истории →</span>
          </button>
          <button type="button" className="cpx-home-kpi" onClick={() => onNavigate?.('history')}>
            <span className="cpx-home-kpi-label">Сумма сделок</span>
            <span className="cpx-home-kpi-value">{formatMoney(dealsSummary?.totalRub)}</span>
            <span className="cpx-home-kpi-meta">По вашему номеру</span>
          </button>
          <button type="button" className="cpx-home-kpi cpx-home-kpi--accent" onClick={() => onNavigate?.('invest')}>
            <span className="cpx-home-kpi-label">Золото на счёте</span>
            <span className="cpx-home-kpi-value">{formatGramsHome(portfolio?.goldGrams)}</span>
            <span className="cpx-home-kpi-meta">{investLabel}</span>
          </button>
          <button type="button" className="cpx-home-kpi" onClick={() => onNavigate?.('invest')}>
            <span className="cpx-home-kpi-label">Стоимость портфеля</span>
            <span className="cpx-home-kpi-value">{formatMoney(portfolio?.marketValueRub)}</span>
            <span className="cpx-home-kpi-meta">
              {portfolio?.pnlPercent != null
                ? `Доход ${portfolio.pnlPercent > 0 ? '+' : ''}${portfolio.pnlPercent}%`
                : 'Открыть инвестиции →'}
            </span>
          </button>
          <button type="button" className="cpx-home-kpi" onClick={() => onNavigate?.('invest')}>
            <span className="cpx-home-kpi-label">Рублёвый баланс</span>
            <span className="cpx-home-kpi-value">{formatMoney(portfolio?.rubBalance)}</span>
            <span className="cpx-home-kpi-meta">Доступно к покупке</span>
          </button>
        </div>
      )}

      <div className="cpx-home-grid">
        <div className="cpx-card">
          <div className="cpx-home-section-head">
            <h3 className="cpx-home-section-title">Последние сделки</h3>
            <button type="button" className="cpx-link" onClick={() => onNavigate?.('history')}>Все сделки</button>
          </div>
          {!recentDeals.length && (
            <p className="cpx-muted" style={{ margin: 0 }}>Сделок по номеру пока нет — можно пользоваться калькулятором и инвестициями.</p>
          )}
          {recentDeals.map((d) => (
            <div key={d.id} className="cpx-home-deal-row">
              <div>
                <div className="cpx-home-deal-title">{d.contractNo ? `Договор ${d.contractNo}` : 'Сделка'}</div>
                <div className="cpx-home-deal-date">{formatDate(d.createdAt)}</div>
              </div>
              <div className="cpx-home-deal-sum">{formatMoney(d.totalRub)}</div>
            </div>
          ))}
        </div>

        <div className="cpx-card">
          <div className="cpx-home-section-head">
            <h3 className="cpx-home-section-title">Разделы кабинета</h3>
          </div>
          <div className="cpx-home-nav">
            <button type="button" className="cpx-home-nav-item" onClick={() => onNavigate?.('calc')}>
              <span className="cpx-home-nav-title">Калькулятор</span>
              <span className="cpx-home-nav-desc">Оценка лома по биржевому курсу</span>
            </button>
            <button type="button" className="cpx-home-nav-item" onClick={() => onNavigate?.('history')}>
              <span className="cpx-home-nav-title">Мои сделки</span>
              <span className="cpx-home-nav-desc">{dealsSummary?.dealsCount ? `${dealsSummary.dealsCount} записей` : 'История скупки'}</span>
            </button>
            <button type="button" className="cpx-home-nav-item" onClick={() => onNavigate?.('invest')}>
              <span className="cpx-home-nav-title">Инвестиции</span>
              <span className="cpx-home-nav-desc">{investLabel}</span>
            </button>
          </div>
        </div>
      </div>

      <ClientPinForm hasPin={hasPin} onPinChanged={onPinChanged} phoneMasked={phoneMasked} />
    </div>
  );
}

/** Форма PIN внутри обзора кабинета. */
function ClientPinForm({ hasPin, onPinChanged, phoneMasked }) {
  const [currentPin, setCurrentPin] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setOk('');
    const d1 = p1.replace(/\D/g, '');
    const d2 = p2.replace(/\D/g, '');
    if (d1.length !== 6) { setErr('PIN-код — ровно 6 цифр'); return; }
    if (d1 !== d2) { setErr('PIN-коды не совпадают'); return; }
    if (hasPin && currentPin.replace(/\D/g, '').length !== 6) { setErr('Введите текущий PIN-код'); return; }
    setBusy(true);
    try {
      await clientApi.setPin(d1, hasPin ? currentPin.replace(/\D/g, '') : undefined);
      setOk(hasPin ? 'PIN-код обновлён' : 'PIN-код установлен — теперь вход будет быстрым');
      setCurrentPin('');
      setP1('');
      setP2('');
      onPinChanged?.();
    } catch (e2) {
      setErr(e2?.message || 'Не удалось сохранить PIN-код');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cpx-card cpx-home-pin" style={{ maxWidth: 520 }}>
      <h3 className="cpx-home-section-title">{hasPin ? 'Сменить PIN-код' : 'Установить PIN-код'}</h3>
      <p className="cpx-sub">
        Номер {phoneMasked || '—'} · {hasPin ? 'PIN уже установлен' : 'пока вход только по SMS'}.
        Если забудете PIN — войдите по SMS.
      </p>
      <form onSubmit={submit} className="cpx-form">
        {hasPin && (
          <label className="cpx-field">
            <span className="cpx-field-label">Текущий PIN-код</span>
            <input
              className="cpx-code-input"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
            />
          </label>
        )}
        <label className="cpx-field">
          <span className="cpx-field-label">Новый PIN-код</span>
          <input
            className="cpx-code-input"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={p1}
            onChange={(e) => setP1(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
          />
        </label>
        <label className="cpx-field">
          <span className="cpx-field-label">Повторите новый PIN-код</span>
          <input
            className="cpx-code-input"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={p2}
            onChange={(e) => setP2(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
          />
        </label>
        {err && <p className="cpx-err">{err}</p>}
        {ok && <p className="cpx-fin-ok">{ok}</p>}
        <button type="submit" className="cpx-btn" disabled={busy} style={{ maxWidth: 280 }}>
          {busy ? <><span className="cpx-spinner" /> Сохраняем…</> : 'Сохранить PIN-код'}
        </button>
      </form>
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
/* Палитра кабинета клиента алиасится на общие токены REAKTIVO PRO (index.css) —
   те же переменные, что использует админ-панель, поэтому цвета совпадают 1 в 1
   и переключаются вместе со светлой/тёмной темой (data-theme на <html>). */
.cpx-root {
  --cpx-bg: var(--bg-deep);
  --cpx-panel: var(--bg-panel-solid);
  --cpx-ink: var(--text);
  --cpx-muted: var(--text-muted);
  --cpx-stroke: var(--stroke);
  --cpx-accent: var(--accent);
  --cpx-accent-soft: var(--accent-soft);
  --cpx-gold: var(--accent);
  --cpx-emerald: var(--emerald);
  position: relative;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg-gradient), var(--bg-deep);
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
.cpx-orb--a { top: -10%; left: -8%; width: 44vw; height: 44vw; max-width: 560px; max-height: 560px; background: radial-gradient(circle, var(--accent-glow), transparent 65%); }
.cpx-orb--b { bottom: -14%; right: -10%; width: 40vw; height: 40vw; max-width: 520px; max-height: 520px; background: radial-gradient(circle, var(--emerald-soft), transparent 65%); }

/* ── Shell-раскладка авторизованного кабинета: сайдбар + топбар + контент,
   1 в 1 повторяет структуру и переменные админ-панели (App.jsx cg-shell). ── */
.cpx-shell { display: block; background: var(--bg-gradient), var(--bg-deep); background-attachment: fixed; }
.cpx-shell__main {
  padding-left: 0;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  transition: padding-left 0.26s cubic-bezier(0.4, 0.2, 0.2, 1);
}
.cpx-shell--pinned .cpx-shell__main { padding-left: 240px; }
@media (max-width: 900px) { .cpx-shell__main { padding-left: 0 !important; } }

/* Shell-топбар — как cg-topbar в админке: на всю ширину, без «карточки».
   Правила стоят ПОСЛЕ .cpx-topbar ниже по файлу через повторный блок. */
.cpx-topbar__title { min-width: 0; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.cpx-topbar__heading { font-size: 0.95rem; font-weight: 600; margin: 0; color: var(--text-strong); letter-spacing: -0.01em; white-space: nowrap; }
.cpx-topbar__sub { margin: 0; font-size: 0.78rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.cpx-shell__content {
  flex: 1;
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
  padding: 22px 24px 90px;
  box-sizing: border-box;
}
/* «Инвестиции» — полноценный ПК-дашборд на всю рабочую ширину. */
.cpx-shell__content--wide {
  max-width: none;
  padding: 18px 28px 48px;
}
@media (max-width: 900px) {
  .cpx-shell__content { padding: 16px 16px 84px; }
  .cpx-shell__content--wide { padding: 16px 16px 84px; }
}

/* ── ПК-раскладка дашборда инвестиций ── */
.cpx-finx { max-width: 1520px; margin: 0 auto; width: 100%; }
.cpx-fin-greeting { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
.cpx-fin-greeting-title { font-family: var(--font-display, serif); font-size: 1.35rem; font-weight: 700; margin: 0; color: var(--text-strong); letter-spacing: -0.02em; }
.cpx-fin-greeting-sub { margin: 3px 0 0; font-size: 0.8rem; color: var(--text-dim); }
.cpx-fin-pdf-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: 9px;
  border: 1px solid var(--stroke); background: var(--bg-panel-solid);
  color: var(--text); font-size: 0.8rem; font-weight: 600; cursor: pointer;
  transition: border-color 0.16s, color 0.16s, background 0.16s;
}
.cpx-fin-pdf-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.cpx-fin-pdf-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.cpx-fin-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
  align-items: start;
  margin-bottom: 14px;
}
.cpx-fin-layout--lower { margin-bottom: 0; }
.cpx-fin-main { min-width: 0; display: flex; flex-direction: column; gap: 0; }
.cpx-fin-side { display: flex; flex-direction: column; gap: 0; min-width: 0; }
.cpx-fin-side-title { font-size: 1rem; font-weight: 700; margin: 0 0 4px; color: var(--text-strong); letter-spacing: -0.01em; }
.cpx-fin-side-sub { margin: 0 0 12px; font-size: 0.78rem; color: var(--text-dim); line-height: 1.4; }
.cpx-fin-buy-form { gap: 10px; }
.cpx-fin-buy-form .cpx-btn { margin-top: 2px; padding: 12px 16px; font-size: 0.88rem; border-radius: 10px; }
@media (max-width: 1180px) {
  .cpx-fin-layout { grid-template-columns: 1fr; }
}

.cpx-fin-chart-card { padding: 16px 18px; }
.cpx-fin-chart-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 6px; flex-wrap: wrap; }
.cpx-fin-chart-titles { display: flex; flex-direction: column; gap: 4px; }
.cpx-fin-chart-rate { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.cpx-fin-chart-price { font-size: 1.45rem; font-weight: 700; color: var(--text-strong); letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.cpx-fin-chart-per { font-size: 0.82rem; font-weight: 500; color: var(--text-muted); }
.cpx-fin-chart-delta { font-size: 0.8rem; font-weight: 700; }
.cpx-fin-chart-upd { font-size: 0.7rem; color: var(--text-dim); }
.cpx-fin-chart-body { margin: 2px -4px 0; }

.cpx-fin-range { display: flex; gap: 3px; background: var(--surface); border: 1px solid var(--stroke-soft); padding: 3px; border-radius: 9px; height: fit-content; }
.cpx-fin-range-btn {
  padding: 5px 10px; border: none; border-radius: 6px; background: transparent;
  color: var(--text-muted); font-size: 0.72rem; font-weight: 700; cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.cpx-fin-range-btn--on { background: var(--accent); color: #fff; }

.cpx-fin-buy-card { border-color: var(--stroke); }
.cpx-fin-history-card { padding: 14px 16px; }
.cpx-fin-ledger-list { display: flex; flex-direction: column; max-height: 420px; overflow: auto; margin: 8px -4px 0; padding: 0 4px; }

/* ── AI-ассистент (desktop, компактно) ── */
.cpx-fin-ai-card { padding: 16px 18px; border-color: var(--stroke); overflow: hidden; }
.cpx-fin-ai-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.cpx-fin-ai-title-wrap { display: flex; align-items: center; gap: 8px; min-width: 0; }
.cpx-fin-ai-heading { margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--text-strong); letter-spacing: -0.01em; }
.cpx-fin-ai-icon {
  width: 28px; height: 28px; border-radius: 8px;
  background: var(--accent-soft); color: var(--accent);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.cpx-fin-ai-badge {
  font-size: 0.6rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 2px 7px; border-radius: 999px;
  background: var(--stroke); color: var(--text-muted);
}
.cpx-fin-ai-badge--grok { background: var(--accent-soft); color: var(--accent); }
.cpx-fin-ai-answer {
  white-space: pre-wrap; font-size: 0.84rem; line-height: 1.55; color: var(--cpx-ink);
  background: var(--surface); border: 1px solid var(--stroke-soft); border-radius: 10px;
  padding: 11px 13px; margin-bottom: 12px; max-height: 160px; overflow: auto;
  transition: opacity 0.2s;
}
.cpx-fin-ai-answer--busy { opacity: 0.55; }
.cpx-fin-ai-forecast { margin-bottom: 12px; }
.cpx-fin-ai-forecast-title {
  font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--text-muted); margin-bottom: 8px;
}
.cpx-fin-ai-scenarios {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
@media (max-width: 720px) {
  .cpx-fin-ai-scenarios { grid-template-columns: 1fr; }
}
.cpx-fin-ai-scenario {
  background: var(--surface);
  border: 1px solid var(--stroke-soft);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 4px; min-width: 0;
}
.cpx-fin-ai-scenario--accent { border-color: var(--accent-soft); background: color-mix(in srgb, var(--accent-soft) 55%, var(--surface)); }
.cpx-fin-ai-scenario-label { font-size: 0.72rem; color: var(--text-muted); line-height: 1.35; }
.cpx-fin-ai-scenario-value { font-size: 1.05rem; font-weight: 700; color: var(--text-strong); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.cpx-fin-ai-scenario-meta { font-size: 0.68rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Важно: не наследовать .cpx-btn { width:100% } — иначе кнопка вылезает из карточки. */
.cpx-fin-ai-ask {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
}
.cpx-fin-ai-ask input {
  flex: 1 1 auto;
  min-width: 0;
  width: auto;
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--cpx-stroke);
  font-size: 0.84rem;
  color: var(--cpx-ink);
  background: var(--input-bg);
  outline: none;
  box-sizing: border-box;
}
.cpx-fin-ai-ask input:focus { border-color: var(--cpx-accent); box-shadow: 0 0 0 3px var(--cpx-accent-soft); }
.cpx-fin-ai-ask-btn {
  flex: 0 0 auto;
  width: auto !important;
  max-width: none;
  margin: 0 !important;
  height: 40px;
  padding: 0 16px;
  border: none;
  border-radius: 10px;
  background: var(--accent-grad);
  color: #fff;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: none;
  transform: none;
}
.cpx-fin-ai-ask-btn:hover:not(:disabled) { filter: brightness(1.05); }
.cpx-fin-ai-ask-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.cpx-fin-ai-disclaimer { margin: 8px 0 0; font-size: 0.68rem; color: var(--text-dim); line-height: 1.4; }

.cpx-mobile-tabs {
  display: none;
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 40;
  background: var(--bg-panel-solid);
  border-top: 1px solid var(--stroke-soft);
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
  gap: 6px;
}
@media (max-width: 900px) { .cpx-mobile-tabs { display: flex; } }
.cpx-mobile-tab {
  flex: 1;
  padding: 10px 6px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.cpx-mobile-tab--on { background: var(--accent-soft); color: var(--accent); }

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
/* Авторизованный кабинет: топбар на всю ширину main, как в админке — не плашка 720px. */
.cpx-shell .cpx-topbar--shell {
  max-width: none;
  width: auto;
  margin: 0;
  justify-content: space-between;
  padding: 0 24px;
  height: 60px;
  border-bottom: 1px solid var(--stroke-soft);
  background: color-mix(in srgb, var(--bg-panel-solid) 72%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 30;
  box-sizing: border-box;
}
.cpx-shell .cpx-topbar--shell .cpx-logout {
  border: 1px solid var(--stroke-soft);
  background: transparent;
  color: var(--text-muted);
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 0.8rem;
  font-weight: 600;
}
.cpx-shell .cpx-topbar--shell .cpx-logout:hover {
  color: var(--text);
  background: var(--bg-elevated);
  border-color: var(--stroke);
}
.cpx-brand {
  display: flex; align-items: center; gap: 10px;
  font-family: var(--font-display, serif);
  font-size: 1.15rem; font-weight: 700; letter-spacing: 0.04em;
  color: var(--text-strong);
}
.cpx-brand-mark {
  width: 38px; height: 38px; border-radius: 10px; background: transparent;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  box-shadow: 0 4px 18px var(--accent-glow);
}
.cpx-brand-mark img { width: 100%; height: 100%; object-fit: cover; box-sizing: border-box; }
.cpx-brand-pro { font-size: 0.72rem; font-weight: 600; color: var(--cpx-accent); letter-spacing: 0.12em; text-transform: uppercase; }
.cpx-topbar-actions { display: flex; align-items: center; gap: 10px; }
.cpx-logout {
  border: 1px solid var(--stroke-strong); background: var(--stroke);
  color: var(--text-strong); border-radius: 9px; padding: 8px 14px; font-size: 0.82rem; font-weight: 600; cursor: pointer;
  transition: background 0.16s;
}
.cpx-logout:hover { background: var(--stroke-strong); }

.cpx-main {
  position: relative; z-index: 2;
  flex: 1; width: 100%; max-width: 720px; margin: 0 auto; padding: 8px 20px 28px;
}
.cpx-center { color: var(--text-strong); text-align: center; padding: 60px 0; display: flex; align-items: center; justify-content: center; gap: 10px; }

.cpx-card {
  background: var(--cpx-panel);
  border: 1px solid var(--cpx-stroke);
  border-radius: 18px;
  padding: 22px 20px;
  box-shadow: var(--shadow-card);
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
  font-size: 1rem; color: var(--cpx-ink); background: var(--input-bg); box-sizing: border-box; outline: none;
  transition: border-color 0.16s, box-shadow 0.16s;
}
.cpx-field input::placeholder, .cpx-phone input::placeholder { color: var(--text-dim); }
.cpx-field input:focus, .cpx-phone input:focus { border-color: var(--cpx-accent); box-shadow: 0 0 0 3px var(--cpx-accent-soft); }
.cpx-phone { display: flex; align-items: stretch; gap: 8px; }
.cpx-phone-prefix {
  display: flex; align-items: center; padding: 0 14px; border-radius: 11px;
  border: 1px solid var(--cpx-stroke); background: var(--surface); font-weight: 700; color: var(--cpx-ink);
}
.cpx-phone input { flex: 1; min-width: 0; }
.cpx-code-input { letter-spacing: 0.5em; font-size: 1.4rem; text-align: center; font-weight: 700; }
.cpx-code-hint { margin: 0; font-size: 0.85rem; color: var(--cpx-muted); line-height: 1.5; }

.cpx-btn {
  margin-top: 4px; width: 100%; padding: 14px 18px; border: none; border-radius: 12px;
  background: var(--accent-grad); color: #fff; font-size: 0.95rem; font-weight: 700;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
  box-shadow: 0 6px 22px var(--accent-glow); transition: filter 0.16s, transform 0.14s;
}
.cpx-btn:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-1px); }
.cpx-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.cpx-code-actions { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
.cpx-link { background: none; border: none; color: var(--cpx-accent); font-size: 0.82rem; font-weight: 600; cursor: pointer; padding: 4px 0; }
.cpx-link:disabled { color: var(--cpx-muted); cursor: not-allowed; }
.cpx-link:hover:not(:disabled) { text-decoration: underline; }

.cpx-err { color: var(--crimson); font-size: 0.85rem; margin: 0; }

.cpx-calc-fields { display: flex; flex-direction: column; gap: 14px; margin-bottom: 16px; }
.cpx-probes { display: flex; gap: 8px; flex-wrap: wrap; }
.cpx-probe {
  padding: 10px 16px; border-radius: 10px; border: 1px solid var(--cpx-stroke); background: var(--cpx-panel);
  color: var(--cpx-muted); font-size: 0.92rem; font-weight: 600; cursor: pointer; transition: all 0.15s;
}
.cpx-probe--on { background: var(--cpx-accent-soft); border-color: var(--cpx-accent); color: var(--cpx-gold); }

.cpx-result {
  text-align: center; padding: 22px 16px; border-radius: 14px;
  background: var(--cpx-accent-soft);
  border: 1px solid var(--cpx-accent-soft);
}
.cpx-result--empty { background: var(--surface); border-color: var(--cpx-stroke); }
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

.cpx-foot { position: relative; z-index: 2; text-align: center; padding: 18px; font-size: 0.72rem; color: var(--text-dim); }

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

/* ── Инвестиции (fintech-кабинет): расширения общего дизайна кабинета ───── */
.cpx-fin-banner { border-color: var(--crimson-soft); background: linear-gradient(135deg, var(--crimson-soft), transparent); }
.cpx-fin-banner-title { font-weight: 700; color: var(--crimson); display: block; margin-bottom: 4px; }

.cpx-fin-form-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.cpx-fin-form-row .cpx-field { flex: 1; min-width: 160px; }

.cpx-fin-docs { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.cpx-fin-doc-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 14px; border-radius: 12px; border: 1px solid var(--cpx-stroke); flex-wrap: wrap; }
.cpx-fin-doc-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.cpx-fin-doc-label { font-size: 0.88rem; font-weight: 600; color: var(--cpx-ink); }
.cpx-fin-doc-reason { font-size: 0.78rem; color: var(--crimson); }
.cpx-fin-badge { font-size: 0.7rem; font-weight: 700; padding: 3px 9px; border-radius: 999px; width: fit-content; }
.cpx-fin-badge--pending { background: rgba(251, 191, 36, 0.16); color: var(--warn-dot); }
.cpx-fin-badge--approved { background: var(--emerald-soft); color: var(--cpx-emerald); }
.cpx-fin-badge--rejected { background: var(--crimson-soft); color: var(--crimson); }
.cpx-fin-doc-btn {
  padding: 10px 14px; border-radius: 10px; border: 1px solid var(--cpx-accent); background: transparent;
  color: var(--cpx-gold); font-weight: 700; font-size: 0.82rem; cursor: pointer; display: flex; align-items: center; gap: 6px;
}
.cpx-fin-doc-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.cpx-fin-hint { font-size: 0.8rem; color: var(--cpx-muted); margin-top: 10px; text-align: center; }

.cpx-fin-pending-icon { color: var(--cpx-accent); margin-bottom: 6px; }
.cpx-fin-doc-status-list { width: 100%; display: flex; flex-direction: column; gap: 8px; margin: 14px 0; }
.cpx-fin-doc-status-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; padding: 9px 12px; border-radius: 10px; background: var(--surface); }

.cpx-fin-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
@media (max-width: 1100px) { .cpx-fin-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 640px) { .cpx-fin-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.cpx-fin-kpi { background: var(--cpx-panel); border: 1px solid var(--cpx-stroke); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
.cpx-fin-kpi--hero { background: linear-gradient(135deg, var(--cpx-accent-soft), transparent); border-color: var(--cpx-accent-soft); }
.cpx-fin-kpi--pos .cpx-fin-kpi-value { color: var(--cpx-emerald); }
.cpx-fin-kpi--neg .cpx-fin-kpi-value { color: var(--crimson); }
.cpx-fin-kpi-label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cpx-muted); font-weight: 700; }
.cpx-fin-kpi-value { font-size: 1.02rem; font-weight: 700; color: var(--cpx-ink); font-variant-numeric: tabular-nums; }
.cpx-fin-kpi-pct { font-size: 0.72rem; font-weight: 600; }

.cpx-fin-topup-hint { display: flex; align-items: flex-start; gap: 10px; background: var(--surface); border-color: var(--stroke-soft); }
.cpx-fin-topup-icon { color: var(--text-muted); font-weight: 700; flex-shrink: 0; }
.cpx-fin-topup-hint p { margin: 0; font-size: 0.78rem; color: var(--text-muted); line-height: 1.45; }

.cpx-fin-mode-switch { display: flex; gap: 8px; background: var(--surface); padding: 4px; border-radius: 11px; }
.cpx-fin-mode-btn { flex: 1; padding: 10px 12px; border: none; border-radius: 8px; background: transparent; color: var(--cpx-muted); font-weight: 600; font-size: 0.85rem; cursor: pointer; }
.cpx-fin-mode-btn--on { background: var(--cpx-panel); color: var(--cpx-ink); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.cpx-fin-estimate { margin: 0; font-size: 0.85rem; font-weight: 600; color: var(--cpx-gold); }
.cpx-fin-ok { color: var(--cpx-emerald); font-size: 0.85rem; margin: 0; font-weight: 600; }

.cpx-fin-history-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; gap: 10px; flex-wrap: wrap; }
.cpx-fin-history-head .cpx-h2 { margin: 0; }
.cpx-fin-ledger-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--stroke-soft); font-size: 0.82rem; gap: 10px; }
.cpx-fin-ledger-row:last-child { border-bottom: none; }
.cpx-fin-ledger-main { display: flex; flex-direction: column; gap: 2px; }
.cpx-fin-ledger-type { font-weight: 600; color: var(--cpx-ink); }
.cpx-fin-ledger-date { font-size: 0.75rem; color: var(--cpx-muted); }
.cpx-fin-ledger-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }

/* ── Обзор «Личный кабинет» ── */
.cpx-home { max-width: 1280px; margin: 0 auto; width: 100%; }
.cpx-home-hero {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  padding: 16px 18px; margin-bottom: 14px;
}
.cpx-home-hero-main { display: flex; align-items: center; gap: 14px; min-width: 0; }
.cpx-home-avatar {
  width: 48px; height: 48px; border-radius: 50%;
  background: var(--accent-soft); color: var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 1.1rem; flex-shrink: 0;
}
.cpx-home-title { margin: 0; font-size: 1.15rem; font-weight: 700; color: var(--text-strong); letter-spacing: -0.02em; }
.cpx-home-sub { margin: 3px 0 0; font-size: 0.82rem; color: var(--text-dim); }
.cpx-home-hero-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.cpx-home-kpis {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
@media (max-width: 1100px) { .cpx-home-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 640px) { .cpx-home-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.cpx-home-kpi {
  text-align: left;
  background: var(--cpx-panel);
  border: 1px solid var(--cpx-stroke);
  border-radius: 12px;
  padding: 14px 15px;
  cursor: pointer;
  display: flex; flex-direction: column; gap: 4px;
  transition: border-color 0.15s, background 0.15s;
}
.cpx-home-kpi:hover { border-color: var(--accent); background: color-mix(in srgb, var(--accent-soft) 40%, var(--cpx-panel)); }
.cpx-home-kpi--accent { border-color: var(--accent-soft); background: linear-gradient(135deg, var(--accent-soft), transparent); }
.cpx-home-kpi-label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cpx-muted); font-weight: 700; }
.cpx-home-kpi-value { font-size: 1.05rem; font-weight: 700; color: var(--cpx-ink); font-variant-numeric: tabular-nums; }
.cpx-home-kpi-meta { font-size: 0.72rem; color: var(--text-dim); margin-top: 2px; }

.cpx-home-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 14px;
  margin-bottom: 14px;
}
@media (max-width: 900px) { .cpx-home-grid { grid-template-columns: 1fr; } }
.cpx-home-section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.cpx-home-section-title { margin: 0 0 6px; font-size: 0.95rem; font-weight: 700; color: var(--text-strong); }
.cpx-home-section-head .cpx-home-section-title { margin: 0; }

.cpx-home-deal-row {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 10px 0; border-bottom: 1px solid var(--stroke-soft);
}
.cpx-home-deal-row:last-child { border-bottom: none; }
.cpx-home-deal-title { font-size: 0.88rem; font-weight: 600; color: var(--cpx-ink); }
.cpx-home-deal-date { font-size: 0.74rem; color: var(--text-dim); margin-top: 2px; }
.cpx-home-deal-sum { font-size: 0.9rem; font-weight: 700; color: var(--cpx-ink); font-variant-numeric: tabular-nums; white-space: nowrap; }

.cpx-home-nav { display: flex; flex-direction: column; gap: 8px; }
.cpx-home-nav-item {
  text-align: left;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--stroke-soft);
  background: var(--surface);
  cursor: pointer;
  display: flex; flex-direction: column; gap: 3px;
  transition: border-color 0.15s, background 0.15s;
}
.cpx-home-nav-item:hover { border-color: var(--accent); background: var(--accent-soft); }
.cpx-home-nav-title { font-size: 0.88rem; font-weight: 700; color: var(--text-strong); }
.cpx-home-nav-desc { font-size: 0.76rem; color: var(--text-dim); }
.cpx-home-pin { margin-bottom: 0; }
.cpx-home-pin .cpx-sub { margin-bottom: 12px; }
.cpx-fin-pos { color: var(--cpx-emerald); font-weight: 600; }
.cpx-fin-neg { color: var(--crimson); font-weight: 600; }

.cpx-btn--sm { width: auto; padding: 11px 18px; flex-shrink: 0; margin-top: 0; }
`;
