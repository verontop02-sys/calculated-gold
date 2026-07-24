import { useCallback, useEffect, useRef, useState } from 'react';
import { api, connectPriceStream, onSessionExpired, onDeviceUnverified, pingApiHealth, isTransientProfileLoadError, resetAuthExpiredGate } from './api.js';
import { supabase } from './supabase.js';
import { readProfileCache, writeProfileCache, clearProfileCache } from './profileCache.js';
import { useToast } from './ToastContext.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import { Login } from './Login.jsx';
import { DeviceVerify } from './DeviceVerify.jsx';
import { CalculatorPage } from './CalculatorPage.jsx';
import { ContractPage } from './ContractPage.jsx';
import { Analytics } from './Analytics.jsx';
import { TeamPerformance } from './TeamPerformance.jsx';
import { ClientsPage } from './ClientsPage.jsx';
import { SettingsPage } from './SettingsPage.jsx';
import { GoldIndex } from './GoldIndex.jsx';
import { FintechAdminPage } from './FintechAdminPage.jsx';
import { SupportAdminPage } from './SupportAdminPage.jsx';
import { Dashboard } from './Dashboard.jsx';
import { EmployeeDeals } from './EmployeeDeals.jsx';
import { Sidebar } from './Sidebar.jsx';
import { MobileNav } from './MobileNav.jsx';
import { Profile, getShowInstructions } from './Profile.jsx';
import { Instructions } from './Instructions.jsx';
import { isSuperAdminRole, isUserManagerRole } from './roles.js';

const TAB_TITLES = {
  dashboard: 'Дашборд',
  calc: 'Калькулятор',
  contract: 'Договор',
  clients: 'Клиенты',
  analytics: 'Аналитика',
  team: 'Команда и KPI',
  employees: 'Сделки сотрудников',
  'gold-index': 'Индекс золота',
  settings: 'Настройки',
};

const TAB_SUBTITLES = {
  dashboard: 'Курс, KPI и сводка по всем разделам',
  calc: 'Расчёт выкупа и переход к оформлению',
  contract: 'Договор-квитанция, PDF и email',
  clients: 'База клиентов, поиск и история сделок',
  analytics: 'KPI, графики и выгрузка PDF',
  team: 'Сотрудники, рейтинг и динамика по дням',
  employees: 'Сделки сотрудников: суммы, фото и документы',
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

function FullscreenToggle() {
  const [isFull, setIsFull] = useState(false);

  useEffect(() => {
    function onChange() {
      setIsFull(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function toggle() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  return (
    <button
      type="button"
      className="cg-fullscreen-btn"
      onClick={toggle}
      title={isFull ? 'Выйти из полного экрана' : 'Полный экран'}
      aria-label={isFull ? 'Выйти из полного экрана' : 'Полный экран'}
    >
      {isFull ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
          <path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7V3h4"/><path d="M17 3h4v4"/>
          <path d="M21 17v4h-4"/><path d="M7 21H3v-4"/>
        </svg>
      )}
    </button>
  );
}

export default function App() {
  const toast = useToast();
  const [authReady, setAuthReady] = useState(false);
  const [sessionUser, setSessionUser] = useState(null);
  const [user, setUser] = useState(undefined);
  const [profileErr, setProfileErr] = useState(null);
  const [deviceVerifyNeeded, setDeviceVerifyNeeded] = useState(false);
  const [tab, setTab] = useState('dashboard'); // dashboard | calc | contract | clients | analytics | team | gold-index | settings
  const [contractPrefill, setContractPrefill] = useState(null);
  const [contractMounted, setContractMounted] = useState(false);
  const [quoteTab, setQuoteTab] = useState('moex');
  const [price, setPrice] = useState(null);
  const [priceErr, setPriceErr] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const staleRefreshingRef = useRef(false);
  const lastSignedInUidRef = useRef(null);
  const instructionsShownForUidRef = useRef(null);
  const [profileHintIdx, setProfileHintIdx] = useState(0);
  const [profilePatientNote, setProfilePatientNote] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
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

  // Обучающие подсказки при входе (один раз на сессию входа; отключаются в профиле)
  useEffect(() => {
    if (!user?.uid) return;
    if (instructionsShownForUidRef.current === user.uid) return;
    instructionsShownForUidRef.current = user.uid;
    if (getShowInstructions()) {
      const t = setTimeout(() => setInstructionsOpen(true), 700);
      return () => clearTimeout(t);
    }
  }, [user?.uid]);

  const loadMe = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      setUser(null);
      setProfileErr(null);
      setQuoteTab('moex');
      clearProfileCache();
      return;
    }
    const uid = session.user.id;
    setProfileErr(null);
    const cached = readProfileCache(uid);
    if (cached) {
      setUser(cached);
    } else {
      setUser(undefined);
    }
    void pingApiHealth({ timeout: 30_000 }).catch(() => {});
    const maxAttempts = cached ? 2 : 3;
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 400 + attempt * 600));
        }
        const { user: u } = await api.me();
        if (u) writeProfileCache(u);
        setUser(u ?? null);
        setProfileErr(null);
        return;
      } catch (e) {
        lastErr = e;
        console.error(e);
        if (e?.body?.code === 'device_unverified') {
          // Пароль верный, но устройство новое — нужен код с почты.
          setDeviceVerifyNeeded(true);
          setProfileErr(null);
          return;
        }
        const transient = isTransientProfileLoadError(e);
        if (!transient || attempt === maxAttempts - 1) {
          if (cached && transient) {
            // Сеть/API упали, но профиль уже есть — пускаем в панель, не блокируем.
            return;
          }
          setProfileErr(profileErrorMessage(e));
          setUser(null);
          setQuoteTab('moex');
          return;
        }
      }
    }
    if (cached) return;
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
        // 401 обрабатывает onSessionExpired — не дублируем тостом API-ошибки
        if (!silent && e?.status !== 401) toast(e.message, 'error');
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
        clearProfileCache();
        lastSignedInUidRef.current = null;
      }
      setSessionUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionUser(session?.user ?? null);
      setAuthReady(true);
    });
    const unsub = onSessionExpired(() => {
      void supabase.auth.signOut();
      toast('Сессия истекла, войдите снова', 'info');
    });
    const unsubDevice = onDeviceUnverified(() => setDeviceVerifyNeeded(true));
    return () => {
      subscription.unsubscribe();
      unsub();
      unsubDevice();
    };
  }, [toast]);

  // Сброс шага подтверждения устройства при выходе/смене аккаунта.
  useEffect(() => {
    if (!sessionUser?.id) setDeviceVerifyNeeded(false);
  }, [sessionUser?.id]);

  useEffect(() => {
    if (sessionUser?.id) resetAuthExpiredGate();
  }, [sessionUser?.id]);

  useEffect(() => {
    if (user?.uid) lastSignedInUidRef.current = user.uid;
  }, [user?.uid]);

  useEffect(() => {
    if (!authReady) return;
    loadMe();
  }, [authReady, sessionUser?.id, loadMe]);

  // Пока вкладка открыта — не даём Render уснуть (free tier).
  useEffect(() => {
    if (!user?.uid) return undefined;
    const id = setInterval(() => {
      void pingApiHealth({ timeout: 15_000 }).catch(() => {});
    }, 4 * 60 * 1000);
    return () => clearInterval(id);
  }, [user?.uid]);

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
    const t = setTimeout(() => setProfilePatientNote(true), 6_000);
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

  // Строгое обновление курса Мосбиржи раз в 5 минут: принудительно тянем свежее значение
  // с биржи (refresh) и подставляем его — так цифра всегда «подтягивается» к актуальной MOEX.
  useEffect(() => {
    if (!user || quoteTab !== 'moex') return;
    const id = setInterval(() => {
      api.refreshPrice()
        .then(() => loadPrice({ silent: true }))
        .catch(() => {});
    }, 5 * 60_000);
    return () => clearInterval(id);
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
    if ((tab === 'team' || tab === 'settings' || tab === 'fintech-clients' || tab === 'support-chat') && !isUserManagerRole(role)) {
      setTab('dashboard');
    } else if (tab === 'gold-index' && !isSuperAdminRole(role)) {
      setTab('dashboard');
    }
  }, [user, tab]);

  // Бейдж «непрочитанное в поддержке» для сайдбара (только у admin/super_admin).
  const [supportUnread, setSupportUnread] = useState(0);
  useEffect(() => {
    if (!user || !isUserManagerRole(user.role)) {
      setSupportUnread(0);
      return undefined;
    }
    let cancelled = false;
    const poll = () => {
      api.supportUnread()
        .then((out) => { if (!cancelled) setSupportUnread(out?.total || 0); })
        .catch(() => { /* бейдж не критичен */ });
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(id); };
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

  if (sessionUser && deviceVerifyNeeded) {
    return (
      <DeviceVerify
        onVerified={() => {
          setDeviceVerifyNeeded(false);
          setUser(undefined);
          loadMe();
        }}
        onSignOut={() => supabase.auth.signOut()}
      />
    );
  }

  if (sessionUser && user === undefined && !profileErr) {
    return (
      <div className="shell">
        <div className="glass load-card load-card--profile">
          <div className="load-card__progress-wrap">
            <div className="load-card__progress-bar" />
          </div>
          <p className="load-card__title">Загрузка панели</p>
          <p className="muted load-card__hint" key={profileHintIdx}>
            {PROFILE_LOAD_HINTS[profileHintIdx]}
          </p>
          {profilePatientNote && (
            <p className="muted small load-card__patient">
              Сервер просыпается после паузы — первый запуск занимает 30–60 сек. Не закрывайте вкладку.
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
        onOpenProfile={() => setProfileOpen(true)}
        supportUnread={supportUnread}
      />

      <div className="cg-shell__main">
        <header className="cg-topbar">
          <div className="cg-topbar__title">
            <span className="cg-topbar__logo" aria-hidden>
              <img src="/logo-reaktivo-mark.svg" alt="" />
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
            <FullscreenToggle />
            <ThemeToggle />
          </div>
        </header>

        <main className="cg-shell__content" key={tab}>
          <div className={`cg-section-anim cg-section cg-section--${tab}`}>
            {tab === 'dashboard' && (
              <Dashboard
                formatMoney={formatMoney}
                price={price}
                user={user}
                onNavigate={handleNav}
              />
            )}
            <div hidden={tab !== 'calc'}>
              <CalculatorPage
                formatMoney={formatMoney}
                price={price}
                userUid={user.uid}
                toast={toast}
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
            {tab === 'employees' && user && isUserManagerRole(user.role) && (
              <EmployeeDeals formatMoney={formatMoney} toast={toast} />
            )}
            {tab === 'gold-index' && isSuperAdminRole(user.role) && (
              <GoldIndex formatMoney={formatMoney} toast={toast} />
            )}
            {tab === 'settings' && isUserManagerRole(user.role) && (
              <SettingsPage user={user} formatMoney={formatMoney} price={price} />
            )}
            {tab === 'fintech-clients' && isUserManagerRole(user.role) && (
              <FintechAdminPage toast={toast} />
            )}
            {tab === 'support-chat' && isUserManagerRole(user.role) && (
              <SupportAdminPage toast={toast} />
            )}
          </div>
        </main>

        <MobileNav
          tab={tab}
          onChange={handleNav}
          user={user}
          onSignOut={handleSignOut}
          onOpenProfile={() => setProfileOpen(true)}
          supportUnread={supportUnread}
        />
      </div>

      <Profile
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={user}
        formatMoney={formatMoney}
        onSignOut={handleSignOut}
        onReplayInstructions={() => setInstructionsOpen(true)}
        onNameChange={(name) => setUser((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, displayName: name };
          writeProfileCache(updated);
          return updated;
        })}
      />
      <Instructions
        open={instructionsOpen}
        onClose={() => setInstructionsOpen(false)}
      />


      <style>{`
        /* ── Shell layout ─────────────────────────────────────────────────────── */
        .cg-shell {
          min-height: 100dvh;
          width: 100%;
          background: var(--bg-deep);
          background-image: var(--bg-gradient);
          background-attachment: fixed;
        }
        .cg-shell__main {
          padding-left: 0;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          transition: padding-left 0.26s cubic-bezier(0.4, 0.2, 0.2, 1);
        }
        .cg-shell--pinned .cg-shell__main { padding-left: 240px; }
        @media (max-width: 900px) {
          .cg-shell__main { padding-left: 0 !important; }
        }

        /* ── Topbar — Premium slim bar ────────────────────────────────────────── */
        .cg-topbar {
          display: grid;
          grid-template-columns: 1fr auto auto;
          align-items: center;
          gap: 12px;
          padding: 0 24px;
          height: 60px;
          border-bottom: 1px solid var(--stroke-soft);
          background: var(--bg-panel-solid);
          position: sticky;
          top: 0;
          z-index: 30;
        }
        .cg-topbar__title { min-width: 0; display: flex; align-items: center; gap: 10px; }
        .cg-topbar__title-text { min-width: 0; display: flex; align-items: baseline; gap: 10px; }
        .cg-topbar__logo { display: none; }
        .cg-topbar__logo img { width: 100%; height: 100%; object-fit: cover; }
        .cg-topbar__heading {
          font-size: 0.95rem;
          font-weight: 600;
          margin: 0;
          color: var(--text-strong);
          letter-spacing: -0.01em;
          white-space: nowrap;
        }
        .cg-topbar__sub {
          margin: 0;
          font-size: 0.78rem;
          color: var(--text-dim);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cg-topbar__actions { display: flex; align-items: center; gap: 8px; }
        .cg-fullscreen-btn {
          display: flex; align-items: center; justify-content: center;
          width: 34px; height: 34px;
          border: 1px solid var(--stroke-soft);
          border-radius: 8px;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: color 0.16s, background 0.16s, border-color 0.16s;
          flex-shrink: 0;
        }
        .cg-fullscreen-btn:hover { color: var(--text); background: var(--bg-elevated); border-color: var(--stroke); }

        /* ── Rate pill (right side of topbar) ──────────────────────────────────── */
        .cg-topbar__rate {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cg-quote-tabs {
          display: flex;
          gap: 2px;
          padding: 2px;
          border-radius: 8px;
          background: var(--stroke-soft);
          border: 1px solid var(--stroke-soft);
        }
        .cg-quote-tab {
          padding: 4px 10px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          white-space: nowrap;
        }
        .cg-quote-tab:hover:not(.cg-quote-tab--active) { color: var(--text); }
        .cg-quote-tab--active {
          background: var(--bg-panel-solid);
          color: var(--text-strong);
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }

        /* Rate value — compact single line */
        .cg-rate {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 12px;
          border-radius: 8px;
          background: var(--stroke-soft);
          border: 1px solid var(--stroke);
        }
        .cg-rate__main {
          display: flex;
          align-items: baseline;
          gap: 5px;
          min-width: 0;
        }
        .cg-rate__label {
          font-size: 0.68rem;
          color: var(--text-dim);
          white-space: nowrap;
          line-height: 1;
        }
        .cg-rate__value {
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--text-strong);
          line-height: 1;
          display: flex;
          align-items: baseline;
          gap: 2px;
          font-variant-numeric: tabular-nums;
        }
        .cg-rate--loading .cg-rate__value { opacity: 0.6; }
        .cg-rate--stale .cg-rate__value { opacity: 0.65; }
        .cg-rate__per { font-size: 0.72rem; color: var(--text-dim); font-weight: 500; }
        .cg-rate__skel { display: inline-block; min-width: 70px; height: 1em; vertical-align: middle; border-radius: 4px; }
        .cg-rate__sub { display: none; }
        .cg-rate__actions { display: flex; align-items: center; gap: 4px; }
        .cg-rate__refresh {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 5px 10px;
          border-radius: 7px;
          border: 1px solid var(--stroke);
          background: transparent;
          color: var(--text-muted);
          font-size: 0.72rem;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .cg-rate__refresh:hover:not(:disabled) {
          color: var(--text);
          border-color: var(--stroke-strong);
          background: var(--stroke-soft);
        }
        .cg-rate__refresh:active:not(:disabled) { opacity: 0.8; }
        .cg-rate__refresh:disabled { opacity: 0.45; cursor: not-allowed; }
        .cg-rate__refresh:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

        /* ── Content area ─────────────────────────────────────────────────────── */
        .cg-shell__content {
          flex: 1;
          padding: 28px 28px 40px;
          width: 100%;
          box-sizing: border-box;
        }
        .cg-section { margin: 0 auto; width: 100%; }
        .cg-section--dashboard { max-width: 1280px; }
        .cg-section--calc { max-width: 1100px; }
        .cg-section--contract { max-width: 1300px; }
        .cg-section--clients { max-width: 1300px; }
        .cg-section--analytics { max-width: 1200px; }
        .cg-section--team { max-width: 1100px; }
        .cg-section--gold-index { max-width: 1400px; }
        .cg-section--settings { max-width: 1200px; }
        .cg-section-anim {
          animation: cgSectionIn 580ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
          will-change: transform, opacity;
          backface-visibility: hidden;
        }
        @keyframes cgSectionIn {
          from { opacity: 0; transform: translate3d(0, 8px, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        .muted { color: var(--text-muted); }
        .small { font-size: 0.78rem; }

        /* ── Responsive tablet ────────────────────────────────────────────────── */
        @media (max-width: 1100px) {
          .cg-topbar { padding: 0 16px; gap: 8px; }
          .cg-shell__content { padding: 20px 16px 32px; }
          .cg-rate__refresh-label { display: none; }
          .cg-rate__refresh { width: 30px; height: 30px; padding: 0; }
        }

        /* ── Responsive mobile ────────────────────────────────────────────────── */
        @media (max-width: 900px) {
          .cg-topbar {
            grid-template-columns: auto 1fr auto;
            grid-template-areas: "logo title actions" "rate rate rate";
            height: auto;
            padding: 10px 14px 12px;
            gap: 10px;
          }
          .cg-topbar__title { grid-area: title; }
          .cg-topbar__actions { grid-area: actions; }
          .cg-topbar__rate {
            grid-area: rate;
            flex-direction: column;
            align-items: stretch;
            gap: 6px;
          }
          .cg-topbar__sub { display: none; }
          .cg-topbar__logo {
            grid-area: logo;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px; height: 32px;
            border-radius: 8px;
            background: var(--accent);
            flex-shrink: 0;
          }
          .cg-topbar__logo img { width: 22px; height: 22px; }
          .cg-shell__content { padding: 14px 12px calc(90px + env(safe-area-inset-bottom, 0)); }
          .cg-quote-tabs { width: 100%; box-sizing: border-box; }
          .cg-quote-tab { flex: 1; text-align: center; padding: 6px 8px; font-size: 0.74rem; }
          .cg-rate { width: 100%; box-sizing: border-box; padding: 7px 10px; justify-content: space-between; }
          .cg-rate__main { flex: 1; min-width: 0; }
        }

        @media (max-width: 520px) {
          .cg-rate__label { display: none; }
          .cg-quote-tabs { gap: 1px; }
        }
      `}</style>
    </div>
  );
}
