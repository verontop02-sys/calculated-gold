import { useCallback, useEffect, useRef, useState } from 'react';
import { api, connectPriceStream, onSessionExpired, pingApiHealth, isTransientProfileLoadError } from './api.js';
import { supabase } from './supabase.js';
import { useToast } from './ToastContext.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import { Login } from './Login.jsx';
import { CalculatorPage } from './CalculatorPage.jsx';
import { ContractPage } from './ContractPage.jsx';
import { Analytics } from './Analytics.jsx';
import { TeamPerformance } from './TeamPerformance.jsx';
import { ClientsPage } from './ClientsPage.jsx';
import { SettingsPage } from './SettingsPage.jsx';
import { GoldIndex } from './GoldIndex.jsx';
import { Sidebar } from './Sidebar.jsx';
import { MobileNav } from './MobileNav.jsx';
import { isSuperAdminRole, isUserManagerRole } from './roles.js';

const TAB_TITLES = {
  calc: 'Калькулятор',
  contract: 'Договор',
  clients: 'Клиенты',
  analytics: 'Аналитика',
  team: 'Команда и KPI',
  'gold-index': 'Индекс золота',
  settings: 'Настройки',
};

const TAB_SUBTITLES = {
  calc: 'Расчёт выкупа и переход к оформлению',
  contract: 'Договор-квитанция, PDF и email',
  clients: 'База клиентов, поиск и история сделок',
  analytics: 'KPI, графики и выгрузка PDF',
  team: 'Сотрудники, рейтинг и динамика по дням',
  'gold-index': 'Цены конкурентов по городам, карта',
  settings: 'Политика выкупа, пользователи и доступы',
};

function tabSubtitle(tab) { return TAB_SUBTITLES[tab] || ''; }

function formatMoney(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatAge(isoStr) {
  if (!isoStr) return '';
  const ms = Date.now() - new Date(isoStr).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'только что';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hr = Math.floor(min / 60);
  return `${hr} ч назад`;
}

function formatRuDateFromIso(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return '';
  const [y, m, d] = String(iso).split('-');
  return `${d}.${m}.${y}`;
}

function rateBannerTitle(price) {
  if (!price?.goldRubPerGram) return 'Курс чистого золота';
  if (price.source === 'xaut') return 'XAUT (Tether Gold), USD → ₽';
  if (price.source === 'moex') return 'Мосбиржа, фьючерс GLDRUBF';
  if (price.fallbackFrom === 'moex') return 'ЦБ РФ, резерв';
  return 'ЦБ РФ, чистое золото';
}

function rateBannerSubtitle(price) {
  if (!price) return '';
  if (price.source === 'xaut') {
    const usd = price.xautUsdPerOz != null ? Math.round(price.xautUsdPerOz) : '';
    const rub = price.cbrUsdRub != null ? String(price.cbrUsdRub).replace('.', ',') : '';
    const d = price.cbrDate || '';
    if (usd && rub && d) return `~${usd} USD/oz · ЦБ ${rub} ₽/$ · ${d}`;
    if (price.cachedAt) return `Обновлено ${formatAge(price.cachedAt)}`;
    return '';
  }
  if (price.source === 'moex') {
    const d = formatRuDateFromIso(price.moexTradeDate);
    const t =
      price.moexSysTime && String(price.moexSysTime).includes(' ')
        ? String(price.moexSysTime).slice(11, 19)
        : '';
    if (d && t) return `Сессия ${d} · ${t} МСК`;
    if (price.cachedAt) return `Обновлено ${formatAge(price.cachedAt)}`;
    return d ? `Сессия ${d}` : '';
  }
  if (price.cbrDate) {
    const age = price.cachedAt ? ` · ${formatAge(price.cachedAt)}` : '';
    return `Дата ЦБ: ${price.cbrDate}${age}`;
  }
  if (price.cachedAt) return formatAge(price.cachedAt);
  return '';
}

function quoteTabKey(uid) {
  if (!uid) return null;
  const safe = String(uid).replace(/[^a-zA-Z0-9-]/g, '');
  return safe ? `cg_quote_tab__${safe}` : null;
}

const PROFILE_LOAD_HINTS = [
  'Подключаемся к серверу…',
  'Проверяем доступ и права в панели…',
  'Загружаем ваш профиль…',
];

function profileErrorMessage(e) {
  if (e?.code === 'API_TIMEOUT') {
    return 'Сервер долго не отвечает. Проверьте интернет и нажмите «Повторить» или обновите страницу.';
  }
  if (isTransientProfileLoadError(e)) {
    return 'Не удалось связаться с сервером. Нажмите «Повторить».';
  }
  return (
    e?.message ||
    'Не удалось загрузить профиль. Проверьте Node API, миграцию Supabase (profiles, app_kv) и SUPABASE_SERVICE_ROLE_KEY на сервере.'
  );
}

function clearCalculatorLocalForUid(uid) {
  if (!uid) return;
  const safe = String(uid).replace(/[^a-zA-Z0-9-]/g, '');
  if (!safe) return;
  try {
    localStorage.removeItem(`cg_weight__${safe}`);
    localStorage.removeItem(`cg_purity__${safe}`);
  } catch {
    /* ignore */
  }
}

export default function App() {
  const toast = useToast();
  const [authReady, setAuthReady] = useState(false);
  const [sessionUser, setSessionUser] = useState(null);
  const [user, setUser] = useState(undefined);
  const [profileErr, setProfileErr] = useState(null);
  const [tab, setTab] = useState('calc'); // calc | contract | clients | analytics | team | gold-index | settings
  const [contractPrefill, setContractPrefill] = useState(null);
  const [contractMounted, setContractMounted] = useState(false);
  const [quoteTab, setQuoteTab] = useState('moex');
  const [price, setPrice] = useState(null);
  const [priceErr, setPriceErr] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const staleRefreshingRef = useRef(false);
  const lastSignedInUidRef = useRef(null);
  const [profileHintIdx, setProfileHintIdx] = useState(0);
  const [profilePatientNote, setProfilePatientNote] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    try {
      const v = localStorage.getItem('cg_sidebar_pinned');
      // По умолчанию sidebar закреплён раскрытым — так контент стабильно сдвинут
      // и иконки/подписи не наезжают на topbar при наведении.
      return v == null ? true : v === '1';
    } catch { return true; }
  });

  // Вкладка котировки — на пользователя; иначе после смены аккаунта в том же браузере тянется чужой xaut/moex из React state
  useEffect(() => {
    if (!user?.uid) return;
    const k = quoteTabKey(user.uid);
    if (!k) return;
    const saved = localStorage.getItem(k);
    if (saved === 'moex' || saved === 'xaut') setQuoteTab(saved);
    else setQuoteTab('moex');
  }, [user?.uid]);

  const loadMe = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      setUser(null);
      setProfileErr(null);
      setQuoteTab('moex');
      return;
    }
    setProfileErr(null);
    setUser(undefined);
    void pingApiHealth({ timeout: 30_000 }).catch(() => {});
    const maxAttempts = 3;
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 1000 + attempt * 1000));
        }
        const { user: u } = await api.me();
        setUser(u ?? null);
        return;
      } catch (e) {
        lastErr = e;
        console.error(e);
        const transient = isTransientProfileLoadError(e);
        if (!transient || attempt === maxAttempts - 1) {
          setProfileErr(profileErrorMessage(e));
          setUser(null);
          setQuoteTab('moex');
          return;
        }
      }
    }
    setProfileErr(profileErrorMessage(lastErr));
    setUser(null);
    setQuoteTab('moex');
  }, []);

  const loadPrice = useCallback(
    async (opts = {}) => {
      const silent = opts.silent === true;
      if (!sessionUser || user == null) return;
      if (!silent) setPriceLoading(true);
      try {
        const p = await api.price({ quote: quoteTab === 'xaut' ? 'xaut' : 'moex' });
        setPrice(p);
        setPriceErr(p.error || null);
      } catch (e) {
        setPriceErr(e.message);
        setPrice(null);
        if (!silent) toast(e.message, 'error');
      } finally {
        if (!silent) setPriceLoading(false);
      }
    },
    [sessionUser, user, toast, quoteTab],
  );

  function persistQuoteTab(next) {
    setQuoteTab(next);
    const k = user?.uid ? quoteTabKey(user.uid) : null;
    if (k) localStorage.setItem(k, next);
  }

  const handleRefreshPrice = useCallback(async () => {
    if (!user) return;
    setRefreshBusy(true);
    setPriceErr(null);
    try {
      await api.refreshPrice();
      await loadPrice({ silent: true });
      // После ручного обновления не показываем «Кэш»: GET может ещё вернуть stale из-за TTL/задержки чтения из БД
      setPrice((prev) => (prev ? { ...prev, stale: false } : prev));
      toast('Курс обновлён', 'success');
    } catch (e) {
      const msg = e?.message || String(e);
      setPriceErr(msg);
      toast(msg, 'error');
    } finally {
      setRefreshBusy(false);
    }
  }, [user, loadPrice, toast]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthReady(true);
      // TOKEN_REFRESHED fires when tab returns to focus; avoid treating it as profile change.
      if (event === 'TOKEN_REFRESHED') return;
      if (event === 'SIGNED_OUT') {
        clearCalculatorLocalForUid(lastSignedInUidRef.current);
        lastSignedInUidRef.current = null;
      }
      setSessionUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionUser(session?.user ?? null);
      setAuthReady(true);
    });
    const unsub = onSessionExpired(() => {
      supabase.auth.signOut();
      toast('Сессия истекла, войдите снова', 'info');
    });
    return () => {
      subscription.unsubscribe();
      unsub();
    };
  }, [toast]);

  useEffect(() => {
    if (user?.uid) lastSignedInUidRef.current = user.uid;
  }, [user?.uid]);

  useEffect(() => {
    if (!authReady) return;
    loadMe();
  }, [authReady, sessionUser?.id, loadMe]);

  useEffect(() => {
    if (!sessionUser || user !== undefined || profileErr) return undefined;
    setProfileHintIdx(0);
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % PROFILE_LOAD_HINTS.length;
      setProfileHintIdx(i);
    }, 4500);
    return () => clearInterval(id);
  }, [sessionUser?.id, user, profileErr]);

  useEffect(() => {
    if (!sessionUser || user !== undefined || profileErr) {
      setProfilePatientNote(false);
      return undefined;
    }
    const t = setTimeout(() => setProfilePatientNote(true), 28_000);
    return () => clearTimeout(t);
  }, [sessionUser?.id, user, profileErr]);

  useEffect(() => {
    if (!user) return;
    loadPrice({ silent: false });
  }, [user, quoteTab, loadPrice]);

  useEffect(() => {
    if (!user || quoteTab !== 'moex') return;

    let close = null;
    let retryTimer = null;
    let pollTimer = null;
    let sseAttempts = 0;

    function startPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(() => loadPrice({ silent: true }), 60_000);
    }

    async function connectSse() {
      sseAttempts += 1;
      try {
        close = await connectPriceStream(
          (data) => {
            sseAttempts = 0;
            setPrice(data);
            setPriceErr(data.error || data.lastRefreshError || null);
          },
          (status) => {
            if (status === 401 || sseAttempts >= 3) {
              startPolling();
            } else {
              retryTimer = setTimeout(connectSse, 15_000);
            }
          },
        );
      } catch {
        startPolling();
      }
    }

    connectSse();

    return () => {
      close?.();
      clearTimeout(retryTimer);
      clearInterval(pollTimer);
    };
  }, [user, quoteTab, loadPrice]);

  useEffect(() => {
    if (!user || quoteTab !== 'xaut') return;
    const pollTimer = setInterval(() => loadPrice({ silent: true }), 90_000);
    return () => clearInterval(pollTimer);
  }, [user, quoteTab, loadPrice]);

  useEffect(() => {
    if (quoteTab !== 'moex') return;
    if (!user) return;
    if (!price?.stale || !price?.goldRubPerGram || staleRefreshingRef.current) return;
    staleRefreshingRef.current = true;
    api.refreshPrice()
      .then(() => loadPrice({ silent: true }))
      .then(() => {
        setPrice((prev) => (prev ? { ...prev, stale: false } : prev));
      })
      .catch(() => {})
      .finally(() => { staleRefreshingRef.current = false; });
  }, [quoteTab, price?.stale, price?.goldRubPerGram, loadPrice, user]);

  // Если активный tab оказался запрещён для текущей роли — мягко вернёмся на «Калькулятор».
  // ВАЖНО: этот useEffect должен быть ДО early-returns, иначе сломаются Rules of Hooks.
  useEffect(() => {
    if (!user) return;
    const role = user.role;
    if ((tab === 'team' || tab === 'settings') && !isUserManagerRole(role)) {
      setTab('calc');
    } else if (tab === 'gold-index' && !isSuperAdminRole(role)) {
      setTab('calc');
    }
  }, [user, tab]);

  if (!authReady) {
    return (
      <div className="shell">
        <div className="glass load-card">
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p className="muted">Загрузка…</p>
        </div>
      </div>
    );
  }

  if (sessionUser && user === undefined && !profileErr) {
    return (
      <div className="shell">
        <div className="glass load-card load-card--profile">
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p className="load-card__title">Загрузка панели</p>
          <p className="muted load-card__hint" key={profileHintIdx}>
            {PROFILE_LOAD_HINTS[profileHintIdx]}
          </p>
          {profilePatientNote && (
            <p className="muted small load-card__patient">
              После долгой паузы первый вход иногда до двух минут — оставьте вкладку открытой.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (sessionUser && profileErr) {
    return (
      <div className="shell">
        <div className="glass load-card load-card--profile-err" style={{ maxWidth: 440 }}>
          <p className="err-text" style={{ marginBottom: 18, lineHeight: 1.55 }}>
            {profileErr}
          </p>
          <div className="load-card__actions">
            <button type="button" className="btn-primary" onClick={() => loadMe()}>
              Повторить
            </button>
            <button type="button" className="btn-ghost" onClick={() => supabase.auth.signOut()}>
              Выйти
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!sessionUser || !user) {
    return <Login />;
  }

  function handleSignOut() {
    supabase.auth.signOut();
  }

  function handleNav(next) {
    if (next === 'contract') setContractMounted(true);
    if (next === 'team' && !isUserManagerRole(user.role)) return;
    if (next === 'settings' && !isUserManagerRole(user.role)) return;
    if (next === 'gold-index' && !isSuperAdminRole(user.role)) return;
    setTab(next);
    requestAnimationFrame(() => {
      document.querySelector('.cg-shell__content')?.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  return (
    <div className={`cg-shell${sidebarPinned ? ' cg-shell--pinned' : ''}`}>
      <Sidebar
        tab={tab}
        onChange={handleNav}
        user={user}
        onSignOut={handleSignOut}
        onPinnedChange={setSidebarPinned}
      />

      <div className="cg-shell__main">
        <header className="cg-topbar">
          <div className="cg-topbar__title">
            <span className="cg-topbar__logo" aria-hidden>
              <img src="/logo_reactivo1.png" alt="REAKTIVO PRO" />
            </span>
            <div className="cg-topbar__title-text">
              <h1 className="cg-topbar__heading">{TAB_TITLES[tab] || 'Панель'}</h1>
              <p className="cg-topbar__sub muted">{tabSubtitle(tab)}</p>
            </div>
          </div>

          <div className="cg-topbar__rate">
            <div className="cg-quote-tabs" role="tablist" aria-label="Источник котировки">
              <button
                type="button"
                role="tab"
                aria-selected={quoteTab === 'moex'}
                className={`cg-quote-tab${quoteTab === 'moex' ? ' cg-quote-tab--active' : ''}`}
                onClick={() => persistQuoteTab('moex')}
                title="Котировка Мосбиржи (GLDRUBF)"
              >
                Мосбиржа
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={quoteTab === 'xaut'}
                className={`cg-quote-tab${quoteTab === 'xaut' ? ' cg-quote-tab--active' : ''}`}
                onClick={() => persistQuoteTab('xaut')}
                title="XAUT (Tether Gold) в долларах × курс ЦБ"
              >
                XAUT
              </button>
            </div>

            <div className={`cg-rate${priceLoading ? ' cg-rate--loading' : ''}${price?.stale && !priceLoading ? ' cg-rate--stale' : ''}`}>
              <div className="cg-rate__main">
                <span className="cg-rate__label muted">{rateBannerTitle(price)}</span>
                <p className="cg-rate__value mono-nums">
                  {priceLoading ? (
                    <>
                      <span className="skeleton-line cg-rate__skel" />
                      <span className="cg-rate__per"> / г</span>
                    </>
                  ) : (
                    <>
                      {price?.goldRubPerGram != null ? formatMoney(price.goldRubPerGram) : '—'}
                      <span className="cg-rate__per"> / г</span>
                    </>
                  )}
                </p>
                {!priceLoading && price?.goldRubPerGram != null && rateBannerSubtitle(price) && (
                  <span className="muted small cg-rate__sub">{rateBannerSubtitle(price)}</span>
                )}
                {priceLoading && <span className="muted small cg-rate__sub">Получаем курс…</span>}
              </div>

              <div className="cg-rate__actions">
                {price?.stale && !priceLoading && (
                  <span className="badge warn" title="Кэш, идёт обновление">
                    {staleRefreshingRef.current ? <><span className="spinner inline" style={{width:'0.6em',height:'0.6em',borderWidth:'1.5px'}} /> Обновляем</> : 'Кэш'}
                  </span>
                )}
                {priceErr && !priceLoading && !price?.goldRubPerGram && <span className="badge danger" title={priceErr}>Ошибка</span>}
                <button
                  type="button"
                  className="cg-rate__refresh"
                  disabled={refreshBusy || priceLoading}
                  onClick={handleRefreshPrice}
                  title="Запросить свежий курс с биржи"
                >
                  {refreshBusy ? (
                    <>
                      <span className="spinner inline" /> <span className="cg-rate__refresh-label">Обновление…</span>
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                        <path d="M16 21h5v-5" />
                      </svg>
                      <span className="cg-rate__refresh-label">Обновить</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="cg-topbar__actions">
            <ThemeToggle />
          </div>
        </header>

        <main className="cg-shell__content" key={tab}>
          <div className={`cg-section-anim cg-section cg-section--${tab}`}>
            <div hidden={tab !== 'calc'}>
              <CalculatorPage
                formatMoney={formatMoney}
                price={price}
                userUid={user.uid}
                onGoToContract={(payload) => {
                  setContractMounted(true);
                  setContractPrefill(payload);
                  setTab('contract');
                }}
              />
            </div>
            {contractMounted && (
              <div hidden={tab !== 'contract'}>
                <ContractPage
                  formatMoney={formatMoney}
                  prefill={contractPrefill}
                  onConsumedPrefill={() => setContractPrefill(null)}
                  toast={toast}
                  price={price}
                  user={user}
                />
              </div>
            )}
            {tab === 'clients' && <ClientsPage formatMoney={formatMoney} toast={toast} />}
            {tab === 'analytics' && <Analytics formatMoney={formatMoney} toast={toast} />}
            {tab === 'team' && user && isUserManagerRole(user.role) && (
              <TeamPerformance formatMoney={formatMoney} toast={toast} user={user} />
            )}
            {tab === 'gold-index' && isSuperAdminRole(user.role) && (
              <GoldIndex formatMoney={formatMoney} toast={toast} />
            )}
            {tab === 'settings' && isUserManagerRole(user.role) && (
              <SettingsPage user={user} formatMoney={formatMoney} price={price} />
            )}
          </div>
        </main>

        <MobileNav
          tab={tab}
          onChange={handleNav}
          user={user}
          onSignOut={handleSignOut}
        />
      </div>


      <style>{`
        /* Shell: sidebar (fixed left) + main content with padding-left */
        .cg-shell {
          min-height: 100dvh;
          width: 100%;
          background: var(--bg-deep);
          background-image: var(--bg-gradient);
        }
        .cg-shell__main {
          padding-left: 64px;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          transition: padding-left 0.22s cubic-bezier(0.4, 0.2, 0.2, 1);
        }
        .cg-shell--pinned .cg-shell__main { padding-left: 232px; }
        @media (max-width: 900px) {
          .cg-shell__main { padding-left: 0 !important; }
        }

        /* Topbar */
        .cg-topbar {
          display: grid;
          grid-template-columns: 1fr auto auto;
          align-items: center;
          gap: 16px;
          padding: 18px 28px;
          border-bottom: 1px solid var(--sidebar-stroke);
          background: var(--bg-panel);
          -webkit-backdrop-filter: blur(18px);
          backdrop-filter: blur(18px);
          position: sticky;
          top: 0;
          z-index: 30;
        }
        .cg-topbar__title { min-width: 0; display: flex; align-items: center; gap: 12px; }
        .cg-topbar__title-text { min-width: 0; }
        /* Лого в топбаре — только на мобиле (на ПК лого живёт в сайдбаре) */
        .cg-topbar__logo { display: none; }
        .cg-topbar__logo img { width: 100%; height: 100%; object-fit: contain; padding: 4px; box-sizing: border-box; }
        .cg-topbar__heading {
          font-family: var(--font-display);
          font-size: clamp(1.2rem, 1rem + 1vw, 1.55rem);
          font-weight: 600;
          margin: 0;
          color: var(--text-strong);
          letter-spacing: -0.012em;
          line-height: 1.18;
        }
        .cg-topbar__sub {
          margin: 3px 0 0;
          font-size: 0.83rem;
          color: var(--text-muted);
          line-height: 1.4;
          letter-spacing: 0.005em;
        }
        .cg-topbar__actions { display: flex; align-items: center; gap: 12px; }

        /* Rate widget (inline in topbar) */
        .cg-topbar__rate {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          border-radius: 16px;
          background: var(--surface);
          border: 1px solid var(--stroke);
          box-shadow: 0 2px 16px rgba(0,0,0,0.04);
        }
        .cg-quote-tabs {
          display: flex;
          gap: 4px;
          padding: 3px;
          border-radius: 10px;
          background: var(--input-bg);
          border: 1px solid var(--stroke-soft);
        }
        .cg-quote-tab {
          padding: 6px 12px;
          border-radius: 7px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 0.74rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: background 0.18s, color 0.18s;
        }
        .cg-quote-tab:hover:not(.cg-quote-tab--active) { color: var(--text); }
        .cg-quote-tab--active {
          background: var(--gold-soft);
          color: var(--gold);
          box-shadow: 0 1px 4px var(--gold-glow);
        }

        .cg-rate { display: flex; align-items: center; gap: 14px; }
        .cg-rate__main { display: flex; flex-direction: column; min-width: 0; }
        .cg-rate__label {
          font-size: 0.62rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          line-height: 1;
        }
        .cg-rate__value {
          font-family: var(--font-display);
          font-size: 1.55rem;
          font-weight: 700;
          margin: 2px 0 0;
          color: var(--gold);
          text-shadow: 0 0 30px var(--gold-glow);
          line-height: 1.05;
          display: flex;
          align-items: baseline;
          gap: 3px;
        }
        .cg-rate--loading .cg-rate__value { text-shadow: none; }
        .cg-rate--stale .cg-rate__value { opacity: 0.7; }
        .cg-rate__per { font-size: 0.78rem; color: var(--text-muted); font-weight: 500; }
        .cg-rate__skel { display: inline-block; min-width: 90px; height: 1.45rem; vertical-align: middle; }
        .cg-rate__sub { font-size: 0.7rem; margin-top: 1px; line-height: 1.1; }
        .cg-rate__actions { display: flex; align-items: center; gap: 6px; }
        .cg-rate__refresh {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          border-radius: 999px;
          border: 1px solid var(--stroke-strong);
          background: var(--gold-soft);
          color: var(--gold);
          font-size: 0.74rem;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.18s, border-color 0.18s, box-shadow 0.18s, transform 0.12s;
        }
        .cg-rate__refresh:hover:not(:disabled) {
          border-color: var(--gold);
          box-shadow: 0 2px 12px var(--gold-glow);
        }
        .cg-rate__refresh:active:not(:disabled) { transform: scale(0.96); }
        .cg-rate__refresh:disabled { opacity: 0.55; cursor: not-allowed; }
        .cg-rate__refresh:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }

        /* Content */
        .cg-shell__content {
          flex: 1;
          padding: 28px 28px 32px;
          overflow-y: auto;
          width: 100%;
          box-sizing: border-box;
        }
        .cg-section {
          margin: 0 auto;
          width: 100%;
        }
        /* Каждый раздел получает оптимальную ширину контента */
        .cg-section--calc { max-width: 1100px; }
        .cg-section--contract { max-width: 1300px; }
        .cg-section--clients { max-width: 1300px; }
        .cg-section--analytics { max-width: 1200px; }
        .cg-section--team { max-width: 1100px; }
        .cg-section--gold-index { max-width: 1400px; }
        .cg-section--settings { max-width: 1200px; }
        .cg-section-anim {
          animation: cgSectionIn 680ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
          will-change: transform, opacity;
          backface-visibility: hidden;
        }
        @keyframes cgSectionIn {
          from { opacity: 0; transform: translate3d(0, 6px, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        /* Reset legacy styles from разделы, which expected .shell wrapper */
        .muted { color: var(--text-muted); }
        .small { font-size: 0.78rem; }

        /* Responsive — tablet */
        @media (max-width: 1100px) {
          .cg-topbar { padding: 14px 18px; gap: 12px; }
          .cg-shell__content { padding: 22px 18px 28px; }
          .cg-rate__value { font-size: 1.35rem; }
          .cg-rate__refresh-label { display: none; }
          .cg-rate__refresh { width: 32px; height: 32px; padding: 0; justify-content: center; }
        }

        /* Responsive — mobile */
        @media (max-width: 900px) {
          .cg-shell { flex-direction: column; }
          .cg-topbar {
            grid-template-columns: 1fr auto;
            grid-template-areas:
              "title actions"
              "rate rate";
            padding: 12px 14px;
            gap: 10px;
          }
          .cg-topbar__title { grid-area: title; }
          .cg-topbar__actions { grid-area: actions; }
          .cg-topbar__rate { grid-area: rate; padding: 6px 10px; gap: 10px; flex-wrap: nowrap; }
          /* clamp в основном правиле уже учитывает мобилу */
          .cg-topbar__sub { display: none; }
          /* Лого возвращаем в шапку — сайдбар на мобиле скрыт */
          .cg-topbar__logo {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 34px; height: 34px;
            border-radius: 9px;
            background: #fff;
            border: 1px solid var(--stroke);
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            flex-shrink: 0;
          }
          .cg-shell__content {
            padding: 16px 14px calc(96px + env(safe-area-inset-bottom, 0));
          }
          .cg-quote-tab { padding: 5px 10px; font-size: 0.72rem; }
          .cg-rate__value { font-size: 1.25rem; }
          .cg-rate__sub { display: none; }
        }

        @media (max-width: 520px) {
          /* Биржу оставляем доступной и на узких экранах — компактнее */
          .cg-topbar__rate { padding: 5px 8px; gap: 8px; }
          .cg-quote-tabs { padding: 2px; gap: 2px; }
          .cg-quote-tab { padding: 5px 8px; font-size: 0.68rem; }
          .cg-rate { gap: 8px; }
          .cg-rate__label { display: none; }
          .cg-rate__value { font-size: 1.05rem; }
        }
      `}</style>
    </div>
  );
}
