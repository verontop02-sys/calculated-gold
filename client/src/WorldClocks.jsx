import { useEffect, useState } from 'react';

/**
 * Мировое время: Москва / Нью-Йорк / Лондон — плитки с фото городов.
 * Самодостаточный компонент (свои классы и стили) — используется и на
 * дашборде сотрудников, и в кабинете клиента (вкладка «Инвестиции»).
 * Тёмная тема — ночные виды, светлая — солнечные дневные (та же композиция).
 */
export const WORLD_CITIES = [
  { key: 'moscow', label: 'Москва', code: 'MSK', tz: 'Europe/Moscow', imgDark: '/cities/moscow.jpg', imgLight: '/cities/moscow-day.jpg' },
  { key: 'newyork', label: 'Нью-Йорк', code: 'NYC', tz: 'America/New_York', imgDark: '/cities/newyork.jpg', imgLight: '/cities/newyork-day.jpg' },
  { key: 'london', label: 'Лондон', code: 'LDN', tz: 'Europe/London', imgDark: '/cities/london.jpg', imgLight: '/cities/london-day.jpg' },
];

/** Текущая тема из data-theme на <html> + подписка на переключение (ThemeToggle меняет атрибут). */
function useHtmlTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => {
      setTheme(el.getAttribute('data-theme') || 'dark');
    });
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

export function tzParts(now, tz) {
  try {
    const parts = new Intl.DateTimeFormat('ru-RU', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t)?.value || '00';
    return { hm: `${get('hour')}:${get('minute')}`, s: get('second') };
  } catch {
    return { hm: '—:—', s: '' };
  }
}

export function tzDateLabel(now, tz) {
  try {
    const s = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'long' }).format(now);
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return '';
  }
}

export function tzOffsetLabel(now, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value || '';
    return name.replace('GMT', 'UTC') || '';
  } catch {
    return '';
  }
}

export function WorldClocksCard({ delay = '0ms', className = '' }) {
  const [now, setNow] = useState(() => new Date());
  const theme = useHtmlTheme();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <section
      className={`wct-strip wct-in ${className}`.trim()}
      style={{ '--d': delay, gridColumn: 'span 12' }}
      aria-label="Мировое время"
    >
      {WORLD_CITIES.map((c) => {
        const { hm, s } = tzParts(now, c.tz);
        const img = theme === 'light' ? c.imgLight : c.imgDark;
        return (
          <div key={c.key} className={`wct-tile wct-tile--${c.key} wct-tile--${theme}`} style={{ backgroundImage: `url(${img})` }}>
            <div className="wct-tile__top">
              <span className="wct-tile__city">
                <span className="wct-tile__live" aria-hidden />
                {c.label}
              </span>
              <span className="wct-tile__code mono-nums">{c.code} · {tzOffsetLabel(now, c.tz)}</span>
            </div>
            <div className="wct-tile__bottom">
              <span className="wct-tile__time mono-nums">
                {hm}
                <span className="wct-tile__sec">:{s}</span>
              </span>
              <span className="wct-tile__date">{tzDateLabel(now, c.tz)}</span>
            </div>
          </div>
        );
      })}
      <style>{CSS}</style>
    </section>
  );
}

const CSS = `
.wct-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 10px;
  background: var(--bg-panel-solid);
  border: 1px solid var(--stroke-soft);
  border-radius: 18px;
  box-shadow: var(--shadow-card);
}
:root[data-theme='dark'] .wct-strip {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.028), rgba(255, 255, 255, 0) 36%),
    var(--bg-panel-solid);
  box-shadow: var(--shadow-card), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.wct-in { animation: wctIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: var(--d, 0ms); }
@keyframes wctIn { from { opacity: 0; transform: translate3d(0, 8px, 0); } to { opacity: 1; transform: translate3d(0, 0, 0); } }

.wct-tile {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  min-height: 118px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background-size: cover;
  background-position: center 38%;
  isolation: isolate;
  transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}
.wct-tile::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(180deg, rgba(8, 9, 12, 0.62) 0%, rgba(8, 9, 12, 0.18) 42%, rgba(8, 9, 12, 0.66) 100%);
}
.wct-tile:hover { transform: scale(1.012); }
.wct-tile__top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.wct-tile__city {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 0.82rem; font-weight: 700; color: #fff;
  letter-spacing: 0.01em; text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55);
}
.wct-tile__live {
  width: 7px; height: 7px; border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 8px rgba(74, 222, 128, 0.9);
  animation: wctPulse 2.2s ease-in-out infinite;
}
@keyframes wctPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
.wct-tile__code {
  font-size: 0.62rem; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
  color: rgba(255, 255, 255, 0.82);
  background: rgba(10, 11, 15, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  padding: 3px 9px;
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  white-space: nowrap;
}
.wct-tile__bottom { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.wct-tile__time {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 1.2rem + 1vw, 2rem);
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #fff;
  line-height: 1;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.6);
  font-variant-numeric: tabular-nums;
}
.wct-tile__sec { font-size: 0.55em; font-weight: 600; color: rgba(255, 255, 255, 0.66); margin-left: 2px; }
.wct-tile__date { font-size: 0.72rem; font-weight: 600; color: rgba(255, 255, 255, 0.78); text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55); white-space: nowrap; }
/* Москва — домашний рынок, лёгкая красная кромка в тон бренда */
.wct-tile--moscow::before {
  background:
    linear-gradient(180deg, rgba(8, 9, 12, 0.62) 0%, rgba(8, 9, 12, 0.18) 42%, rgba(8, 9, 12, 0.66) 100%),
    linear-gradient(120deg, color-mix(in srgb, var(--accent) 26%, transparent), transparent 55%);
}

@media (max-width: 640px) {
  /* Без «подложки»-карточки — на мобиле фото городов идут сами по себе, край в край */
  .wct-strip {
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 0;
    background: none;
    border: none;
    box-shadow: none;
  }
  :root[data-theme='dark'] .wct-strip { background: none; box-shadow: none; }
  .wct-tile { min-height: 92px; padding: 12px 14px; border-radius: 14px; }
}
`;
