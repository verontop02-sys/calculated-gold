import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clientApi, getClientToken, setClientToken, setFintechToken, fintechApi, getFintechToken } from './api.js';
import { FintechInvest } from './FintechInvest.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import { ClientSidebar } from './ClientSidebar.jsx';
import { ClientMobileNav } from './ClientMobileNav.jsx';
import { applyTheme, getStoredTheme } from './theme.js';

const TAB_TITLES = { home: 'Личный кабинет', calc: 'Калькулятор', history: 'Мои сделки', invest: 'Покупка золота', support: 'Поддержка', settings: 'Настройки' };
const TAB_SUBTITLES = {
  home: 'Обзор сделок, золотого счёта и безопасность входа',
  calc: 'Оценка золота по текущему биржевому курсу',
  history: 'История ваших сделок с Reaktivo',
  invest: 'Золотой счёт: покупка, портфель, аналитика',
  support: 'Чат с командой Reaktivo — как в банке',
  settings: 'Профиль, тема, уведомления и PIN-код',
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
  const [tab, setTab] = useState('home');

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

  // Бейдж «ответ поддержки»: лёгкий опрос раз в минуту, пока клиент в кабинете.
  const [supportUnread, setSupportUnread] = useState(0);
  useEffect(() => {
    if (phase !== 'authed') return undefined;
    let cancelled = false;
    const poll = () => {
      clientApi.supportUnread()
        .then((out) => { if (!cancelled) setSupportUnread(out?.unread || 0); })
        .catch(() => { /* бейдж — не критично */ });
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [phase]);

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
    // Fintech-токен тоже сбрасываем: иначе следующий человек на этом устройстве
    // увидит чужой золотой счёт (вход нового пользователя показывал старый кабинет).
    setFintechToken('');
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
      <div className={`cpx-root cpx-shell${sidebarPinned ? ' cpx-shell--pinned' : ''}${tab === 'support' ? ' cpx-shell--chat' : ''}`}>
        <ClientSidebar
          tab={tab}
          onChange={setTab}
          phoneMasked={maskPhoneClient(phoneNormalized)}
          onOpenCabinet={() => setTab('home')}
          onSignOut={logout}
          pinned={sidebarPinned}
          onPinnedChange={setSidebarPinned}
          supportUnread={supportUnread}
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

          <main className={`cpx-shell__content${tab === 'invest' || tab === 'home' || tab === 'settings' || tab === 'history' ? ' cpx-shell__content--wide' : ''}${tab === 'support' ? ' cpx-shell__content--chat' : ''}`}>
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
            {tab === 'invest' && <FintechInvest clientToken={getClientToken()} expectedPhone={phoneNormalized} />}
            {tab === 'support' && <ClientSupportChat onUnreadCleared={() => setSupportUnread(0)} />}
            {tab === 'settings' && (
              <ClientSettings
                hasPin={hasPin}
                onPinChanged={() => setHasPin(true)}
                phoneMasked={maskPhoneClient(phoneNormalized)}
                sidebarPinned={sidebarPinned}
                onSidebarPinnedChange={setSidebarPinned}
                onLogout={logout}
                onNavigate={setTab}
              />
            )}
          </main>

          <ClientMobileNav
            tab={tab}
            onChange={setTab}
            phoneMasked={maskPhoneClient(phoneNormalized)}
            onOpenCabinet={() => setTab('home')}
            onSignOut={logout}
            supportUnread={supportUnread}
          />
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
          const clientTok = getClientToken();
          // Есть стейл fintech-токен — сначала пробуем профиль; при 401 обмениваем client-сессию.
          if (getFintechToken()) {
            try {
              await fintechApi.profile();
            } catch (e) {
              if (e?.status === 401 && clientTok) {
                await fintechApi.sessionFromClient(clientTok);
              } else if (e?.status === 401) {
                /* нет client-токена — ниже fintech останется null */
              } else {
                throw e;
              }
            }
          } else if (clientTok) {
            await fintechApi.sessionFromClient(clientTok);
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
    ? 'Золотой счёт активен'
    : fintechStatus === 'pending_review'
      ? 'Заявка на проверке'
      : fintechStatus === 'rejected'
        ? 'Нужна повторная отправка'
        : 'Ещё не подключён';

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
          <button type="button" className="cpx-btn cpx-btn--sm" onClick={() => onNavigate?.('invest')}>Купить золото</button>
          <button type="button" className="cpx-fin-pdf-btn" onClick={() => onNavigate?.('calc')}>Калькулятор</button>
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
                : 'Открыть золотой счёт →'}
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
            <p className="cpx-muted" style={{ margin: 0 }}>Сделок по номеру пока нет — можно пользоваться калькулятором и золотым счётом.</p>
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
            <button type="button" className="cpx-home-nav-item" onClick={() => onNavigate?.('invest')}>
              <span className="cpx-home-nav-title">Покупка золота</span>
              <span className="cpx-home-nav-desc">{investLabel}</span>
            </button>
            <button type="button" className="cpx-home-nav-item" onClick={() => onNavigate?.('history')}>
              <span className="cpx-home-nav-title">Мои сделки</span>
              <span className="cpx-home-nav-desc">{dealsSummary?.dealsCount ? `${dealsSummary.dealsCount} записей` : 'История скупки'}</span>
            </button>
            <button type="button" className="cpx-home-nav-item" onClick={() => onNavigate?.('calc')}>
              <span className="cpx-home-nav-title">Калькулятор</span>
              <span className="cpx-home-nav-desc">Оценка лома по биржевому курсу</span>
            </button>
            <button type="button" className="cpx-home-nav-item" onClick={() => onNavigate?.('support')}>
              <span className="cpx-home-nav-title">Поддержка</span>
              <span className="cpx-home-nav-desc">Чат с командой Reaktivo</span>
            </button>
          </div>
        </div>
      </div>

      <div className="cpx-card cpx-home-pin-cta">
        <div>
          <h3 className="cpx-home-section-title">Безопасность входа</h3>
          <p className="cpx-muted" style={{ margin: '4px 0 0' }}>
            {hasPin ? 'PIN-код установлен — быстрый вход без SMS.' : 'PIN ещё не задан — вход только по SMS.'}
            {' '}Тема, уведомления и смена PIN — в настройках.
          </p>
        </div>
        <button type="button" className="cpx-fin-pdf-btn" onClick={() => onNavigate?.('settings')}>
          Открыть настройки
        </button>
      </div>
    </div>
  );
}

const NOTIFY_KEY = 'cpx_notify_prefs';
function readNotifyPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIFY_KEY) || '{}');
    return {
      kycEmail: raw.kycEmail !== false,
      investOps: raw.investOps !== false,
      dealsSms: !!raw.dealsSms,
      marketing: !!raw.marketing,
    };
  } catch {
    return { kycEmail: true, investOps: true, dealsSms: false, marketing: false };
  }
}
function writeNotifyPrefs(prefs) {
  try { localStorage.setItem(NOTIFY_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

/** Полноценные настройки кабинета: профиль, тема, уведомления, PIN, сессия. */
function ClientSettings({ hasPin, onPinChanged, phoneMasked, sidebarPinned, onSidebarPinnedChange, onLogout, onNavigate }) {
  const [theme, setTheme] = useState(() => getStoredTheme());
  const [notify, setNotify] = useState(() => readNotifyPrefs());
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [fintechStatus, setFintechStatus] = useState(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileErr, setProfileErr] = useState('');
  const [profileOk, setProfileOk] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProfileLoading(true);
      try {
        if (!getFintechToken() && getClientToken()) {
          await fintechApi.sessionFromClient(getClientToken()).catch(() => null);
        }
        if (!getFintechToken()) {
          if (!cancelled) setFintechStatus('none');
          return;
        }
        const p = await fintechApi.profile();
        if (cancelled) return;
        setFullName(p.fullName || '');
        setEmail(p.email || '');
        setFintechStatus(p.status || 'none');
      } catch {
        if (!cancelled) setFintechStatus('none');
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function setThemeMode(mode) {
    setTheme(mode);
    applyTheme(mode);
  }

  function toggleNotify(key) {
    setNotify((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writeNotifyPrefs(next);
      return next;
    });
  }

  async function saveProfile(e) {
    e.preventDefault();
    setProfileErr('');
    setProfileOk('');
    if (!getFintechToken()) {
      setProfileErr('Сначала откройте раздел «Покупка золота» и пройдите регистрацию — тогда ФИО и почта сохранятся в профиле.');
      return;
    }
    setProfileBusy(true);
    try {
      await fintechApi.updateProfile(fullName, email);
      setProfileOk('Контакты сохранены');
    } catch (err) {
      setProfileErr(err?.message || 'Не удалось сохранить');
    } finally {
      setProfileBusy(false);
    }
  }

  const statusLabel = {
    approved: 'Покупка золота одобрена',
    pending_review: 'Заявка на проверке',
    rejected: 'Заявка отклонена — нужна доработка',
    blocked: 'Аккаунт заблокирован',
    new: 'Регистрация не завершена',
    none: 'Золотой счёт ещё не подключён',
  }[fintechStatus] || '—';

  return (
    <div className="cpx-settings">
      <div className="cpx-settings-grid">
        <section className="cpx-card cpx-settings-card">
          <h2 className="cpx-settings-title">Профиль</h2>
          <p className="cpx-settings-lead">Телефон привязан к кабинету. ФИО и почта используются для золотого счёта и писем о статусе KYC.</p>
          {profileLoading ? (
            <p className="cpx-muted"><span className="cpx-spinner" /> Загружаем…</p>
          ) : (
            <form onSubmit={saveProfile} className="cpx-form">
              <label className="cpx-field">
                <span className="cpx-field-label">Телефон</span>
                <input value={phoneMasked || '—'} disabled readOnly />
              </label>
              <label className="cpx-field">
                <span className="cpx-field-label">ФИО</span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Как в паспорте"
                  maxLength={200}
                />
              </label>
              <label className="cpx-field">
                <span className="cpx-field-label">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  maxLength={200}
                />
              </label>
              <p className="cpx-settings-meta">Статус золотого счёта: <b>{statusLabel}</b></p>
              {profileErr && <p className="cpx-err">{profileErr}</p>}
              {profileOk && <p className="cpx-fin-ok">{profileOk}</p>}
              <div className="cpx-settings-actions">
                <button type="submit" className="cpx-btn cpx-btn--inline" disabled={profileBusy}>
                  {profileBusy ? <><span className="cpx-spinner" /> Сохраняем…</> : 'Сохранить профиль'}
                </button>
                {fintechStatus !== 'approved' && (
                  <button type="button" className="cpx-fin-pdf-btn" onClick={() => onNavigate?.('invest')}>К покупке золота</button>
                )}
              </div>
            </form>
          )}
        </section>

        <section className="cpx-card cpx-settings-card">
          <h2 className="cpx-settings-title">Оформление</h2>
          <p className="cpx-settings-lead">Тема интерфейса и поведение бокового меню.</p>
          <div className="cpx-settings-theme">
            <button
              type="button"
              className={`cpx-settings-theme-opt${theme === 'light' ? ' cpx-settings-theme-opt--on' : ''}`}
              onClick={() => setThemeMode('light')}
            >
              <span className="cpx-settings-theme-ico">☀</span>
              <span>Светлая</span>
            </button>
            <button
              type="button"
              className={`cpx-settings-theme-opt${theme === 'dark' ? ' cpx-settings-theme-opt--on' : ''}`}
              onClick={() => setThemeMode('dark')}
            >
              <span className="cpx-settings-theme-ico">☾</span>
              <span>Тёмная</span>
            </button>
          </div>
          <label className="cpx-settings-switch">
            <input
              type="checkbox"
              checked={!!sidebarPinned}
              onChange={(e) => onSidebarPinnedChange?.(e.target.checked)}
            />
            <span>
              <strong>Закрепить боковое меню</strong>
              <em>На широком экране меню всегда развёрнуто</em>
            </span>
          </label>
        </section>

        <section className="cpx-card cpx-settings-card">
          <h2 className="cpx-settings-title">Уведомления</h2>
          <p className="cpx-settings-lead">Какие сообщения хотите получать. Предпочтения сохраняются на этом устройстве.</p>
          <div className="cpx-settings-toggles">
            <label className="cpx-settings-switch">
              <input type="checkbox" checked={notify.kycEmail} onChange={() => toggleNotify('kycEmail')} />
              <span>
                <strong>Письма о проверке документов</strong>
                <em>Одобрение или отказ KYC на email</em>
              </span>
            </label>
            <label className="cpx-settings-switch">
              <input type="checkbox" checked={notify.investOps} onChange={() => toggleNotify('investOps')} />
              <span>
                <strong>Операции по золотому счёту</strong>
                <em>Покупка, пополнение, важные изменения баланса</em>
              </span>
            </label>
            <label className="cpx-settings-switch">
              <input type="checkbox" checked={notify.dealsSms} onChange={() => toggleNotify('dealsSms')} />
              <span>
                <strong>SMS о сделках скупки</strong>
                <em>Когда появится новая сделка по вашему номеру</em>
              </span>
            </label>
            <label className="cpx-settings-switch">
              <input type="checkbox" checked={notify.marketing} onChange={() => toggleNotify('marketing')} />
              <span>
                <strong>Новости и спецпредложения</strong>
                <em>Редкие письма о сервисе Reaktivo</em>
              </span>
            </label>
          </div>
        </section>

        <section className="cpx-card cpx-settings-card">
          <h2 className="cpx-settings-title">Безопасность</h2>
          <p className="cpx-settings-lead">
            {hasPin ? 'PIN установлен. Для смены введите текущий код.' : 'Задайте 6-значный PIN для быстрого входа без ожидания SMS.'}
          </p>
          <ClientPinForm hasPin={hasPin} onPinChanged={onPinChanged} phoneMasked={phoneMasked} embedded />
        </section>

        <section className="cpx-card cpx-settings-card cpx-settings-card--wide">
          <h2 className="cpx-settings-title">Сессия и помощь</h2>
          <div className="cpx-settings-session">
            <div className="cpx-settings-session-item">
              <strong>Текущий вход</strong>
              <span>{phoneMasked || '—'} · {hasPin ? 'PIN' : 'SMS'}</span>
            </div>
            <div className="cpx-settings-session-item">
              <strong>Быстрые разделы</strong>
              <div className="cpx-settings-actions">
                <button type="button" className="cpx-fin-pdf-btn" onClick={() => onNavigate?.('home')}>Обзор кабинета</button>
                <button type="button" className="cpx-fin-pdf-btn" onClick={() => onNavigate?.('invest')}>Покупка золота</button>
                <button type="button" className="cpx-fin-pdf-btn" onClick={() => onNavigate?.('support')}>Написать в поддержку</button>
                <a className="cpx-fin-pdf-btn" href="/" style={{ textDecoration: 'none' }}>На главную</a>
              </div>
            </div>
            <div className="cpx-settings-session-item">
              <strong>Выход</strong>
              <p className="cpx-muted" style={{ margin: '4px 0 10px' }}>Сессия завершится на этом устройстве. Для входа снова понадобится PIN или SMS.</p>
              <button type="button" className="cpx-btn cpx-btn--inline cpx-btn--danger" onClick={onLogout}>Выйти из кабинета</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Форма PIN — в настройках (embedded) или отдельно. */
function ClientPinForm({ hasPin, onPinChanged, phoneMasked, embedded = false }) {
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
    <form onSubmit={submit} className="cpx-form">
      {!embedded && (
        <>
          <h3 className="cpx-home-section-title">{hasPin ? 'Сменить PIN-код' : 'Установить PIN-код'}</h3>
          <p className="cpx-sub">
            Номер {phoneMasked || '—'} · {hasPin ? 'PIN уже установлен' : 'пока вход только по SMS'}.
          </p>
        </>
      )}
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
      <button type="submit" className="cpx-btn cpx-btn--inline" disabled={busy}>
        {busy ? <><span className="cpx-spinner" /> Сохраняем…</> : 'Сохранить PIN-код'}
      </button>
    </form>
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
  const [openId, setOpenId] = useState(null);
  const [q, setQ] = useState('');

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

  const deals = useMemo(() => {
    const list = data?.deals || [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((d) => {
      const hay = [
        d.contractNo,
        d.firstProbe,
        ...(Array.isArray(d.rows) ? d.rows.map((r) => [r.itemName, r.probe, r.metal].filter(Boolean).join(' ')) : []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle) || formatMoney(d.totalRub).toLowerCase().includes(needle);
    });
  }, [data?.deals, q]);

  if (loading) return <div className="cpx-card cpx-muted"><span className="cpx-spinner" /> Загружаем сделки…</div>;
  if (err) return <div className="cpx-card cpx-err">{err}</div>;

  const avg = (data?.dealsCount > 0 && data?.totalRub != null)
    ? Math.round(Number(data.totalRub) / Number(data.dealsCount))
    : null;

  return (
    <div className="cpx-deals">
      <div className="cpx-deals-kpis">
        <div className="cpx-deals-kpi">
          <span className="cpx-deals-kpi-label">Всего сделок</span>
          <span className="cpx-deals-kpi-value">{data?.dealsCount ?? 0}</span>
        </div>
        <div className="cpx-deals-kpi cpx-deals-kpi--accent">
          <span className="cpx-deals-kpi-label">На сумму</span>
          <span className="cpx-deals-kpi-value">{formatMoney(data?.totalRub)}</span>
        </div>
        <div className="cpx-deals-kpi">
          <span className="cpx-deals-kpi-label">Средний чек</span>
          <span className="cpx-deals-kpi-value">{formatMoney(avg)}</span>
        </div>
        <div className="cpx-deals-kpi">
          <span className="cpx-deals-kpi-label">Последняя</span>
          <span className="cpx-deals-kpi-value cpx-deals-kpi-value--sm">{formatDate(data?.deals?.[0]?.createdAt) || '—'}</span>
        </div>
      </div>

      <div className="cpx-card cpx-deals-panel">
        <div className="cpx-deals-toolbar">
          <div>
            <h2 className="cpx-deals-panel-title">История сделок</h2>
            <p className="cpx-deals-panel-sub">Скупки по вашему номеру телефона</p>
          </div>
          <input
            className="cpx-deals-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск: договор, изделие, проба…"
          />
        </div>

        {deals.length === 0 ? (
          <p className="cpx-muted" style={{ margin: '8px 0 0' }}>
            {q.trim() ? 'Ничего не найдено по запросу.' : 'Сделок по вашему номеру пока нет.'}
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="cpx-deals-table-wrap">
              <table className="cpx-deals-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Договор</th>
                    <th>Состав</th>
                    <th>Проба / вес</th>
                    <th className="cpx-deals-num">Сумма</th>
                    <th aria-label="Подробнее" />
                  </tr>
                </thead>
                <tbody>
                  {deals.map((d) => {
                    const rows = Array.isArray(d.rows) ? d.rows.filter((r) => r.itemName || r.probe || r.priceRub) : [];
                    const preview = rows.slice(0, 2).map((r) => r.itemName || 'Изделие').join(', ')
                      || (d.firstProbe ? `Проба ${d.firstProbe}` : '—');
                    const more = rows.length > 2 ? ` +${rows.length - 2}` : '';
                    const probe = d.firstProbe || rows.find((r) => r.probe)?.probe || '—';
                    const weight = d.firstWeightGross ?? rows.find((r) => r.weightGross)?.weightGross;
                    const open = openId === d.id;
                    return (
                      <Fragment key={d.id}>
                        <tr className={open ? 'cpx-deals-tr--open' : ''} onClick={() => setOpenId(open ? null : d.id)}>
                          <td className="cpx-deals-date">{formatDate(d.createdAt)}</td>
                          <td className="cpx-deals-contract">{d.contractNo ? `№ ${d.contractNo}` : 'Без номера'}</td>
                          <td className="cpx-deals-items">{preview}{more}</td>
                          <td className="cpx-deals-meta">
                            {probe !== '—' ? `пр. ${probe}` : '—'}
                            {weight != null ? ` · ${weight} г` : ''}
                          </td>
                          <td className="cpx-deals-num cpx-deals-sum">{formatMoney(d.totalRub)}</td>
                          <td className="cpx-deals-chevron">{open ? '▾' : '▸'}</td>
                        </tr>
                        {open && (
                          <tr className="cpx-deals-detail-tr">
                            <td colSpan={6}>
                              {rows.length === 0 ? (
                                <p className="cpx-muted" style={{ margin: 0 }}>Детализация по позициям недоступна.</p>
                              ) : (
                                <table className="cpx-deals-detail">
                                  <thead>
                                    <tr>
                                      <th>Изделие</th>
                                      <th>Металл</th>
                                      <th>Проба</th>
                                      <th className="cpx-deals-num">Вес, г</th>
                                      <th className="cpx-deals-num">Сумма</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((r, i) => (
                                      <tr key={i}>
                                        <td>{r.itemName || 'Изделие'}</td>
                                        <td>{r.metal || '—'}</td>
                                        <td>{r.probe || '—'}</td>
                                        <td className="cpx-deals-num">{r.weightGross ?? r.weightNet ?? '—'}</td>
                                        <td className="cpx-deals-num">{r.priceRub != null ? formatMoney(r.priceRub) : '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="cpx-deals-cards">
              {deals.map((d) => {
                const rows = Array.isArray(d.rows) ? d.rows.filter((r) => r.itemName || r.probe || r.priceRub) : [];
                return (
                  <div key={d.id} className="cpx-deal-card">
                    <div className="cpx-deal-head">
                      <div>
                        <div className="cpx-deal-no">{d.contractNo ? `Договор № ${d.contractNo}` : 'Без номера'}</div>
                        <div className="cpx-deal-date">{formatDate(d.createdAt)}</div>
                      </div>
                      <div className="cpx-deal-sum">{formatMoney(d.totalRub)}</div>
                    </div>
                    {rows.length > 0 && (
                      <ul className="cpx-deal-rows">
                        {rows.map((r, i) => (
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
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Чат поддержки: клиент ↔ команда Reaktivo (как в онлайн-банке) ─────────── */

function chatDayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Сегодня';
  if (sameDay(d, yesterday)) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function chatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function ClientSupportChat({ onUnreadCleared }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const stickToBottomRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const out = await clientApi.supportChat();
      setMessages(out.messages || []);
      setErr('');
      onUnreadCleared?.();
    } catch (e) {
      setErr(e.message || 'Не удалось загрузить чат');
    } finally {
      setLoading(false);
    }
    // onUnreadCleared стабилен по смыслу (сброс бейджа)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 12_000);
    return () => clearInterval(id);
  }, [load]);

  // Автопрокрутка вниз, если пользователь не листает историю вверх.
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  function onListScroll() {
    const el = listRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setErr('');
    try {
      const out = await clientApi.supportSend(body);
      setText('');
      stickToBottomRef.current = true;
      if (out?.message) setMessages((prev) => [...prev, out.message]);
    } catch (e) {
      setErr(e.message || 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Группировка по дням для разделителей.
  const grouped = useMemo(() => {
    const out = [];
    let lastDay = '';
    for (const m of messages) {
      const day = chatDayLabel(m.createdAt);
      if (day !== lastDay) {
        out.push({ type: 'day', key: `day-${day}-${m.id}`, label: day });
        lastDay = day;
      }
      out.push({ type: 'msg', key: m.id, msg: m });
    }
    return out;
  }, [messages]);

  return (
    <div className="cpx-chat">
      <div className="cpx-chat-head">
        <span className="cpx-chat-head__icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
          </svg>
        </span>
        <div className="cpx-chat-head__text">
          <span className="cpx-chat-head__title">Поддержка Reaktivo</span>
          <span className="cpx-chat-head__sub">
            <span className="cpx-chat-head__dot" aria-hidden />
            Онлайн · отвечаем в рабочее время
          </span>
        </div>
      </div>

      <div className="cpx-chat-list" ref={listRef} onScroll={onListScroll}>
        {loading && <div className="cpx-chat-empty">Загружаем переписку…</div>}
        {!loading && messages.length === 0 && (
          <div className="cpx-chat-empty">
            <div className="cpx-chat-empty__icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
              </svg>
            </div>
            <div className="cpx-chat-empty__title">Напишите нам</div>
            <p className="cpx-chat-empty__sub">
              Поможем с документами, сделками и покупкой золота.
              Ответ придёт прямо сюда.
            </p>
          </div>
        )}
        {grouped.map((item) =>
          item.type === 'day' ? (
            <div key={item.key} className="cpx-chat-day"><span>{item.label}</span></div>
          ) : (
            <div key={item.key} className={`cpx-chat-msg${item.msg.sender === 'client' ? ' cpx-chat-msg--me' : ''}`}>
              <div className="cpx-chat-bubble">
                {item.msg.sender === 'staff' && (
                  <span className="cpx-chat-author">{item.msg.staffName || 'Поддержка Reaktivo'}</span>
                )}
                <span className="cpx-chat-text">{item.msg.body}</span>
                <span className="cpx-chat-time mono-nums">{chatTime(item.msg.createdAt)}</span>
              </div>
            </div>
          )
        )}
      </div>

      {err && <p className="cpx-chat-err">{err}</p>}

      <div className="cpx-chat-compose">
        <textarea
          className="cpx-chat-input"
          rows={1}
          placeholder="Напишите сообщение…"
          value={text}
          maxLength={2000}
          onChange={(e) => {
            setText(e.target.value);
            const el = e.target;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
          }}
          onKeyDown={onKeyDown}
          disabled={sending}
        />
        <button
          type="button"
          className="cpx-chat-send"
          onClick={send}
          disabled={sending || !text.trim()}
          title="Отправить (Enter)"
          aria-label="Отправить сообщение"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
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
/* Режим чата: фиксируем высоту экрана, скролл только внутри переписки */
.cpx-shell--chat .cpx-shell__main {
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
}

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
/* Чат поддержки — без отступов и «карточки», на всю рабочую область */
.cpx-shell__content--chat {
  max-width: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
@media (max-width: 900px) {
  .cpx-shell__content { padding: 16px 16px 84px; }
  .cpx-shell__content--wide { padding: 16px 16px 84px; }
  .cpx-shell__content--chat { padding: 0 0 56px; flex: 1; }
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

.cpx-fin-hero {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  margin-bottom: 10px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid var(--stroke);
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent-soft) 70%, var(--cpx-panel)), var(--cpx-panel));
}
.cpx-fin-hero-main { min-width: 0; flex: 1; }
.cpx-fin-hero-title {
  font-family: var(--font-display, serif);
  font-size: clamp(1.25rem, 2.4vw, 1.65rem);
  font-weight: 700; margin: 4px 0 8px; color: var(--text-strong); letter-spacing: -0.02em;
}
.cpx-fin-hero-value { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.cpx-fin-hero-value-num {
  font-size: clamp(1.6rem, 3.2vw, 2.15rem);
  font-weight: 800; color: var(--text-strong);
  letter-spacing: -0.03em; font-variant-numeric: tabular-nums;
}
.cpx-fin-hero-pnl { font-size: 0.95rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.cpx-fin-hero-meta { margin: 8px 0 0; font-size: 0.8rem; color: var(--text-dim); }
.cpx-fin-hero-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.cpx-fin-hero-actions .cpx-btn { width: auto; margin: 0; padding: 10px 18px; }

.cpx-fin-tabs {
  display: flex; gap: 4px; margin-bottom: 10px; overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding: 3px; border-radius: 12px;
  background: var(--surface); border: 1px solid var(--stroke-soft);
}
.cpx-fin-tab {
  flex: 1 0 auto; min-width: 72px;
  padding: 10px 14px; border: none; border-radius: 9px;
  background: transparent; color: var(--text-muted);
  font-size: 0.82rem; font-weight: 700; cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}
.cpx-fin-tab--on { background: var(--accent); color: #fff; }
.cpx-fin-tab:hover:not(.cpx-fin-tab--on) { color: var(--text-strong); background: var(--cpx-panel); }

.cpx-fin-quick { margin-bottom: 0; }
.cpx-fin-quick-grid { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.cpx-fin-quick-btn {
  text-align: left; padding: 12px 14px; border-radius: 10px;
  border: 1px solid var(--stroke-soft); background: var(--surface);
  cursor: pointer; display: flex; flex-direction: column; gap: 2px;
  transition: border-color 0.15s, background 0.15s;
}
.cpx-fin-quick-btn:hover { border-color: var(--accent); background: var(--accent-soft); }
.cpx-fin-quick-btn strong { font-size: 0.88rem; color: var(--text-strong); }
.cpx-fin-quick-btn span { font-size: 0.74rem; color: var(--text-dim); }

.cpx-fin-clocks { margin-bottom: 10px; }

.cpx-fin-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 10px;
  align-items: start;
  margin-bottom: 0;
}
.cpx-fin-layout--lower { margin-bottom: 0; }
.cpx-fin-main { min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.cpx-fin-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.cpx-fin-main > .cpx-card,
.cpx-fin-side > .cpx-card,
.cpx-fin-buy-panel > .cpx-card,
.cpx-fin-sell-grid > .cpx-card {
  margin-bottom: 0;
}
.cpx-fin-side-title { font-size: 1rem; font-weight: 700; margin: 0 0 4px; color: var(--text-strong); letter-spacing: -0.01em; }
.cpx-fin-side-sub { margin: 0 0 12px; font-size: 0.78rem; color: var(--text-dim); line-height: 1.4; }
.cpx-fin-buy-form { gap: 10px; }
.cpx-fin-buy-form .cpx-btn { margin-top: 2px; padding: 12px 16px; font-size: 0.88rem; border-radius: 10px; }
.cpx-fin-buy-panel { display: flex; flex-direction: column; gap: 14px; }
@media (max-width: 1180px) {
  .cpx-fin-layout { grid-template-columns: 1fr; }
}

.cpx-fin-stepper {
  display: grid; grid-template-columns: 52px 1fr 52px; gap: 10px; align-items: center;
}
.cpx-fin-stepper-btn {
  height: 52px; border-radius: 12px; border: 1px solid var(--stroke);
  background: var(--surface); color: var(--text-strong);
  font-size: 1.4rem; font-weight: 600; cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.cpx-fin-stepper-btn:hover { border-color: var(--accent); background: var(--accent-soft); }
.cpx-fin-stepper-value {
  display: flex; align-items: center; gap: 6px;
  height: 52px; padding: 0 14px; border-radius: 12px;
  border: 1px solid var(--stroke); background: var(--input-bg);
}
.cpx-fin-stepper-value input {
  flex: 1; min-width: 0; border: none; background: transparent; outline: none;
  font-size: 1.25rem; font-weight: 700; color: var(--cpx-ink); text-align: center;
  font-variant-numeric: tabular-nums;
}
.cpx-fin-stepper-value span { font-size: 0.9rem; font-weight: 600; color: var(--text-muted); }
.cpx-fin-step-hint { margin: -2px 0 0; font-size: 0.72rem; color: var(--text-dim); text-align: center; }

.cpx-fin-order {
  border: 1px dashed var(--stroke);
  border-radius: 12px;
  padding: 12px 14px;
  background: var(--surface);
  display: flex; flex-direction: column; gap: 8px;
}
.cpx-fin-order-title {
  font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted);
}
.cpx-fin-order-row {
  display: flex; justify-content: space-between; gap: 10px;
  font-size: 0.84rem; color: var(--text-muted);
}
.cpx-fin-order-row strong { color: var(--text-strong); font-variant-numeric: tabular-nums; }
.cpx-fin-order-row--accent strong { color: var(--cpx-emerald); }
.cpx-fin-order-total {
  display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
  margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--stroke-soft);
  font-size: 0.82rem; font-weight: 700; color: var(--text-muted);
}
.cpx-fin-order-total strong {
  font-size: 1.15rem; color: var(--text-strong); font-variant-numeric: tabular-nums;
}
.cpx-fin-order-bal { font-size: 0.74rem; color: var(--text-dim); }

.cpx-fin-sell-grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 0;
}
@media (max-width: 900px) { .cpx-fin-sell-grid { grid-template-columns: 1fr; } }
.cpx-fin-status-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

.cpx-fin-pill {
  display: inline-flex; align-items: center;
  padding: 4px 10px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent);
  font-size: 0.68rem; font-weight: 700;
}
.cpx-fin-sliders { display: flex; flex-direction: column; gap: 16px; margin: 8px 0 16px; }
.cpx-fin-slider { display: flex; flex-direction: column; gap: 6px; }
.cpx-fin-slider-head {
  display: flex; justify-content: space-between; gap: 10px; align-items: baseline;
  font-size: 0.82rem; color: var(--text-muted);
}
.cpx-fin-slider-head strong { color: var(--text-strong); font-variant-numeric: tabular-nums; }
.cpx-fin-slider input[type="range"] {
  width: 100%; accent-color: var(--accent); height: 28px; cursor: pointer;
}
.cpx-fin-slider-ends {
  display: flex; justify-content: space-between;
  font-size: 0.7rem; color: var(--text-dim);
}
.cpx-fin-benefit-card { padding: 16px 18px; }
.cpx-fin-benefit-result { display: flex; flex-direction: column; gap: 10px; }
.cpx-fin-benefit-result-box {
  border: 1px dashed var(--stroke); border-radius: 12px; padding: 14px 16px; background: var(--surface);
}
.cpx-fin-benefit-nums { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin-top: 6px; }
.cpx-fin-benefit-profit { font-size: 1.45rem; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.cpx-fin-benefit-pct { font-size: 1.25rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.cpx-fin-benefit-today {
  border-radius: 12px; padding: 14px 16px;
  background: #161616; color: #fff;
  display: flex; flex-direction: column; gap: 4px;
}
:root[data-theme="light"] .cpx-fin-benefit-today,
html:not([data-theme="dark"]) .cpx-fin-benefit-today {
  background: #1c1c1c;
}
.cpx-fin-benefit-today .cpx-fin-kpi-label { color: rgba(255,255,255,0.65); }
.cpx-fin-benefit-today-val { font-size: 1.35rem; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.cpx-fin-benefit-compact-head { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
.cpx-fin-benefit-compact-res { display: flex; align-items: baseline; gap: 10px; margin: 10px 0 4px; font-size: 1.15rem; font-weight: 800; }

.cpx-fin-chart-card { padding: 14px 16px; margin-bottom: 0; }
.cpx-fin-ai-card { padding: 14px 16px; border-color: var(--stroke); overflow: hidden; margin-bottom: 0; }
.cpx-fin-history-card { padding: 12px 14px; margin-bottom: 0; }
.cpx-fin-quick { margin-bottom: 0; padding: 12px 14px; }
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
  white-space: nowrap;
}
.cpx-fin-range-btn--on { background: var(--accent); color: #fff; }
.cpx-fin-chart-controls { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
@media (max-width: 640px) {
  .cpx-fin-chart-controls { width: 100%; justify-content: flex-start; }
}

.cpx-fin-buy-card { border-color: var(--stroke); }
.cpx-fin-ledger-list { display: flex; flex-direction: column; max-height: 420px; overflow: auto; margin: 8px -4px 0; padding: 0 4px; }

@media (max-width: 640px) {
  .cpx-fin-hero { padding: 14px 14px; }
  .cpx-fin-hero-actions { width: 100%; }
  .cpx-fin-hero-actions .cpx-btn,
  .cpx-fin-hero-actions .cpx-fin-pdf-btn { flex: 1; justify-content: center; }
  .cpx-fin-tabs { gap: 2px; }
  .cpx-fin-tab { padding: 10px 12px; font-size: 0.78rem; }
  .cpx-fin-stepper { grid-template-columns: 48px 1fr 48px; }
  .cpx-fin-stepper-btn { height: 48px; }
  .cpx-fin-stepper-value { height: 48px; }
}

/* ── AI-ассистент (desktop, компактно) ── */
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

@media (max-width: 640px) {
  .cpx-fin-ai-card { padding: 14px; }
  .cpx-fin-ai-answer { font-size: 0.88rem; line-height: 1.6; max-height: none; padding: 12px 13px; }
  .cpx-fin-ai-scenario-value { font-size: 1.1rem; }
  .cpx-fin-ai-ask { flex-direction: column; align-items: stretch; gap: 10px; }
  .cpx-fin-ai-ask input {
    height: 46px;
    font-size: 0.92rem;
    width: 100%;
  }
  .cpx-fin-ai-ask-btn {
    width: 100% !important;
    height: 46px;
    font-size: 0.9rem;
  }
}
.cpx-fin-ai-disclaimer { margin: 8px 0 0; font-size: 0.68rem; color: var(--text-dim); line-height: 1.4; }

/* ── Чат поддержки (без карточной подложки) ── */
.cpx-chat {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  min-height: 0;
  height: 100%;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
  overflow: hidden;
}
.cpx-chat-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--stroke-soft);
  background: transparent;
  flex-shrink: 0;
}
.cpx-chat-head__icon {
  width: 36px; height: 36px;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.cpx-chat-head__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cpx-chat-head__title { font-size: 0.9rem; font-weight: 700; color: var(--text-strong); }
.cpx-chat-head__sub {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 0.72rem; color: var(--text-muted);
}
.cpx-chat-head__dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--emerald, #22c55e);
  box-shadow: 0 0 6px color-mix(in srgb, var(--emerald, #22c55e) 70%, transparent);
}
@media (max-width: 900px) {
  /* На мобилке топбар уже говорит «Поддержка» — шапка чата компактнее */
  .cpx-chat-head { padding: 10px 16px; }
  .cpx-chat-head__icon { width: 32px; height: 32px; border-radius: 9px; }
  .cpx-chat-head__title { font-size: 0.84rem; }
}
.cpx-chat-list {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  background: transparent;
}
@media (max-width: 900px) {
  .cpx-chat-list { padding: 12px 14px 8px; }
}
.cpx-chat-empty {
  margin: auto;
  text-align: center;
  max-width: 34ch;
  color: var(--text-muted);
  font-size: 0.86rem;
  line-height: 1.55;
  padding: 24px 12px;
}
.cpx-chat-empty__icon {
  width: 52px; height: 52px;
  border-radius: 16px;
  margin: 0 auto 12px;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-soft);
  color: var(--accent);
}
.cpx-chat-empty__title { font-size: 1.05rem; font-weight: 700; color: var(--text-strong); margin-bottom: 6px; }
.cpx-chat-empty__sub { margin: 0; }
.cpx-chat-day {
  display: flex;
  justify-content: center;
  margin: 10px 0 6px;
}
.cpx-chat-day span {
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  background: color-mix(in srgb, var(--surface) 80%, transparent);
  border: 1px solid var(--stroke-soft);
  border-radius: 999px;
  padding: 3px 11px;
}
.cpx-chat-msg { display: flex; }
.cpx-chat-msg--me { justify-content: flex-end; }
.cpx-chat-bubble {
  max-width: min(82%, 480px);
  padding: 9px 12px 5px;
  border-radius: 16px 16px 16px 5px;
  background: var(--surface);
  border: 1px solid var(--stroke-soft);
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow: none;
}
.cpx-chat-msg--me .cpx-chat-bubble {
  border-radius: 16px 16px 5px 16px;
  background: var(--accent);
  border-color: transparent;
}
.cpx-chat-author { font-size: 0.68rem; font-weight: 700; color: var(--accent); margin-bottom: 1px; }
.cpx-chat-text {
  font-size: 0.9rem;
  color: var(--text);
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.cpx-chat-msg--me .cpx-chat-text { color: #fff; }
.cpx-chat-time { align-self: flex-end; font-size: 0.62rem; color: var(--text-dim); margin-top: 2px; }
.cpx-chat-msg--me .cpx-chat-time { color: rgba(255, 255, 255, 0.7); }
.cpx-chat-err { margin: 0; padding: 6px 16px; font-size: 0.8rem; color: var(--danger); flex-shrink: 0; }
.cpx-chat-compose {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 10px 16px calc(12px + env(safe-area-inset-bottom, 0));
  border-top: 1px solid var(--stroke-soft);
  background: color-mix(in srgb, var(--bg-panel-solid) 92%, transparent);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  flex-shrink: 0;
}
@media (max-width: 900px) {
  .cpx-chat-compose {
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0));
    /* На мобилке нижнее меню уже даёт safe-area — не дублируем */
    padding-bottom: 10px;
  }
}
.cpx-chat-input {
  flex: 1;
  min-height: 44px;
  max-height: 120px;
  padding: 11px 14px;
  border-radius: 14px;
  border: 1px solid var(--stroke);
  background: var(--input-bg);
  color: var(--text-strong);
  font-size: 0.92rem;
  font-family: inherit;
  line-height: 1.4;
  resize: none;
  outline: none;
  box-sizing: border-box;
}
.cpx-chat-input::placeholder { color: var(--text-dim); }
.cpx-chat-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
@media (max-width: 900px) {
  .cpx-chat-input {
    min-height: 46px;
    font-size: 1rem; /* iOS не зумит при фокусе */
    padding: 12px 14px;
  }
}
.cpx-chat-send {
  width: 44px; height: 44px;
  flex-shrink: 0;
  border: none;
  border-radius: 14px;
  background: var(--accent-grad, var(--accent));
  color: #fff;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: filter 0.16s, transform 0.15s, opacity 0.15s;
}
.cpx-chat-send:hover:not(:disabled) { filter: brightness(1.07); }
.cpx-chat-send:active:not(:disabled) { transform: scale(0.95); }
.cpx-chat-send:disabled { opacity: 0.4; cursor: not-allowed; }
@media (max-width: 900px) {
  .cpx-chat-send { width: 46px; height: 46px; }
}

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

.cpx-deals { max-width: 1400px; margin: 0 auto; width: 100%; }
.cpx-deals-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
@media (max-width: 900px) { .cpx-deals-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.cpx-deals-kpi {
  background: var(--cpx-panel); border: 1px solid var(--cpx-stroke); border-radius: 12px;
  padding: 14px 16px; display: flex; flex-direction: column; gap: 4px;
}
.cpx-deals-kpi--accent { border-color: var(--accent-soft); background: linear-gradient(135deg, var(--accent-soft), transparent); }
.cpx-deals-kpi-label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cpx-muted); font-weight: 700; }
.cpx-deals-kpi-value { font-size: 1.2rem; font-weight: 700; color: var(--cpx-ink); font-variant-numeric: tabular-nums; }
.cpx-deals-kpi-value--sm { font-size: 1rem; }
.cpx-deals-kpi--accent .cpx-deals-kpi-value { color: var(--cpx-gold); }

.cpx-deals-panel { padding: 16px 18px; margin-bottom: 0; }
.cpx-deals-toolbar {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; flex-wrap: wrap;
  margin-bottom: 12px;
}
.cpx-deals-panel-title { margin: 0; font-size: 1rem; font-weight: 700; color: var(--text-strong); }
.cpx-deals-panel-sub { margin: 3px 0 0; font-size: 0.78rem; color: var(--text-dim); }
.cpx-deals-search {
  width: min(320px, 100%);
  height: 38px; padding: 0 12px; border-radius: 9px;
  border: 1px solid var(--cpx-stroke); background: var(--input-bg); color: var(--cpx-ink);
  font-size: 0.84rem; outline: none; box-sizing: border-box;
}
.cpx-deals-search:focus { border-color: var(--cpx-accent); box-shadow: 0 0 0 3px var(--cpx-accent-soft); }

.cpx-deals-table-wrap { width: 100%; overflow: auto; margin: 0 -4px; }
.cpx-deals-table { width: 100%; border-collapse: collapse; font-size: 0.86rem; min-width: 720px; }
.cpx-deals-table th {
  text-align: left; padding: 10px 12px; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text-dim); border-bottom: 1px solid var(--stroke-strong); background: var(--surface); white-space: nowrap;
  position: sticky; top: 0;
}
.cpx-deals-table td {
  padding: 12px; border-bottom: 1px solid var(--stroke-soft); color: var(--cpx-ink); vertical-align: middle;
}
.cpx-deals-table tbody tr:not(.cpx-deals-detail-tr) { cursor: pointer; transition: background 0.12s; }
.cpx-deals-table tbody tr:not(.cpx-deals-detail-tr):hover { background: var(--surface); }
.cpx-deals-tr--open { background: color-mix(in srgb, var(--accent-soft) 45%, transparent); }
.cpx-deals-num { text-align: right !important; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cpx-deals-sum { font-weight: 700; color: var(--cpx-gold); }
.cpx-deals-contract { font-weight: 600; white-space: nowrap; }
.cpx-deals-date { color: var(--text-muted); white-space: nowrap; }
.cpx-deals-items { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cpx-deals-meta { color: var(--text-muted); white-space: nowrap; }
.cpx-deals-chevron { width: 28px; text-align: center; color: var(--text-dim); font-size: 0.75rem; }

.cpx-deals-detail-tr td { padding: 0 12px 14px; background: var(--surface); border-bottom: 1px solid var(--stroke); }
.cpx-deals-detail { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-top: 4px; }
.cpx-deals-detail th {
  text-align: left; padding: 8px 10px; font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text-dim); border-bottom: 1px solid var(--stroke-soft); background: transparent;
}
.cpx-deals-detail td { padding: 8px 10px; border-bottom: 1px solid var(--stroke-soft); }
.cpx-deals-detail tr:last-child td { border-bottom: none; }

.cpx-deals-cards { display: none; }
@media (max-width: 820px) {
  .cpx-deals-table-wrap { display: none; }
  .cpx-deals-cards { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
  .cpx-deals-search { width: 100%; }
}
.cpx-deal-card {
  border: 1px solid var(--stroke-soft); border-radius: 12px; padding: 14px; background: var(--surface);
}

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

/* Линия основных показателей портфеля — правка Руслана: заметнее и ярче. */
.cpx-fin-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
@media (max-width: 1100px) { .cpx-fin-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 640px) { .cpx-fin-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; } }
.cpx-fin-kpi {
  position: relative; overflow: hidden;
  background: var(--cpx-panel); border: 1px solid var(--cpx-stroke); border-radius: 14px;
  padding: 12px 14px 13px; display: flex; flex-direction: column; gap: 4px;
}
.cpx-fin-kpi::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 30%, transparent));
  opacity: 0.85;
}
.cpx-fin-kpi--hero {
  background: linear-gradient(150deg, var(--cpx-accent-soft), transparent 70%);
  border-color: color-mix(in srgb, var(--accent) 38%, transparent);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--accent) 14%, transparent);
}
.cpx-fin-kpi--hero .cpx-fin-kpi-value { color: var(--accent); }
.cpx-fin-kpi--pos::before { background: linear-gradient(90deg, var(--cpx-emerald), color-mix(in srgb, var(--cpx-emerald) 30%, transparent)); }
.cpx-fin-kpi--neg::before { background: linear-gradient(90deg, var(--crimson), color-mix(in srgb, var(--crimson) 30%, transparent)); }
.cpx-fin-kpi--pos .cpx-fin-kpi-value { color: var(--cpx-emerald); }
.cpx-fin-kpi--neg .cpx-fin-kpi-value { color: var(--crimson); }
.cpx-fin-kpi-label { font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--cpx-muted); font-weight: 700; }
.cpx-fin-kpi-value {
  font-size: clamp(1.12rem, 1.6vw, 1.34rem); font-weight: 800; color: var(--cpx-ink);
  letter-spacing: -0.02em; font-variant-numeric: tabular-nums; white-space: nowrap;
}
.cpx-fin-kpi-pct { font-size: 0.74rem; font-weight: 700; }
@media (max-width: 640px) { .cpx-fin-kpi-value { font-size: 1.05rem; } }

/* Единый шрифт цифр по всему золотому счёту (правка «одинаковый шрифт — цифры») */
.cpx-fin-ledger-right, .cpx-fin-ledger-right span,
.cpx-fin-order strong, .cpx-fin-order-total strong,
.cpx-fin-order-bal, .cpx-fin-side-sub, .cpx-fin-hero-meta,
.cpx-fin-benefit-compact-res, .cpx-fin-ai-scenario-value {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}

.cpx-fin-topup-hint { display: flex; align-items: flex-start; gap: 10px; background: var(--surface); border-color: var(--stroke-soft); }
.cpx-fin-topup-icon { color: var(--text-muted); font-weight: 700; flex-shrink: 0; }
.cpx-fin-topup-hint p { margin: 0; font-size: 0.78rem; color: var(--text-muted); line-height: 1.45; }

/* Переключатель единиц покупки: крупные знаки «г» и «₽» (без «В рублях/В граммах») */
.cpx-fin-unit-switch {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
  background: var(--surface); padding: 5px; border-radius: 14px;
  border: 1px solid var(--stroke-soft);
}
.cpx-fin-unit-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px 12px; border: 1px solid transparent; border-radius: 10px;
  background: transparent; color: var(--text-muted); cursor: pointer;
  transition: background 0.16s, color 0.16s, border-color 0.16s, box-shadow 0.16s;
}
.cpx-fin-unit-sign {
  font-size: 1.25rem; font-weight: 800; line-height: 1;
  font-variant-numeric: tabular-nums;
}
.cpx-fin-unit-cap { font-size: 0.78rem; font-weight: 600; letter-spacing: 0.02em; }
.cpx-fin-unit-btn:hover { color: var(--text-strong); }
.cpx-fin-unit-btn--on {
  background: var(--accent-soft); color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 18%, transparent);
}
.cpx-fin-estimate { margin: 0; font-size: 0.85rem; font-weight: 600; color: var(--cpx-gold); }
.cpx-fin-ok { color: var(--cpx-emerald); font-size: 0.85rem; margin: 0; font-weight: 600; }

.cpx-fin-history-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; gap: 10px; flex-wrap: wrap; }
.cpx-fin-history-head .cpx-h2 { margin: 0; }
.cpx-fin-ledger-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--stroke-soft); font-size: 0.82rem; gap: 10px; }
/* Кликабельная строка операции → попап деталей */
.cpx-fin-ledger-row--btn {
  width: 100%; background: transparent; border-left: none; border-right: none; border-top: none;
  color: inherit; text-align: left; cursor: pointer; font: inherit;
  border-radius: 8px; padding-left: 4px; padding-right: 4px; margin: 0 -4px;
  transition: background 0.14s;
}
.cpx-fin-ledger-row--btn:hover { background: var(--surface); }
.cpx-fin-ledger-row--btn .cpx-fin-ledger-main { flex: 1; }
.cpx-fin-ledger-chevron { color: var(--text-dim); font-size: 1rem; flex-shrink: 0; }

/* Попап деталей операции */
.cpx-fin-op-backdrop {
  position: fixed; inset: 0; z-index: 90;
  background: rgba(8, 9, 12, 0.62);
  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  animation: cpxOpFade 180ms ease;
}
@keyframes cpxOpFade { from { opacity: 0; } to { opacity: 1; } }
.cpx-fin-op-modal {
  position: relative;
  width: 100%; max-width: 380px;
  background: var(--bg-panel-solid); border: 1px solid var(--stroke);
  border-radius: 18px; padding: 22px 20px 18px;
  box-shadow: 0 24px 70px rgba(0,0,0,0.45);
  animation: cpxOpPop 260ms cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes cpxOpPop { from { transform: translateY(14px) scale(0.97); opacity: 0; } to { transform: none; opacity: 1; } }
.cpx-fin-op-close {
  position: absolute; top: 12px; right: 12px;
  width: 28px; height: 28px; border-radius: 50%;
  border: 1px solid var(--stroke); background: transparent; color: var(--text-muted);
  cursor: pointer; font-size: 0.8rem;
}
.cpx-fin-op-icon {
  display: flex; align-items: center; justify-content: center;
  width: 44px; height: 44px; border-radius: 13px;
  background: var(--accent-soft); color: var(--accent);
  font-size: 1.3rem; font-weight: 800; margin-bottom: 10px;
}
.cpx-fin-op-icon--buy { background: var(--accent-soft); color: var(--accent); }
.cpx-fin-op-icon--sell { background: var(--emerald-soft, rgba(16,185,129,0.14)); color: var(--emerald); }
.cpx-fin-op-title { margin: 0 0 2px; font-size: 1.05rem; font-weight: 800; color: var(--text-strong); }
.cpx-fin-op-date { margin: 0 0 14px; font-size: 0.78rem; color: var(--text-muted); }
.cpx-fin-op-rows { display: flex; flex-direction: column; }
.cpx-fin-op-row {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  padding: 9px 0; border-bottom: 1px solid var(--stroke-soft); font-size: 0.85rem;
}
.cpx-fin-op-row:last-child { border-bottom: none; }
.cpx-fin-op-row span { color: var(--text-muted); }
.cpx-fin-op-row strong { color: var(--text-strong); font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cpx-fin-op-row--rate strong { color: var(--accent); }
.cpx-fin-op-comment { font-weight: 600; white-space: normal; text-align: right; word-break: break-word; }
.cpx-fin-op-ok { width: 100%; margin-top: 14px; }
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
.cpx-home-hero-actions .cpx-btn { width: auto; margin: 0; padding: 8px 14px; }

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
.cpx-home-pin-cta {
  display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
  padding: 16px 18px;
}

/* ── Настройки ── */
.cpx-settings { max-width: 1280px; margin: 0 auto; width: 100%; }
.cpx-settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: start;
}
@media (max-width: 960px) { .cpx-settings-grid { grid-template-columns: 1fr; } }
.cpx-settings-card { margin-bottom: 0; padding: 18px 18px 16px; }
.cpx-settings-card--wide { grid-column: 1 / -1; }
.cpx-settings-title { margin: 0 0 4px; font-size: 1.05rem; font-weight: 700; color: var(--text-strong); letter-spacing: -0.01em; }
.cpx-settings-lead { margin: 0 0 14px; font-size: 0.82rem; color: var(--text-dim); line-height: 1.45; }
.cpx-settings-meta { margin: 0; font-size: 0.8rem; color: var(--text-muted); }
.cpx-settings-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 4px; }

.cpx-settings-theme { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
.cpx-settings-theme-opt {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; border-radius: 10px;
  border: 1px solid var(--stroke); background: var(--surface);
  color: var(--text); font-size: 0.88rem; font-weight: 600; cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.cpx-settings-theme-opt--on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.cpx-settings-theme-ico { font-size: 1.1rem; line-height: 1; }

.cpx-settings-toggles { display: flex; flex-direction: column; gap: 4px; }
.cpx-settings-switch {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 10px 4px; cursor: pointer; border-radius: 8px;
}
.cpx-settings-switch input {
  margin-top: 3px; width: 16px; height: 16px; flex-shrink: 0; accent-color: var(--accent);
}
.cpx-settings-switch span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cpx-settings-switch strong { font-size: 0.88rem; font-weight: 600; color: var(--text-strong); }
.cpx-settings-switch em { font-style: normal; font-size: 0.76rem; color: var(--text-dim); line-height: 1.35; }

.cpx-settings-session { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 900px) { .cpx-settings-session { grid-template-columns: 1fr; } }
.cpx-settings-session-item { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.cpx-settings-session-item > strong { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
.cpx-settings-session-item > span { font-size: 0.9rem; color: var(--text-strong); font-weight: 600; }

.cpx-btn--inline { width: auto; max-width: none; margin-top: 0; padding: 11px 18px; font-size: 0.88rem; }
.cpx-btn--danger { background: var(--crimson, #c0392b); box-shadow: none; }
.cpx-btn--danger:hover:not(:disabled) { filter: brightness(1.08); }
.cpx-fin-pos { color: var(--cpx-emerald); font-weight: 600; }
.cpx-fin-neg { color: var(--crimson); font-weight: 600; }

.cpx-btn--sm { width: auto; padding: 11px 18px; flex-shrink: 0; margin-top: 0; }
`;
