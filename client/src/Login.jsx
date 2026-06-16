import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { api, pingApiHealth } from './api.js';
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

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
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
          <span className="lg-mark">
            <img src="/logo_reactivo1.png" alt="REAKTIVO PRO" />
          </span>
          <h1 className="lg-brand">
            REAKTIVO <span className="lg-brand-pro">PRO</span>
          </h1>
        </header>

        <div className="lg-cards">
          {/* ── Вход для сотрудников ── */}
          <section className="lg-card lg-card--staff lg-anim" style={{ '--d': '90ms' }}>
            <span className="lg-badge">Для сотрудников</span>
            <h2 className="lg-card-title">Вход в панель</h2>
            <p className="lg-card-sub">Калькулятор выкупа, договоры, аналитика и команда</p>

            <form onSubmit={handleSubmit} className="lg-form">
              <label className="lg-field">
                <span className="lg-field-label">Email</span>
                <input
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.ru"
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

              {/* ── Индикатор прогрева сервера ── */}
              <div className={`lg-warm lg-warm--${serverStatus}`} aria-live="polite">
                <div className="lg-warm__bar">
                  <div
                    className="lg-warm__fill"
                    style={{ width: `${warmProgress}%` }}
                  />
                </div>
                <span className="lg-warm__label">
                  {serverStatus === 'checking' && 'Подключение к серверу…'}
                  {serverStatus === 'warming' && 'Сервер просыпается после паузы (~30–60 сек)…'}
                  {serverStatus === 'ready' && '✓ Сервер готов'}
                </span>
              </div>
            </form>
          </section>

          {/* ── Для клиентов (зеркальный блок) ── */}
          <aside className="lg-card lg-card--client lg-anim" style={{ '--d': '180ms' }}>
            <span className="lg-badge lg-badge--client">Для клиентов</span>
            <h2 className="lg-card-title">Хотите выгодно продать золото?</h2>
            <p className="lg-card-sub lg-card-sub--client">
              Оценка по биржевому курсу, прозрачный расчёт и деньги сразу — на сайте REAKTIVO.
            </p>

            <ul className="lg-perks">
              <li>
                <span className="lg-perk-ico" aria-hidden>✓</span>
                Цена привязана к биржевой котировке
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

            <a className="lg-client-btn" href={CLIENT_SITE_URL} target="_blank" rel="noopener noreferrer">
              Перейти на reaktivo.ru
              <span aria-hidden>→</span>
            </a>
            <a className="lg-client-cabinet" href="/kabinet">
              Личный кабинет клиента (вход по телефону)
            </a>
          </aside>
        </div>

        <p className="lg-foot lg-anim" style={{ '--d': '280ms' }}>
          © {new Date().getFullYear()} REAKTIVO PRO · панель оценки и выкупа
        </p>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
/* ─── Login (Stage 7) ─────────────────────────────────────────────────────── */
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

/* световые сферы */
.lg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  will-change: transform;
}
.lg-orb--a {
  top: -18%; left: -8%;
  width: 46vw; height: 46vw;
  max-width: 640px; max-height: 640px;
  background: radial-gradient(circle, var(--accent-glow), transparent 65%);
  opacity: 0.55;
  animation: lgFloatA 16s ease-in-out infinite alternate;
}
.lg-orb--b {
  bottom: -22%; right: -10%;
  width: 40vw; height: 40vw;
  max-width: 560px; max-height: 560px;
  background: radial-gradient(circle, var(--emerald-soft), transparent 65%);
  opacity: 0.7;
  animation: lgFloatB 19s ease-in-out infinite alternate;
}
@keyframes lgFloatA { from { transform: translate3d(0,0,0); } to { transform: translate3d(4vw, 3vh, 0); } }
@keyframes lgFloatB { from { transform: translate3d(0,0,0); } to { transform: translate3d(-3vw, -4vh, 0); } }

/* едва заметная сетка-точки */
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
  gap: 22px;
}

/* появление — только opacity + transform (GPU, без репейнтов) */
.lg-anim {
  animation: lgIn 460ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--d, 0ms);
  will-change: transform, opacity;
}
@keyframes lgIn {
  from { opacity: 0; transform: translate3d(0, 16px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}

/* ── шапка ── */
.lg-head { display: flex; align-items: center; gap: 16px; }
.lg-mark {
  width: 62px; height: 62px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid var(--stroke);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.12);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.lg-mark img { width: 100%; height: 100%; object-fit: contain; padding: 6px; box-sizing: border-box; }
.lg-brand {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--text-strong);
  display: flex;
  align-items: center;
  gap: 0.4em;
}
.lg-brand-pro {
  font-size: 0.6em;
  font-weight: 800;
  letter-spacing: 0.13em;
  padding: 0.24em 0.5em;
  border-radius: 6px;
  background: var(--accent-grad);
  color: #fff;
  line-height: 1;
}

/* ── карточки ── */
.lg-cards {
  display: grid;
  grid-template-columns: 1.08fr 0.92fr;
  gap: 16px;
  width: 100%;
}
.lg-card {
  border-radius: 20px;
  padding: 28px 28px 26px;
  border: 1px solid var(--stroke-soft);
  background: var(--bg-panel-solid);
  box-shadow: var(--shadow-card);
  min-width: 0;
  display: flex;
  flex-direction: column;
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
  margin-bottom: 16px;
}
.lg-card-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.25rem, 1.05rem + 0.9vw, 1.55rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-strong);
  line-height: 1.18;
}
.lg-card-sub {
  margin: 8px 0 0;
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
}

/* ── форма ── */
.lg-form { display: flex; flex-direction: column; gap: 14px; margin-top: 22px; }
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
  margin-top: 8px;
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

/* ── клиентский блок ── */
.lg-card--client {
  position: relative;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--accent) 28%, var(--stroke-soft));
  background:
    linear-gradient(165deg, color-mix(in srgb, var(--accent) 18%, var(--bg-panel-solid)) 0%, var(--bg-panel-solid) 62%);
}
:root[data-theme='dark'] .lg-card--client {
  background:
    linear-gradient(165deg, color-mix(in srgb, var(--accent) 24%, var(--bg-panel-solid)) 0%, var(--bg-panel-solid) 64%);
}
.lg-card--client::before {
  content: '';
  position: absolute;
  top: -40%; right: -28%;
  width: 85%; height: 95%;
  background: radial-gradient(circle, var(--accent-soft), transparent 62%);
  opacity: 0.85;
  pointer-events: none;
}
.lg-card--client > * { position: relative; }
.lg-badge--client {
  background: color-mix(in srgb, var(--accent) 85%, #fff);
  color: #fff;
}
.lg-card-sub--client { color: var(--text-muted); }

.lg-perks {
  list-style: none;
  margin: 18px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 11px;
  flex: 1;
}
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
  margin-top: 20px;
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
  transition: background 0.18s, border-color 0.18s, transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), gap 0.2s;
}
.lg-client-btn:hover { background: var(--accent-soft); border-color: var(--accent); transform: translateY(-1px); gap: 13px; }

.lg-client-cabinet {
  margin-top: 10px;
  display: block;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.16s;
}
.lg-client-cabinet:hover { color: var(--accent); text-decoration: underline; }

.lg-foot {
  margin: 0;
  font-size: 0.72rem;
  color: var(--text-dim);
}

/* ── адаптив ── */
@media (max-width: 760px) {
  .lg-cards { grid-template-columns: 1fr; }
  .lg-card { padding: 24px 20px 22px; }
  .lg-stage { gap: 18px; }
  .lg-wrap { align-items: flex-start; padding-top: max(56px, env(safe-area-inset-top)); padding-bottom: 40px; }
}

@media (prefers-reduced-motion: reduce) {
  .lg-anim, .lg-orb { animation: none !important; }
  .lg-submit, .lg-client-btn { transition: none !important; }
}

/* ── Индикатор прогрева сервера ── */
.lg-warm {
  display: flex;
  flex-direction: column;
  gap: 5px;
  opacity: 1;
  transition: opacity 0.4s;
}
.lg-warm--ready {
  opacity: 0.55;
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
.lg-warm--ready .lg-warm__fill {
  background: var(--emerald, #22c55e);
}
.lg-warm__label {
  font-size: 0.72rem;
  color: var(--text-muted);
  line-height: 1.4;
}
.lg-warm--ready .lg-warm__label {
  color: var(--emerald, #22c55e);
  font-weight: 600;
}
.lg-warm--warming .lg-warm__label {
  color: var(--text-muted);
}

`;
