import { useCallback, useEffect, useRef, useState } from 'react';
import { api, connectPriceStream, onSessionExpired } from './api.js';
import { supabase } from './supabase.js';
import { useToast } from './ToastContext.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import { Login } from './Login.jsx';
import { Calculator } from './Calculator.jsx';
import { SettingsPanel } from './SettingsPanel.jsx';
import { isSuperAdminRole, isUserManagerRole } from './roles.js';

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

export default function App() {
  const toast = useToast();
  const [authReady, setAuthReady] = useState(false);
  const [sessionUser, setSessionUser] = useState(null);
  const [user, setUser] = useState(undefined);
  const [profileErr, setProfileErr] = useState(null);
  const [tab, setTab] = useState('calc');
  const [quoteTab, setQuoteTab] = useState('moex');
  const [price, setPrice] = useState(null);
  const [priceErr, setPriceErr] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const staleRefreshingRef = useRef(false);

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
    try {
      const { user: u } = await api.me();
      setUser(u ?? null);
    } catch (e) {
      console.error(e);
      setProfileErr(
        e?.message ||
          'Не удалось загрузить профиль. Проверьте Node API, миграцию Supabase (profiles, app_kv) и SUPABASE_SERVICE_ROLE_KEY на сервере.'
      );
      setUser(null);
      setQuoteTab('moex');
    }
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
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
      setAuthReady(true);
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
    if (!authReady) return;
    loadMe();
  }, [authReady, sessionUser, loadMe]);

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
      .catch(() => {})
      .finally(() => { staleRefreshingRef.current = false; });
  }, [quoteTab, price?.stale, price?.goldRubPerGram, loadPrice, user]);

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
        <div className="glass load-card">
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p className="muted">Загрузка профиля…</p>
        </div>
      </div>
    );
  }

  if (sessionUser && profileErr) {
    return (
      <div className="shell">
        <div className="glass load-card" style={{ maxWidth: 420 }}>
          <p className="err-text" style={{ marginBottom: 16, lineHeight: 1.5 }}>
            {profileErr}
          </p>
          <button type="button" className="btn-primary" onClick={() => supabase.auth.signOut()}>
            Выйти и войти снова
          </button>
        </div>
        <style>{`
          .err-text { color: var(--danger); font-size: 0.95rem; }
        `}</style>
      </div>
    );
  }

  if (!sessionUser || !user) {
    return <Login onSuccess={loadMe} />;
  }

  return (
    <div className="shell">
      <header className="topbar glass">
        <div className="brand">
          <span className="brand-mark">
            <img src="/logo_reactivo1.png" alt="REAKTIVO PRO" />
          </span>
          <div>
            <h1 className="brand-title">
              REAKTIVO <span className="brand-title-pro">PRO</span>
            </h1>
            <p className="brand-sub muted">Закрытая панель оценки</p>
          </div>
        </div>
        <div className="topbar-right">
          <ThemeToggle />
          <span className="user-pill">{user.email}</span>
          <button type="button" className="btn-ghost" onClick={() => supabase.auth.signOut()}>
            Выйти
          </button>
        </div>
      </header>

      <section className={`rate-banner glass${priceLoading ? ' is-loading' : ''}${price?.stale && !priceLoading ? ' is-stale' : ''}`}>
        <div className="quote-tabs" role="tablist" aria-label="Источник котировки">
          <button
            type="button"
            role="tab"
            aria-selected={quoteTab === 'moex'}
            className={quoteTab === 'moex' ? 'quote-tab active' : 'quote-tab'}
            onClick={() => persistQuoteTab('moex')}
            title="Переключить на котировку Мосбиржи (GLDRUBF)"
          >
            Мосбиржа
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={quoteTab === 'xaut'}
            className={quoteTab === 'xaut' ? 'quote-tab active' : 'quote-tab'}
            onClick={() => persistQuoteTab('xaut')}
            title="Переключить на XAUT в долларах (через курс ЦБ)"
          >
            XAUT USD
          </button>
        </div>
        <div className="rate-banner-row">
        <div className="rate-main">
          <span className="rate-label muted">{rateBannerTitle(price)}</span>
          <p className="rate-value mono-nums">
            {priceLoading ? (
              <>
                <span className="skeleton-line rate-skel" />
                <span className="per"> / г</span>
              </>
            ) : (
              <>
                {price?.goldRubPerGram != null ? formatMoney(price.goldRubPerGram) : '—'}
                <span className="per"> / г</span>
              </>
            )}
          </p>
          {!priceLoading && price?.goldRubPerGram != null && rateBannerSubtitle(price) && (
            <span className="muted small">
              {rateBannerSubtitle(price)}
            </span>
          )}
          {priceLoading && <span className="muted small">Получаем курс…</span>}
        </div>
        <div className="rate-meta">
          {price?.stale && !priceLoading && (
            <span className="badge warn" title="Данные из кэша, идёт обновление">
              {staleRefreshingRef.current ? <><span className="spinner inline" style={{width:'0.6em',height:'0.6em',borderWidth:'1.5px'}} /> Обновляем</> : 'Кэш'}
            </span>
          )}
          {priceErr && !priceLoading && !price?.goldRubPerGram && <span className="badge danger" title={priceErr}>Ошибка обновления</span>}
          {user && (
            <button
              type="button"
              className="rate-refresh-btn"
              disabled={refreshBusy || priceLoading}
              onClick={handleRefreshPrice}
              title="Запросить свежий курс с биржи"
            >
              {refreshBusy ? (
                <>
                  <span className="spinner inline" /> Обновление…
                </>
              ) : (
                <>
                  <span className="rate-refresh-btn__icon" aria-hidden>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                      <path d="M16 21h5v-5" />
                    </svg>
                  </span>
                  Обновить сейчас
                </>
              )}
            </button>
          )}
        </div>
        </div>
      </section>

      <nav className="tabs glass" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'calc'} className={tab === 'calc' ? 'tab active' : 'tab'} onClick={() => setTab('calc')}>
          Калькулятор
        </button>
        {isUserManagerRole(user.role) && (
          <button type="button" role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'tab active' : 'tab'} onClick={() => setTab('settings')}>
            {isSuperAdminRole(user.role) ? 'Настройки и доступы' : 'Пользователи'}
          </button>
        )}
      </nav>

      <main className="main-content">
        {tab === 'calc' && <Calculator formatMoney={formatMoney} price={price} userUid={user.uid} />}
        {tab === 'settings' && isUserManagerRole(user.role) && <SettingsPanel user={user} />}
      </main>


      <style>{`
        .shell {
          max-width: 520px;
          margin: 0 auto;
          padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 32px max(16px, env(safe-area-inset-left));
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          gap: 14px;
          width: 100%;
        }
        .load-card { margin-top: 30vh; padding: 28px; text-align: center; position: relative; overflow: hidden; }
        .topbar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 14px 16px;
          gap: 12px;
          flex-wrap: wrap;
        }
        .brand { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1 1 auto; }
        .brand > div:last-child { min-width: 0; flex: 1; }
        .brand-mark { width: 56px; height: 56px; border-radius: 14px; background: #fff; border: 1px solid var(--stroke); box-shadow: 0 2px 12px rgba(0,0,0,0.12); flex-shrink: 0; overflow: hidden; display: block; }
        .brand-mark img { width: 100%; height: 100%; object-fit: contain; object-position: center; padding: 6px; box-sizing: border-box; display: block; }
        .brand-title {
          font-family: var(--font-display);
          font-size: 1.35rem;
          font-weight: 600;
          margin: 0;
          line-height: 1.2;
          letter-spacing: 0.06em;
          word-break: break-word;
          text-transform: uppercase;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35em;
        }
        .brand-title-pro {
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
        .brand-sub { margin: 2px 0 0; font-size: 0.75rem; }
        .topbar-right {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex: 1 1 auto;
          min-width: 0;
        }
        .user-pill {
          font-size: 0.78rem;
          padding: 8px 12px;
          border-radius: 999px;
          background: var(--gold-soft);
          border: 1px solid var(--stroke);
          max-width: min(200px, 42vw);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .rate-banner { padding: 16px 18px; display: flex; flex-wrap: wrap; flex-direction: column; align-items: stretch; gap: 10px; }
        .quote-tabs {
          display: flex;
          gap: 6px;
          width: 100%;
          padding: 5px;
          border-radius: 14px;
          background: var(--input-bg);
          border: 1px solid var(--stroke);
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.06);
        }
        .quote-tab {
          flex: 1;
          min-width: 0;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid var(--stroke);
          background: var(--bg-panel-solid);
          color: var(--text-muted);
          font-size: 0.82rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: background 0.18s, color 0.18s, border-color 0.18s, box-shadow 0.18s, transform 0.12s;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
        }
        .quote-tab:hover:not(.active) {
          border-color: var(--stroke-strong);
          color: var(--text);
          background: var(--bg-elevated);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }
        .quote-tab:active {
          transform: scale(0.98);
        }
        .quote-tab:focus-visible {
          outline: 2px solid var(--gold);
          outline-offset: 2px;
        }
        .quote-tab.active {
          background: var(--gold-soft);
          color: var(--gold);
          border-color: var(--stroke-strong);
          box-shadow: 0 2px 14px var(--gold-glow), 0 1px 0 rgba(255, 255, 255, 0.06) inset;
        }
        .rate-banner-row { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; width: 100%; }
        .rate-main { min-width: 0; flex: 1 1 200px; }
        .rate-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; display: block; margin-bottom: 4px; }
        .rate-value { font-family: var(--font-display); font-size: 2rem; font-weight: 600; margin: 0; color: var(--gold); text-shadow: 0 0 40px var(--gold-glow); min-height: 2.4rem; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
        .rate-skel { display: inline-block; min-width: min(160px, 50vw); height: 2rem; vertical-align: middle; }
        .rate-banner.is-loading .rate-value { text-shadow: none; }
        .rate-value .per { font-size: 1rem; color: var(--text-muted); font-weight: 500; }
        .rate-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; flex-shrink: 0; }
        .badge { font-size: 0.7rem; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.06em; }
        .badge.warn { background: rgba(250, 204, 21, 0.15); color: #facc15; border: 1px solid rgba(250, 204, 21, 0.35); }
        .badge.danger { background: rgba(248, 113, 113, 0.12); color: var(--danger); border: 1px solid rgba(248, 113, 113, 0.35); }
        .tabs { display: flex; padding: 6px; gap: 6px; }
        .tab {
          flex: 1;
          min-width: 0;
          padding: 11px 10px;
          border-radius: 12px;
          font-size: 0.88rem;
          font-weight: 500;
          color: var(--text-muted);
          transition: background 0.2s, color 0.2s;
          line-height: 1.25;
          text-align: center;
          hyphens: auto;
          -webkit-hyphens: auto;
        }
        .tab { border: 1px solid transparent; }
        .tab.active { background: var(--gold-soft); color: var(--gold); border: 1px solid var(--stroke-strong); }
        .main-content { flex: 1; min-width: 0; }
        .footer { text-align: center; padding-top: 8px; padding-bottom: env(safe-area-inset-bottom); }
        .muted { color: var(--text-muted); }
        .small { font-size: 0.78rem; }
        .cache-age { opacity: 0.7; }
        .rate-banner.is-stale .rate-value { opacity: 0.75; }
        .rate-refresh-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 9px 16px;
          border-radius: 999px;
          border: 1px solid var(--stroke-strong);
          background: var(--gold-soft);
          color: var(--gold);
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: background 0.18s, border-color 0.18s, box-shadow 0.18s, transform 0.12s, color 0.15s;
          white-space: nowrap;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        .rate-refresh-btn__icon {
          display: flex;
          flex-shrink: 0;
          opacity: 0.92;
        }
        .rate-refresh-btn:hover:not(:disabled) {
          border-color: var(--gold);
          box-shadow: 0 2px 14px var(--gold-glow);
          color: var(--gold);
        }
        .rate-refresh-btn:active:not(:disabled) {
          transform: scale(0.97);
        }
        .rate-refresh-btn:focus-visible {
          outline: 2px solid var(--gold);
          outline-offset: 2px;
        }
        .rate-refresh-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
        }
        .btn-ghost.small { padding: 8px 14px; font-size: 0.82rem; }

        @media (max-width: 480px) {
          .topbar {
            flex-direction: column;
            align-items: stretch;
            padding: 14px 14px;
          }
          .brand { flex: none; }
          .topbar-right {
            justify-content: space-between;
            width: 100%;
            flex-wrap: wrap;
            gap: 10px;
          }
          .user-pill {
            order: -1;
            flex: 1 0 100%;
            min-width: 0;
            max-width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .topbar-right .theme-toggle { flex-shrink: 0; }
          .topbar-right .btn-ghost { flex-shrink: 0; white-space: nowrap; margin-left: auto; }
          .rate-value { font-size: 1.65rem; }
          .rate-banner { flex-direction: column; align-items: stretch; }
          .rate-meta { justify-content: flex-start; }
          .tab { font-size: 0.8rem; padding: 10px 8px; }
        }
      `}</style>
    </div>
  );
}
