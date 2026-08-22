import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { api, pingApiHealth, resetAuthExpiredGate } from './api.js';
import { ThemeToggle } from './ThemeToggle.jsx';

function mapLoginError(ex) {
  const msg = String(ex?.message || '');
  if (/invalid login credentials|invalid_credentials/i.test(msg)) return 'Неверный email или пароль';
  if (/email not confirmed/i.test(msg)) return 'Подтвердите email в письме от Supabase';
  if (/over_request_rate|rate limit|too many requests|429|security purposes/i.test(msg + String(ex?.status || '')))
    return 'Слишком много попыток. Подождите пару минут и попробуйте снова.';
  return msg || 'Ошибка входа';
}

const CLIENT_SITE_URL = 'https://reaktivo.ru';

// Сколько секунд симулировать прогресс до 90% при прогреве
const WARM_PROGRESS_DURATION = 55;

const STAFF_LOGIN_FLAG = 'cg_staff_login';

/** Вход сотрудников по умолчанию скрыт от посетителей-клиентов (Stage 10).
 *  Показываем форму: по ссылке внизу, по ?staff / #staff, либо если с этого
 *  устройства уже успешно входил сотрудник. */
function staffInitiallyVisible() {
  try {
    if (new URLSearchParams(window.location.search).has('staff')) return true;
    if (window.location.hash === '#staff') return true;
    return localStorage.getItem(STAFF_LOGIN_FLAG) === '1';
  } catch {
    return false;
  }
}

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [staffVisible, setStaffVisible] = useState(staffInitiallyVisible);
  // 'checking' | 'warming' | 'ready'
  const [serverStatus, setServerStatus] = useState('checking');
  const [warmProgress, setWarmProgress] = useState(0);
  const progressRef = useRef(null);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let done = false;

    // Через 6 сек без ответа — переходим в "warming" и запускаем прогресс-бар
    const slowTimer = setTimeout(() => {
      if (!done) setServerStatus('warming');
    }, 6_000);

    // Анимируем прогресс-бар: нелинейный рост (быстро в начале, замедляется к 90%)
    progressRef.current = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const pct = Math.min(90, (elapsed / WARM_PROGRESS_DURATION) * 100);
      setWarmProgress(pct);
    }, 400);

    pingApiHealth({ timeout: 90_000 }).then((ok) => {
      done = true;
      clearTimeout(slowTimer);
      clearInterval(progressRef.current);
      setWarmProgress(100);
      setServerStatus(ok ? 'ready' : 'warming');
    }).catch(() => {
      done = true;
      clearTimeout(slowTimer);
    });

    return () => {
      clearTimeout(slowTimer);
      clearInterval(progressRef.current);
    };
  }, []);

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
      try { localStorage.setItem(STAFF_LOGIN_FLAG, '1'); } catch { /* ignore */ }
      resetAuthExpiredGate();
      api.prefetchMe();
    } catch (ex) {
      setErr(mapLoginError(ex));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lg-wrap">
      {/* декоративная подложка */}
      <div className="lg-orb lg-orb--a" aria-hidden />
      <div className="lg-orb lg-orb--b" aria-hidden />
      <div className="lg-grid-bg" aria-hidden />

      <div className="lg-theme-bar">
        <ThemeToggle />
      </div>

      <div className="lg-stage">
        <header className="lg-head lg-anim" style={{ '--d': '0ms' }}>
          <span className="lg-mark" aria-hidden>
            <img src="/logo-reaktivo-mark.svg" alt="" />
          </span>
          <h1 className="lg-brand">
            Reaktivo<span className="lg-brand-dot">.</span>PRO
          </h1>
        </header>

        <div className={`lg-cards${staffVisible ? '' : ' lg-cards--client-only'}`}>
          {/* ── Вход для сотрудников (скрыт от клиентов, открывается ссылкой внизу) ── */}
          {staffVisible && (
            <section className="lg-card lg-card--staff lg-anim" style={{ '--d': '90ms' }}>
              <div className="lg-staff-copy">
                <span className="lg-badge lg-badge--solid">Для сотрудников</span>
                <h2 className="lg-card-title">Вход в панель</h2>
                <p className="lg-card-sub">Калькулятор выкупа, договоры, аналитика и команда</p>
              </div>

              <form onSubmit={handleSubmit} className="lg-form">
                <label className="lg-field">
                  <span className="lg-field-label">Email</span>
                  <input
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@reaktivo.ru"
                  />
                </label>
                <label className="lg-field">
                  <span className="lg-field-label">Пароль</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Пароль"
                  />
                </label>
                {err && <p className="lg-err">{err}</p>}
                <button type="submit" className="lg-submit" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner inline" /> Вход…
                    </>
                  ) : (
                    'Войти в систему'
                  )}
                </button>

                {serverStatus !== 'ready' && (
                  <div className={`lg-warm lg-warm--${serverStatus}`} aria-live="polite">
                    <div className="lg-warm__bar">
                      <div
                        className="lg-warm__fill"
                        style={{ width: `${warmProgress}%` }}
                      />
                    </div>
                    <span className="lg-warm__label">
                      {serverStatus === 'checking' && 'Подключение к серверу…'}
                      {serverStatus === 'warming' && 'Нет ответа от API. Часто из РФ без VPN режется адрес сервера. Подождите или включите VPN.'}
                    </span>
                  </div>
                )}
              </form>
            </section>
          )}

          {/* ── Продажа золота → сайт ── */}
          <aside className="lg-card lg-card--sell lg-anim" style={{ '--d': '160ms' }}>
            <span className="lg-badge lg-badge--solid">Для клиентов</span>
            <h2 className="lg-card-title">Хотите продать изделие?</h2>
            <p className="lg-card-sub">
              Оценка в отделении и выплата сразу — на сайте{' '}
              <a className="lg-inline-link" href={CLIENT_SITE_URL} target="_blank" rel="noopener noreferrer">
                Reaktivo.ru
              </a>
            </p>

            <ul className="lg-perks">
              <li>
                <span className="lg-perk-ico" aria-hidden>✓</span>
                Оценка в отделении скупки
              </li>
              <li>
                <span className="lg-perk-ico" aria-hidden>✓</span>
                Бесплатная оценка и выезд специалиста
              </li>
              <li>
                <span className="lg-perk-ico" aria-hidden>✓</span>
                Выплата сразу на месте
              </li>
            </ul>

            <a className="lg-client-btn lg-client-btn--fill" href={CLIENT_SITE_URL} target="_blank" rel="noopener noreferrer">
              Перейти на Reaktivo.ru
              <span aria-hidden>→</span>
            </a>
          </aside>

          {/* ── Кабинет клиента ── */}
          <aside className="lg-card lg-card--client lg-anim" style={{ '--d': '230ms' }}>
            <span className="lg-badge lg-badge--solid">Кабинет</span>
            <h2 className="lg-card-title">Вход для клиентов</h2>
            <p className="lg-card-sub">
              Заказы ювелирных изделий и история продаж в скупку
            </p>

            <ul className="lg-perks lg-perks--compact">
              <li>
                <span className="lg-perk-ico" aria-hidden>✓</span>
                Витрина ювелирных изделий
              </li>
              <li>
                <span className="lg-perk-ico" aria-hidden>✓</span>
                Заказы с оплатой изделия
              </li>
              <li>
                <span className="lg-perk-ico" aria-hidden>✓</span>
                История продаж в скупку
              </li>
            </ul>

            <a className="lg-client-btn lg-client-btn--fill" href="/kabinet">
              Войти в кабинет
              <span aria-hidden>→</span>
            </a>
          </aside>
        </div>

        <p className="lg-foot lg-anim" style={{ '--d': '300ms' }}>
          © {new Date().getFullYear()} Reaktivo.PRO · панель оценки и выкупа
          {!staffVisible && (
            <>
              {' · '}
              <button type="button" className="lg-staff-link" onClick={() => setStaffVisible(true)}>
                Вход для сотрудников
              </button>
            </>
          )}
        </p>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
/* ─── Login ───────────────────────────────────────────────────────────────── */
.lg-wrap {
  position: relative;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  overflow: hidden;
  background: var(--bg-deep);
  background-image: var(--bg-gradient);
}

.lg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  will-change: transform;
}
.lg-orb--a {
  top: -20%; left: -12%;
  width: 48vw; height: 48vw;
  max-width: 640px; max-height: 640px;
  background: radial-gradient(circle, rgba(90, 94, 102, 0.35), transparent 65%);
  opacity: 0.7;
  animation: lgFloatA 16s ease-in-out infinite alternate;
}
.lg-orb--b {
  bottom: -22%; right: -10%;
  width: 44vw; height: 44vw;
  max-width: 620px; max-height: 620px;
  background: radial-gradient(circle, rgba(70, 74, 82, 0.40), transparent 65%);
  opacity: 0.85;
  animation: lgFloatB 19s ease-in-out infinite alternate;
}
@keyframes lgFloatA { from { transform: translate3d(0,0,0); } to { transform: translate3d(4vw, 3vh, 0); } }
@keyframes lgFloatB { from { transform: translate3d(0,0,0); } to { transform: translate3d(-3vw, -4vh, 0); } }

.lg-grid-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(var(--stroke) 1px, transparent 1px);
  background-size: 34px 34px;
  opacity: 0.22;
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 75%);
  mask-image: radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 75%);
}

.lg-theme-bar {
  position: absolute;
  top: max(14px, env(safe-area-inset-top));
  right: max(14px, env(safe-area-inset-right));
  z-index: 3;
}

.lg-stage {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 920px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 26px;
}

.lg-anim {
  animation: lgIn 460ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--d, 0ms);
  will-change: transform, opacity;
}
@keyframes lgIn {
  from { opacity: 0; transform: translate3d(0, 16px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}

/* ── шапка: знак + Reaktivo.PRO без дубля названия ── */
.lg-head { display: flex; align-items: center; gap: 18px; }
.lg-mark {
  width: 72px; height: 72px;
  border-radius: 16px;
  background: transparent;
  border: none;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.35);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.lg-mark img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.lg-brand {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.85rem, 1.4rem + 1.8vw, 2.55rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-strong);
  line-height: 1;
}
.lg-brand-dot {
  color: var(--accent);
}

/* ── карточки: сверху вход, снизу два равных клиентских блока ── */
.lg-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-areas:
    "staff staff"
    "sell client";
  gap: 14px;
  width: 100%;
  align-items: stretch;
}
.lg-card--staff { grid-area: staff; }
.lg-card--sell { grid-area: sell; }
.lg-card--client { grid-area: client; }
/* Посетитель-клиент: только два клиентских блока, без формы сотрудников */
.lg-cards--client-only {
  grid-template-areas: "sell client";
}

.lg-card {
  border-radius: 20px;
  padding: 26px 26px 24px;
  border: 1px solid var(--stroke-soft);
  background: var(--bg-panel-solid);
  box-shadow: var(--shadow-card);
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* Сотрудники: текст слева, компактная форма справа — без пустоты */
.lg-card--staff {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(240px, 320px);
  gap: 28px 36px;
  align-items: center;
  padding: 28px 30px;
}
.lg-staff-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}
.lg-staff-copy .lg-badge { margin-bottom: 12px; }
.lg-staff-copy .lg-card-title {
  font-size: clamp(1.35rem, 1.15rem + 0.8vw, 1.7rem);
}
.lg-staff-copy .lg-card-sub {
  margin-top: 10px;
  max-width: 34ch;
}

:root[data-theme='dark'] .lg-card--staff {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0) 38%),
    var(--bg-panel-solid);
  box-shadow: var(--shadow-card), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.lg-badge {
  align-self: flex-start;
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  padding: 5px 11px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  margin-bottom: 14px;
}
.lg-badge--solid {
  background: color-mix(in srgb, var(--accent) 88%, #000);
  color: #fff;
}
.lg-card-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.2rem, 1.05rem + 0.7vw, 1.45rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-strong);
  line-height: 1.2;
}
.lg-card-sub {
  margin: 8px 0 0;
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
}
.lg-inline-link {
  color: var(--accent);
  font-weight: 700;
  text-decoration: none;
}
.lg-inline-link:hover { text-decoration: underline; }

/* ── форма ── */
.lg-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  width: 100%;
}
.lg-field { display: flex; flex-direction: column; gap: 6px; }
.lg-field-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  color: var(--text-muted);
}
.lg-err { color: var(--danger); font-size: 0.84rem; margin: 0; }
.lg-submit {
  margin-top: 4px;
  width: 100%;
  padding: 13px 18px;
  border: none;
  border-radius: 12px;
  background: var(--accent-grad);
  color: #fff;
  font-size: 0.92rem;
  font-weight: 700;
  font-family: var(--font-ui);
  cursor: pointer;
  box-shadow: 0 6px 22px var(--accent-glow);
  transition: filter 0.18s, transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.lg-submit:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 9px 28px var(--accent-glow); }
.lg-submit:active:not(:disabled) { transform: translateY(0); }
.lg-submit:disabled { opacity: 0.6; cursor: not-allowed; }

/* ── правые карточки ── */
.lg-card--sell,
.lg-card--client {
  position: relative;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--accent) 18%, var(--stroke-soft));
  padding-bottom: 28px;
  min-height: 360px;
}
.lg-card--sell {
  background: var(--bg-panel-solid);
}
.lg-card--client {
  background: var(--bg-panel-solid);
}
:root[data-theme='dark'] .lg-card--sell {
  background: var(--bg-panel-solid);
}
:root[data-theme='dark'] .lg-card--client {
  background: var(--bg-panel-solid);
}
.lg-card--sell::before,
.lg-card--client::before {
  display: none;
}
.lg-card--sell > *,
.lg-card--client > * { position: relative; }

.lg-perks {
  list-style: none;
  margin: 16px 0 28px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}
.lg-perks--compact { gap: 9px; margin-top: 14px; }
.lg-perks li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
  color: var(--text);
}
.lg-perk-ico {
  width: 22px; height: 22px;
  border-radius: 7px;
  background: var(--emerald-soft);
  color: var(--emerald);
  font-size: 0.78rem;
  font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.lg-client-btn {
  margin-top: 0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 12px 18px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--stroke));
  background: color-mix(in srgb, var(--bg-panel-solid) 60%, transparent);
  -webkit-backdrop-filter: blur(5px);
  backdrop-filter: blur(5px);
  color: var(--accent);
  font-size: 0.9rem;
  font-weight: 700;
  text-decoration: none;
  transition: background 0.18s, border-color 0.18s, transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), gap 0.2s, filter 0.18s;
}
.lg-client-btn:hover { background: var(--accent-soft); border-color: var(--accent); transform: translateY(-1px); gap: 13px; }
.lg-client-btn--fill {
  background: var(--accent-grad);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 6px 20px var(--accent-glow);
}
.lg-client-btn--fill:hover {
  filter: brightness(1.06);
  background: var(--accent-grad);
  border-color: transparent;
}

.lg-foot {
  margin: 0;
  font-size: 0.72rem;
  color: var(--text-dim);
}
.lg-staff-link {
  border: none;
  background: none;
  padding: 0;
  font-size: 0.72rem;
  color: var(--text-dim);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  transition: color 0.15s;
}
.lg-staff-link:hover { color: var(--text); }

@media (max-width: 760px) {
  .lg-cards {
    grid-template-columns: 1fr;
    grid-template-areas:
      "staff"
      "sell"
      "client";
  }
  .lg-cards--client-only {
    grid-template-areas:
      "sell"
      "client";
  }
  .lg-card--staff {
    grid-template-columns: 1fr;
    gap: 18px;
    padding: 22px 20px 20px;
  }
  .lg-staff-copy .lg-card-sub { max-width: none; }
  .lg-card { padding: 22px 20px 20px; }
  .lg-stage { gap: 18px; }
  .lg-mark { width: 60px; height: 60px; border-radius: 15px; }
  .lg-wrap { align-items: flex-start; padding-top: max(56px, env(safe-area-inset-top)); padding-bottom: 40px; }
}

@media (prefers-reduced-motion: reduce) {
  .lg-anim, .lg-orb { animation: none !important; }
  .lg-submit, .lg-client-btn { transition: none !important; }
}

.lg-warm {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.lg-warm__bar {
  height: 3px;
  border-radius: 99px;
  background: var(--stroke-soft);
  overflow: hidden;
}
.lg-warm__fill {
  height: 100%;
  border-radius: 99px;
  background: var(--accent-grad);
  transition: width 0.5s ease-out;
}
.lg-warm__label {
  font-size: 0.72rem;
  color: var(--text-muted);
  line-height: 1.4;
}
.lg-warm--warming .lg-warm__label { color: var(--text-muted); }
`;
