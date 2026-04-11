import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { supabase } from './supabase.js';
import { useToast } from './ToastContext.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import { Login } from './Login.jsx';
import { Calculator } from './Calculator.jsx';
import { SettingsPanel } from './SettingsPanel.jsx';

function formatMoney(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(n);
}

export default function App() {
  const toast = useToast();
  const [authReady, setAuthReady] = useState(false);
  const [sessionUser, setSessionUser] = useState(null);
  const [user, setUser] = useState(undefined);
  const [profileErr, setProfileErr] = useState(null);
  const [tab, setTab] = useState('calc');
  const [price, setPrice] = useState(null);
  const [priceErr, setPriceErr] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);

  const loadMe = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      setUser(null);
      setProfileErr(null);
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
    }
  }, []);

  const loadPrice = useCallback(
    async (opts = {}) => {
      const silent = opts.silent === true;
      if (!sessionUser || user == null) return;
      if (!silent) setPriceLoading(true);
      try {
        const p = await api.price();
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
    [sessionUser, user, toast],
  );

  const handleRefreshPrice = useCallback(async () => {
    if (!user || user.role !== 'admin') return;
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
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    loadMe();
  }, [authReady, sessionUser, loadMe]);

  useEffect(() => {
    if (!user) return;
    loadPrice({ silent: false });
    const t = setInterval(() => loadPrice({ silent: true }), 60_000);
    return () => clearInterval(t);
  }, [user, loadPrice]);

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
          <span className="brand-mark" aria-hidden>
            <span className="brand-fallback">CG</span>
            <img
              src="/logo_reaktico1.png"
              alt=""
              onError={(e) => {
                if (e.currentTarget.dataset.fallbackTried === '1') {
                  e.currentTarget.style.display = 'none';
                  return;
                }
                e.currentTarget.dataset.fallbackTried = '1';
                e.currentTarget.src = '/logo_reaktico1.jpeg';
              }}
              onLoad={(e) => {
                const fallback = e.currentTarget.parentElement?.querySelector('.brand-fallback');
                if (fallback) fallback.style.display = 'none';
              }}
            />
          </span>
          <div>
            <h1 className="brand-title">Calculated Gold</h1>
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

      <section className={`rate-banner glass${priceLoading ? ' is-loading' : ''}`}>
        <div className="rate-main">
          <span className="rate-label muted">Котировка ЦБ, чистое золото</span>
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
          {!priceLoading && price?.cbrDate && <span className="muted small">Дата ЦБ: {price.cbrDate}</span>}
          {priceLoading && <span className="muted small">Получаем курс…</span>}
        </div>
        <div className="rate-meta">
          {price?.stale && !priceLoading && <span className="badge warn">Кэш</span>}
          {priceErr && !priceLoading && <span className="badge danger" title={priceErr}>Ошибка обновления</span>}
          {user.role === 'admin' && (
            <button
              type="button"
              className="btn-ghost small"
              disabled={refreshBusy || priceLoading}
              onClick={handleRefreshPrice}
            >
              {refreshBusy ? (
                <>
                  <span className="spinner inline" /> Обновление…
                </>
              ) : (
                'Обновить сейчас'
              )}
            </button>
          )}
        </div>
      </section>

      <nav className="tabs glass" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'calc'} className={tab === 'calc' ? 'tab active' : 'tab'} onClick={() => setTab('calc')}>
          Калькулятор
        </button>
        {user.role === 'admin' && (
          <button type="button" role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'tab active' : 'tab'} onClick={() => setTab('settings')}>
            Настройки и доступы
          </button>
        )}
      </nav>

      <main className="main-content">
        {tab === 'calc' && <Calculator formatMoney={formatMoney} price={price} />}
        {tab === 'settings' && user.role === 'admin' && <SettingsPanel />}
      </main>

      <footer className="footer muted small">
        Статика: Firebase Hosting · данные и API: Supabase + Node
      </footer>

      <style>{`
        .shell { max-width: 520px; margin: 0 auto; padding: 20px 16px 32px; min-height: 100dvh; display: flex; flex-direction: column; gap: 14px; }
        .load-card { margin-top: 30vh; padding: 28px; text-align: center; position: relative; overflow: hidden; }
        .topbar { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; gap: 12px; }
        .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .brand-mark { width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(145deg, #f0d060, #8a6a18); box-shadow: 0 0 20px var(--gold-glow); flex-shrink: 0; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; position: relative; }
        .brand-fallback { font-family: var(--font-display); font-size: 0.8rem; font-weight: 700; color: rgba(20, 12, 2, 0.9); letter-spacing: 0.03em; }
        .brand-mark img { width: 76%; height: 76%; object-fit: contain; display: block; filter: drop-shadow(0 1px 2px rgba(0,0,0,.25)); }
        .brand-title { font-family: var(--font-display); font-size: 1.35rem; font-weight: 600; margin: 0; line-height: 1.15; letter-spacing: 0.02em; }
        .brand-sub { margin: 2px 0 0; font-size: 0.75rem; }
        .topbar-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .user-pill { font-size: 0.8rem; padding: 6px 12px; border-radius: 999px; background: var(--gold-soft); border: 1px solid var(--stroke); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rate-banner { padding: 18px 20px; display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
        .rate-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; display: block; margin-bottom: 4px; }
        .rate-value { font-family: var(--font-display); font-size: 2rem; font-weight: 600; margin: 0; color: var(--gold); text-shadow: 0 0 40px var(--gold-glow); min-height: 2.4rem; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
        .rate-skel { display: inline-block; min-width: 160px; height: 2rem; vertical-align: middle; }
        .rate-banner.is-loading .rate-value { text-shadow: none; }
        .rate-value .per { font-size: 1rem; color: var(--text-muted); font-weight: 500; }
        .rate-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .badge { font-size: 0.7rem; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.06em; }
        .badge.warn { background: rgba(250, 204, 21, 0.15); color: #facc15; border: 1px solid rgba(250, 204, 21, 0.35); }
        .badge.danger { background: rgba(248, 113, 113, 0.12); color: var(--danger); border: 1px solid rgba(248, 113, 113, 0.35); }
        .tabs { display: flex; padding: 6px; gap: 6px; }
        .tab { flex: 1; padding: 12px 14px; border-radius: 12px; font-size: 0.9rem; font-weight: 500; color: var(--text-muted); transition: background 0.2s, color 0.2s; }
        .tab { border: 1px solid transparent; }
        .tab.active { background: var(--gold-soft); color: var(--gold); border: 1px solid var(--stroke-strong); }
        .main-content { flex: 1; }
        .footer { text-align: center; padding-top: 8px; }
        .muted { color: var(--text-muted); }
        .small { font-size: 0.78rem; }
      `}</style>
    </div>
  );
}
