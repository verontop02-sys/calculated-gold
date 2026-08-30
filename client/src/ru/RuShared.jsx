import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useMotionValue, useScroll, useSpring, useTransform } from 'motion/react';
import Lenis from 'lenis';
import { clientApi } from '../api.js';
import { ThemeToggle } from '../ThemeToggle.jsx';
import { EASE } from '../InvestLanding.jsx';
import { WORLD_CITIES, tzDateLabel, tzOffsetLabel, tzParts } from '../WorldClocks.jsx';
import officeHallPhoto from '../assets/office/hall.jpg';
import officeWaitingPhoto from '../assets/office/waiting.jpg';
import officeWorkPhoto from '../assets/office/work.jpg';

export { officeHallPhoto, officeWaitingPhoto, officeWorkPhoto };

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function formatMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(n)) + ' ₽';
}

// Ползунок веса: первые ~70% хода это 1–80 г (обычные изделия), дальше крупнее.
const G1 = 80;
const G2 = 250;
const P1 = 0.72;
const P2 = 0.9;

function gramsToPos(g, maxG) {
  const v = Math.min(maxG, Math.max(1, g));
  if (v <= G1) return ((v - 1) / (G1 - 1)) * P1;
  if (v <= G2) return P1 + ((v - G1) / (G2 - G1)) * (P2 - P1);
  return P2 + ((v - G2) / Math.max(1, maxG - G2)) * (1 - P2);
}

function posToGrams(pos, maxG) {
  const p = Math.min(1, Math.max(0, pos));
  let g;
  if (p <= P1) g = 1 + (p / P1) * (G1 - 1);
  else if (p <= P2) g = G1 + ((p - P1) / (P2 - P1)) * (G2 - G1);
  else g = G2 + ((p - P2) / (1 - P2)) * (maxG - G2);
  return Math.max(1, Math.min(maxG, Math.round(g)));
}

export function GramsSlider({ value, onChange, max = 500, allowType, typeMax }) {
  const sliderVal = Math.round(gramsToPos(Math.min(value, max), max) * 1000);
  return (
    <>
      <div className="rl-calc-row">
        <span>ВЕС, ГРАММ</span>
        {allowType ? (
          <input
            className="rl-calc-num"
            type="number"
            min={1}
            max={typeMax || max}
            value={value}
            onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
            aria-label="Вес в граммах, точное значение"
          />
        ) : (
          <b>{value}</b>
        )}
      </div>
      <input
        className="rl-calc-range"
        type="range"
        min={0}
        max={1000}
        value={sliderVal}
        onChange={(e) => onChange(posToGrams(Number(e.target.value) / 1000, max))}
        aria-label="Вес в граммах"
      />
    </>
  );
}

/** Число плавно «доезжает» к новому значению вместо мгновенного скачка (для калькуляторов). */
export function useAnimatedNumber(value) {
  const spring = useSpring(0, { stiffness: 130, damping: 22, mass: 0.6 });
  const [display, setDisplay] = useState(0);
  const hasValue = value != null && Number.isFinite(Number(value));
  useEffect(() => {
    if (hasValue) spring.set(Number(value));
  }, [value, hasValue, spring]);
  useEffect(() => spring.on('change', setDisplay), [spring]);
  return hasValue ? display : null;
}

/** Сетка + параллакс-орбы, кольца и «пол» в hero. */
export function RuHeroBg({ heroRef }) {
  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const orbY1 = useTransform(heroProgress, [0, 1], [0, 150]);
  const orbY2 = useTransform(heroProgress, [0, 1], [0, -110]);
  const ringY = useTransform(heroProgress, [0, 1], [0, 80]);
  return (
    <div className="il-hero-bg rl-hero-stage" aria-hidden>
      <motion.span className="il-hero-orb il-hero-orb--1" style={{ y: orbY1 }} />
      <motion.span className="il-hero-orb il-hero-orb--2" style={{ y: orbY2 }} />
      <span className="rl-hero-orb-gold" />
      <span className="il-hero-grid" />
      <motion.span className="rl-hero-ring" style={{ y: ringY }} />
      <span className="rl-hero-wash" />
      <span className="rl-hero-floor" />
    </div>
  );
}

function isFinePointer() {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
}

function RuCursorGlow() {
  const [enabled, setEnabled] = useState(false);
  const x = useMotionValue(-600);
  const y = useMotionValue(-600);
  const sx = useSpring(x, { stiffness: 90, damping: 24, mass: 0.8 });
  const sy = useSpring(y, { stiffness: 90, damping: 24, mass: 0.8 });

  useEffect(() => {
    if (!isFinePointer() || prefersReducedMotion()) return undefined;
    setEnabled(true);
    const move = (e) => { x.set(e.clientX); y.set(e.clientY); };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [x, y]);

  if (!enabled) return null;
  return <motion.div className="il-cursor-glow rl-cursor-glow" style={{ x: sx, y: sy }} aria-hidden />;
}

/** Фон-атмосфера на все три лендинга: пятна света, пыль, зерно, виньетка. */
export function RuAtmosphere() {
  return (
    <>
      <div className="rl-aurora" aria-hidden>
        <span className="rl-aurora-a" />
        <span className="rl-aurora-b" />
        <span className="rl-aurora-c" />
      </div>
      <div className="rl-dust" aria-hidden />
      <div className="rl-vignette" aria-hidden />
      <div className="rl-grain" aria-hidden />
      <RuCursorGlow />
    </>
  );
}

/** Бегущая строка с ключевыми фактами страницы. */
export function RuMarquee({ items }) {
  return (
    <div className="il-marquee" aria-hidden>
      <div className="il-marquee-track">
        {[...Array(2)].flatMap(() => items).map((t, i) => (
          <span className="il-marquee-item" key={i}>{t}<i>◆</i></span>
        ))}
      </div>
    </div>
  );
}

function RuStatementWord({ progress, range, children }) {
  const opacity = useTransform(progress, range, [0.16, 1]);
  return <motion.span className="rl-statement-word" style={{ opacity }}>{children}&nbsp;</motion.span>;
}

/** Фраза, проявляющаяся слово за словом при скролле — одна сильная мысль на странице. */
export function RuStatement({ text }) {
  const ref = useRef(null);
  const words = useMemo(() => String(text || '').split(' '), [text]);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.82', 'end 0.42'] });
  return (
    <section className="rl-statement" ref={ref}>
      <div className="il-section-inner">
        <p className="rl-statement-text">
          {words.map((w, i) => (
            <RuStatementWord key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]}>
              {w}
            </RuStatementWord>
          ))}
        </p>
      </div>
    </section>
  );
}

const kpiParent = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const kpiChild = { hidden: { opacity: 0, y: 18, scale: 0.94 }, show: { opacity: 1, y: 0, scale: 1 } };

/** Полоса крупных цифр-фактов. */
/** Мини-иконки для цифр-фактов — только inline SVG, без внешних ассетов. */
const KPI_ICONS = {
  percent: (
    <svg viewBox="0 0 24 24" fill="none"><circle cx="7" cy="7" r="2.6" stroke="currentColor" strokeWidth="1.8" /><circle cx="17" cy="17" r="2.6" stroke="currentColor" strokeWidth="1.8" /><path d="M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7.6V12l3.2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  bolt: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M13 3 5 13h5l-1 8 8-10h-5l1-8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="currentColor" fillOpacity="0.14" /></svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" stroke="currentColor" strokeWidth="1.7" /><circle cx="12" cy="9.5" r="2.4" stroke="currentColor" strokeWidth="1.7" /></svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M12 3 19 6v6c0 5-3.5 7.8-7 9-3.5-1.2-7-4-7-9V6l7-3Z" stroke="currentColor" strokeWidth="1.7" /><path d="M9 12l2.2 2.2L15.5 9.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.7" /><path d="M8.4 12.4l2.4 2.4 5-5.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8.6" r="2.7" stroke="currentColor" strokeWidth="1.7" /><path d="M4 19c0-2.8 2.3-4.6 5-4.6s5 1.8 5 4.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><circle cx="17" cy="9.4" r="2.2" stroke="currentColor" strokeWidth="1.6" /><path d="M15.4 14.8c1.9.3 3.6 1.6 3.6 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M12 3.6l2.4 5 5.4.6-4 3.8 1 5.4-4.8-2.7-4.8 2.7 1-5.4-4-3.8 5.4-.6L12 3.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor" fillOpacity="0.12" /></svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M20 4 3 11l6 2.4M20 4l-6.4 16-4.6-6.6M20 4 9.4 13.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  coins: (
    <svg viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="7" rx="6.4" ry="3" stroke="currentColor" strokeWidth="1.6" /><path d="M5.6 7v4.4c0 1.65 2.87 3 6.4 3s6.4-1.35 6.4-3V7" stroke="currentColor" strokeWidth="1.6" /><path d="M5.6 11.4v4.4c0 1.65 2.87 3 6.4 3s6.4-1.35 6.4-3v-4.4" stroke="currentColor" strokeWidth="1.6" /></svg>
  ),
  building: (
    <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="4" width="9" height="16" rx="1" stroke="currentColor" strokeWidth="1.6" /><path d="M14 9h5v11h-5" stroke="currentColor" strokeWidth="1.6" /><path d="M8 8h1M11 8h1M8 12h1M11 12h1M8 16h1M11 16h1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
  ),
  gem: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M4 9l3.2-5h9.6L20 9l-8 11L4 9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M4 9h16M8.8 4l3.2 5 3.2-5M12 20V9" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
  ),
  gift: (
    <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="9.4" width="16" height="10.6" rx="1" stroke="currentColor" strokeWidth="1.6" /><path d="M4 12.6h16M12 9.4v10.6" stroke="currentColor" strokeWidth="1.6" /><path d="M12 9.4C12 6.8 9.8 5 8 5.6c-1.4.5-1.6 2.6.3 3.1.9.2 2.4.5 3.7.7ZM12 9.4c0-2.6 2.2-4.4 4-3.8 1.4.5 1.6 2.6-.3 3.1-.9.2-2.4.5-3.7.7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
  ),
};

/** Число, которое «докручивается» от нуля при появлении в зоне видимости; нечисловые
 *  значения (например «слабировано», «Telegram») отображаются как есть, без анимации. */
function KpiValue({ val }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const m = /^(\D*)(\d+)(\D*)$/.exec(String(val));
  const spring = useSpring(0, { stiffness: 120, damping: 20, mass: 0.7 });
  const [n, setN] = useState(0);
  useEffect(() => {
    const unsub = spring.on('change', setN);
    return unsub;
  }, [spring]);
  useEffect(() => {
    if (inView && m) spring.set(Number(m[2]));
  }, [inView, m, spring]);
  if (!m) return <span ref={ref}>{val}</span>;
  return (
    <span ref={ref}>
      {m[1]}
      {Math.round(n)}
      {m[3]}
    </span>
  );
}

/**
 * Цифры-факты: карточки с фирменным фото под смысл каждой цифры. Фото — отдельная пара
 * под светлую/тёмную тему (imgDark/imgLight) в единой тональности (чёрный+красный / кремовый+золото),
 * поэтому переключение темы не «ломает» карточку. Без общей подложки — карточки сами по себе
 * достаточно насыщены, лишний фон только спорил бы с фото.
 */
/** Карточка цифры-факта с лёгким 3D-наклоном и бликом, следующим за курсором (только на
 *  устройствах с мышью — на тач-экранах эти эффекты просто не включаются). Плюс постоянные
 *  декоративные анимации (дыхание фото, пробегающий блеск, пульс у иконки), которые делают
 *  карточку «живой» даже без взаимодействия — это и было нужно, чтобы блоки цепляли взгляд. */
function KpiCard({ k, img, sizeClass, index }) {
  const cardRef = useRef(null);
  const rotX = useSpring(0, { stiffness: 220, damping: 22, mass: 0.6 });
  const rotY = useSpring(0, { stiffness: 220, damping: 22, mass: 0.6 });

  function handleMove(e) {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    rotY.set((px - 0.5) * 12);
    rotX.set((0.5 - py) * 9);
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
  }
  function handleLeave() {
    rotX.set(0);
    rotY.set(0);
  }

  return (
    <motion.div
      ref={cardRef}
      className={`rl-kpi${img ? ' rl-kpi--photo' : ''}`}
      variants={kpiChild}
      transition={{ duration: 0.6, ease: EASE }}
      whileHover={{ y: -6 }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ rotateX: rotX, rotateY: rotY, '--kpi-delay': `${index * 0.85}s` }}
    >
      {img && <img className="rl-kpi-photo" src={img} alt="" aria-hidden loading="lazy" decoding="async" />}
      {img && <span className="rl-kpi-photo-overlay" aria-hidden />}
      <span className="rl-kpi-shine" aria-hidden />
      <span className="rl-kpi-glare" aria-hidden />
      <span className="rl-kpi-content">
        <span className="rl-kpi-icon">
          <span className="rl-kpi-icon-ring" aria-hidden />
          {KPI_ICONS[k.icon] || KPI_ICONS.star}
        </span>
        <span className={`rl-kpi-val ${sizeClass}`.trim()}><KpiValue val={k.val} /></span>
        <span className="rl-kpi-label">{k.label}</span>
      </span>
    </motion.div>
  );
}

export function RuKpis({ items }) {
  const theme = useRlTheme();
  return (
    <motion.div className="rl-kpis" variants={kpiParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-10% 0px' }}>
      {items.map((k, index) => {
        // Длинные значения («слабировано», «бесплатно») не переносятся — вместо этого
        // уменьшаем кегль, чтобы слово всегда оставалось в одну строку.
        const len = String(k.val).replace(/\s+/g, ' ').trim().length;
        const sizeClass = len > 10 ? 'rl-kpi-val--xs' : len > 6 ? 'rl-kpi-val--sm' : '';
        const img = theme === 'light' ? (k.imgLight || k.imgDark || k.img) : (k.imgDark || k.imgLight || k.img);
        return <KpiCard key={k.label} k={k} img={img} sizeClass={sizeClass} index={index} />;
      })}
    </motion.div>
  );
}

/** Обёртка с 3D-наклоном, который «выпрямляется» при скролле — для фото/иллюстраций. */
export function RuTiltCard({ children, className = '' }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.95', 'start 0.45'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [14, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [50, 0]);
  const opacity = useTransform(scrollYProgress, [0, 0.4, 1], [0, 0.7, 1]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.95, 1]);
  return (
    <div className="rl-tilt-perspective" ref={ref}>
      <motion.div className={`rl-tilt ${className}`.trim()} style={{ rotateX, y, opacity, scale }}>
        {children}
      </motion.div>
    </div>
  );
}

function useRlTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setTheme(el.getAttribute('data-theme') || 'dark'));
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

const MARKET_CITIES = ['moscow', 'london']
  .map((key) => WORLD_CITIES.find((c) => c.key === key))
  .filter(Boolean);

/** Две биржевые площадки (Москва, Лондон) — живое время, фото меняется со сменой темы. */
export function RuMarketTiles({ className = '' }) {
  const [now, setNow] = useState(() => new Date());
  const theme = useRlTheme();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`rl-market-tiles ${className}`.trim()} aria-label="Мировые площадки золота">
      {MARKET_CITIES.map((c) => {
        const { hm, s } = tzParts(now, c.tz);
        const img = theme === 'light' ? c.imgLight : c.imgDark;
        return (
          <div key={c.key} className="rl-market-tile" style={{ backgroundImage: `url(${img})` }}>
            <div className="rl-market-tile-top">
              <span className="rl-market-tile-city"><i />{c.label}</span>
              <span className="rl-market-tile-code">{c.code} · {tzOffsetLabel(now, c.tz)}</span>
            </div>
            <div className="rl-market-tile-bottom">
              <span className="rl-market-tile-time">{hm}<b>:{s}</b></span>
              <span className="rl-market-tile-date">{tzDateLabel(now, c.tz)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Фото с лайтбоксом (переиспользует .il-lb* оверлей из общего IL_CSS). */
export function RuPhotoCard({ src, alt, caption, className = '' }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('il-lb-open');
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.documentElement.classList.remove('il-lb-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button type="button" className={`rl-photo ${className}`.trim()} onClick={() => setOpen(true)} aria-label={`Открыть фото: ${alt}`}>
        <img src={src} alt={alt} loading="lazy" decoding="async" />
        {caption && <span className="rl-photo-caption">{caption}</span>}
        <span className="rl-photo-zoom" aria-hidden>⤢</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="il-lb" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} role="dialog" aria-modal="true" aria-label="Просмотр фото">
            <button type="button" className="il-lb-backdrop" aria-label="Закрыть" onClick={() => setOpen(false)} />
            <button type="button" className="il-lb-close" aria-label="Закрыть" onClick={() => setOpen(false)}>×</button>
            <motion.figure className="il-lb-figure" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.22, ease: EASE }}>
              <img src={src} alt={alt} draggable={false} />
              {caption && <figcaption>{caption}</figcaption>}
            </motion.figure>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Единый плавный скролл (Lenis) для всех страниц черновика reaktivo.ru. */
export function useRuLenis() {
  const lenisRef = useRef(null);
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const lenis = new Lenis({ duration: 1.2, easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)), smoothWheel: true });
    lenisRef.current = lenis;
    let raf = requestAnimationFrame(function loop(time) {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    });
    return () => { cancelAnimationFrame(raf); lenis.destroy(); lenisRef.current = null; };
  }, []);
  return lenisRef;
}

/** Живой курс золота — тот же публичный источник, что у reaktivo.pro. */
export function useGoldQuote() {
  const [quote, setQuote] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => clientApi.buybackQuote('moex').then((q) => { if (alive) setQuote(q); }).catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return quote;
}

export function setDraftMeta(title) {
  document.title = title;
  let meta = document.querySelector('meta[name="robots"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'robots');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', 'noindex, nofollow');
}

const NAV = [
  { href: '/ru/prodat/', label: 'Продать' },
  { href: '/ru/slitki/', label: 'Слитки' },
  { href: '/ru/resale/', label: 'Resale' },
  { href: '/ru/agenty/', label: 'Работа' },
  { href: '/ru/franshiza/', label: 'Франшиза' },
  { href: '/ru/partneram/', label: 'Партнёрам' },
];

export function RuHeader({ active, lenisRef, ctaHref = '/ru/prodat/', ctaLabel = 'Продать золото' }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [menuOpen]);

  return (
    <>
      <header className={`il-header${scrolled ? ' il-header--scrolled' : ''}`}>
        <div className="il-header-inner">
          <a href="/ru/" className="il-logo" aria-label="Reaktivo">
            <img className="il-logo-mark" src="/logo-reaktivo-mark.svg" alt="" width="40" height="40" />
            <span className="il-logo-text">REAKTIVO</span>
          </a>
          <nav className="il-nav" aria-label="Основная навигация">
            <a href="/ru/" className={`il-nav-link${active === 'home' ? ' is-active' : ''}`}>Главная</a>
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className={`il-nav-link${active === n.href ? ' is-active' : ''}`}>{n.label}</a>
            ))}
          </nav>
          <div className="il-header-actions">
            <a href="tel:+78005551848" className="il-header-phone" title="8 800 555-18-48" aria-label="Позвонить">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z" />
              </svg>
            </a>
            <ThemeToggle />
            <motion.a href={ctaHref} className="il-btn il-btn--primary il-btn--header-buy" whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}>
              {ctaLabel}
            </motion.a>
            <button
              type="button"
              className={`il-menu-btn${menuOpen ? ' is-open' : ''}`}
              aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span /><span /><span />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div className="il-menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
            <button type="button" className="il-menu-backdrop" aria-label="Закрыть" onClick={() => setMenuOpen(false)} />
            <motion.div className="il-menu-sheet" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ duration: 0.28, ease: EASE }} role="dialog" aria-modal="true" aria-label="Меню">
              <div className="il-menu-head">
                <a href="/ru/" className="il-logo" onClick={() => setMenuOpen(false)}>
                  <img className="il-logo-mark" src="/logo-reaktivo-mark.svg" alt="" width="36" height="36" />
                  <span className="il-logo-text">REAKTIVO</span>
                </a>
                <button type="button" className="il-menu-close" aria-label="Закрыть" onClick={() => setMenuOpen(false)}>×</button>
              </div>
              <nav className="il-menu-nav">
                <a href="/ru/" onClick={() => setMenuOpen(false)}>Главная</a>
                {NAV.map((n) => (
                  <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)}>{n.label}</a>
                ))}
              </nav>
              <div className="il-menu-actions">
                <a href={ctaHref} className="il-btn il-btn--primary" onClick={() => setMenuOpen(false)}>{ctaLabel}</a>
              </div>
              <div className="il-menu-contacts">
                <a href="tel:+78005551848" className="il-menu-phone">8 800 555-18-48</a>
                <a href="mailto:team@reaktivo.ru" className="il-menu-mail">Team@reaktivo.ru</a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function RuFooter() {
  return (
    <footer className="il-footer">
      <div className="il-section-inner">
        <div className="il-footer-grid">
          <div className="il-footer-brand">
            <a href="/ru/" className="il-logo">
              <img className="il-logo-mark" src="/logo-reaktivo-mark.svg" alt="" width="32" height="32" />
              <span className="il-logo-text">REAKTIVO</span>
            </a>
            <p>Финтех-сервис покупки и продажи золота по биржевому курсу: собственные отделения и курьеры.</p>
          </div>
          <div className="il-footer-col">
            <span className="il-footer-col-title">Продать и купить</span>
            <a href="/ru/prodat/" className="il-nav-link">Выкуп золота</a>
            <a href="/ru/slitki/" className="il-nav-link">Ювелирные слитки</a>
            <a href="/ru/resale/" className="il-nav-link">Reaktivo Resale</a>
          </div>
          <div className="il-footer-col">
            <span className="il-footer-col-title">Работать с нами</span>
            <a href="/ru/agenty/" className="il-nav-link">Работа</a>
            <a href="/ru/franshiza/" className="il-nav-link">Франшиза</a>
            <a href="/ru/partneram/" className="il-nav-link">Партнёрам</a>
          </div>
          <div className="il-footer-col">
            <span className="il-footer-col-title">Контакты</span>
            <a href="tel:+74956460044" className="il-nav-link">Москва: 8 (495) 646-00-44</a>
            <a href="tel:+78005551848" className="il-nav-link">По России: 8 (800) 555-18-48</a>
            <a href="mailto:team@reaktivo.ru" className="il-nav-link">team@reaktivo.ru</a>
            <a href="/kabinet" className="il-nav-link">Личный кабинет</a>
          </div>
        </div>
        <div className="il-footer-bottom">
          <span>© 2026 Reaktivo. Черновик для внутреннего обсуждения.</span>
        </div>
      </div>
    </footer>
  );
}

export function RuSbpBadge({ className = '' }) {
  return (
    <span className={`rl-sbp ${className}`.trim()} title="Система быстрых платежей" role="img" aria-label="СБП">
      <img src="/sbp-icon.png" alt="" width="18" height="22" decoding="async" />
      <b>СБП</b>
    </span>
  );
}

export function RuFaq({ items }) {
  const [openFaq, setOpenFaq] = useState(-1);
  return (
    <div className="il-faq">
      {items.map((f, i) => (
        <div key={f.q} className={`il-faq-item${openFaq === i ? ' il-faq-item--open' : ''}`}>
          <button type="button" className="il-faq-q" onClick={() => setOpenFaq((v) => (v === i ? -1 : i))} aria-expanded={openFaq === i}>
            <span className="il-faq-q-text">{f.q}</span>
            <span className={`il-faq-plus${openFaq === i ? ' is-open' : ''}`}>+</span>
          </button>
          <AnimatePresence initial={false}>
            {openFaq === i && (
              <motion.div className="il-faq-a" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: EASE }}>
                <p>{f.a}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

/**
 * Единая форма заявки для лендингов: POST /api/public/landing-lead →
 * запись в базе (панель, раздел «Заявки с сайта») + push в Telegram.
 *
 * name и phone — системные поля, остальные описываются через fields:
 * [{ key, label, placeholder, required, textarea, full }] — label уходит
 * подписью поля в Telegram и в панель.
 */
export function RuLeadForm({
  source,
  title,
  note,
  cta = 'Отправить заявку',
  successNote = 'Мы свяжемся с вами в ближайшее время.',
  namePlaceholder = 'Ваше имя',
  phonePlaceholder = 'Телефон или Telegram',
  phoneTel = false,
  fields = [],
}) {
  const [phase, setPhase] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    if (phase === 'sending') return;
    const fd = new FormData(e.currentTarget);
    const payload = {
      source,
      name: String(fd.get('name') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      website: String(fd.get('website') || ''),
      fields: {},
    };
    for (const f of fields) {
      const v = String(fd.get(f.key) || '').trim();
      if (v) payload.fields[f.label] = v;
    }
    setPhase('sending');
    setError('');
    try {
      await clientApi.landingLead(payload);
      setPhase('sent');
    } catch (err) {
      setPhase('idle');
      setError(err?.message || 'Не получилось отправить. Попробуйте ещё раз или позвоните: 8 800 555-18-48');
    }
  }

  if (phase === 'sent') {
    return (
      <motion.div className="rl-form" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }}>
        <div className="rl-form-full rl-sent" role="status">
          <motion.span
            className="rl-sent-icon"
            initial={{ scale: 0, rotate: -28 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 15, delay: 0.08 }}
            aria-hidden
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <motion.path
                d="M4.5 12.5l5 5L19.5 7"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.45, delay: 0.35, ease: 'easeOut' }}
              />
            </svg>
          </motion.span>
          <h3>Заявка принята</h3>
          <p className="rl-form-note">{successNote}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <form className="rl-form" onSubmit={onSubmit}>
      <div className="rl-form-full">
        <h3>{title}</h3>
        {note && <p className="rl-form-note">{note}</p>}
      </div>
      <input className="rl-input" name="name" placeholder={namePlaceholder} required maxLength={120} autoComplete="name" />
      <input
        className="rl-input"
        name="phone"
        placeholder={phonePlaceholder}
        required
        maxLength={120}
        inputMode={phoneTel ? 'tel' : undefined}
        autoComplete={phoneTel ? 'tel' : undefined}
      />
      {fields.map((f) => {
        const input = f.textarea ? (
          <textarea key={f.key} className="rl-input" name={f.key} rows={2} placeholder={f.placeholder} required={f.required} maxLength={500} />
        ) : (
          <input key={f.key} className="rl-input" name={f.key} placeholder={f.placeholder} required={f.required} maxLength={300} />
        );
        return f.full || f.textarea ? <div key={f.key} className="rl-form-full">{input}</div> : input;
      })}
      {/* Ловушка для ботов: люди это поле не видят */}
      <input className="rl-hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="rl-form-full">
        <motion.button
          type="submit"
          className="il-btn il-btn--primary il-btn--lg"
          style={{ width: '100%' }}
          disabled={phase === 'sending'}
          whileTap={{ scale: 0.97 }}
        >
          {phase === 'sending' ? (<><span className="rl-btn-spin" aria-hidden /> Отправляем…</>) : cta}
        </motion.button>
        <AnimatePresence>
          {error && (
            <motion.p className="rl-form-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}

/** Красная финальная панель: форма заявки или заголовок + кнопка, как на «Продать». */
export function RuCtaPanel({ children }) {
  return <div className="il-cta-panel rl-cta-panel">{children}</div>;
}

export const RL_CSS = `
.rl-preview-flag {
  position: fixed; bottom: 16px; left: 16px; z-index: 90;
  font-size: 11.5px; font-weight: 700; letter-spacing: 0.02em; color: #fff;
  background: var(--accent); padding: 8px 14px; border-radius: 99px;
  box-shadow: 0 10px 26px rgba(0,0,0,0.35); opacity: 0.94;
}
.il-nav-link.is-active { color: var(--text-strong); }
.il-nav-link.is-active::after { transform: scaleX(1); transform-origin: left; }

/* ── Шапка: на ПК горизонтальное меню, бургер только на планшете и мобиле ──
   Базовый IL_CSS прячет меню уже ниже 1280px — для .ru порог опускаем до 1024px,
   в узкой зоне 1025–1279px меню уплотняется, чтобы все 7 пунктов помещались. */
@media (min-width: 1025px) {
  .rl-root .il-nav { display: flex; }
  .rl-root .il-menu-btn { display: none; }
}
@media (min-width: 1025px) and (max-width: 1279px) {
  .rl-root .il-header-inner { gap: 10px; padding: 14px 18px; }
  .rl-root .il-nav { gap: 9px; }
  .rl-root .il-nav-link { font-size: 0.78rem; }
  .rl-root .il-header-actions { gap: 8px; }
  .rl-root .il-btn--header-buy { padding: 10px 14px; font-size: 0.8rem; }
}
@media (max-width: 1024px) {
  .rl-root .il-nav { display: none; }
  .rl-root .il-menu-btn { display: inline-flex; }
}

/* ── Атмосфера страницы: глубина, не пустой графит ── */
.rl-root.il-root {
  isolation: isolate;
  background-image:
    radial-gradient(ellipse 90% 58% at 88% -8%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 56%),
    radial-gradient(ellipse 70% 48% at -12% 38%, rgba(196, 150, 72, 0.10), transparent 58%),
    radial-gradient(ellipse 85% 42% at 50% 108%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 58%),
    var(--bg-gradient);
}
.rl-aurora, .rl-dust, .rl-vignette, .rl-grain {
  position: fixed; inset: 0; pointer-events: none;
}
.rl-aurora { z-index: 0; overflow: hidden; }
.rl-aurora span {
  position: absolute; border-radius: 50%;
  will-change: transform;
}
.rl-aurora-a {
  width: min(72vw, 760px); height: min(72vw, 760px);
  top: -18%; right: -22%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 24%, transparent), transparent 68%);
}
.rl-aurora-b {
  width: min(64vw, 620px); height: min(64vw, 620px);
  left: -24%; bottom: 6%;
  background: radial-gradient(circle, rgba(201, 158, 78, 0.16), transparent 70%);
}
.rl-aurora-c {
  width: min(50vw, 480px); height: min(50vw, 480px);
  top: 42%; left: 38%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.045), transparent 70%);
}
.rl-dust {
  z-index: 1;
  background-image:
    radial-gradient(1.2px 1.2px at 8% 12%, rgba(232, 196, 120, 0.42), transparent),
    radial-gradient(1px 1px at 22% 38%, rgba(255, 255, 255, 0.16), transparent),
    radial-gradient(1.4px 1.4px at 41% 18%, rgba(232, 196, 120, 0.28), transparent),
    radial-gradient(1px 1px at 63% 8%, rgba(255, 255, 255, 0.14), transparent),
    radial-gradient(1.2px 1.2px at 81% 26%, rgba(232, 196, 120, 0.32), transparent),
    radial-gradient(1px 1px at 93% 48%, rgba(255, 255, 255, 0.12), transparent),
    radial-gradient(1.3px 1.3px at 14% 72%, rgba(232, 196, 120, 0.22), transparent),
    radial-gradient(1px 1px at 34% 88%, rgba(255, 255, 255, 0.12), transparent),
    radial-gradient(1.2px 1.2px at 58% 64%, rgba(232, 196, 120, 0.26), transparent),
    radial-gradient(1px 1px at 76% 82%, rgba(255, 255, 255, 0.14), transparent);
  opacity: 0.7;
}
.rl-vignette {
  z-index: 4;
  background:
    radial-gradient(ellipse 85% 75% at 50% 42%, transparent 42%, color-mix(in srgb, var(--bg-deep) 42%, transparent) 100%);
}
.rl-grain {
  z-index: 46;
  opacity: 0.04;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  background-size: 180px 180px;
}
.rl-cursor-glow {
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 11%, transparent), rgba(201, 158, 78, 0.05) 38%, transparent 68%);
}

.rl-hero-stage { overflow: hidden; }
.rl-root .il-hero-orb--1 { opacity: 0.28; }
.rl-root .il-hero-orb--2 { opacity: 0.16; }
.rl-hero-orb-gold {
  position: absolute; width: 380px; height: 380px; left: 28%; top: 18%; border-radius: 50%;
  background: radial-gradient(circle, rgba(201, 158, 78, 0.16), transparent 66%);
  pointer-events: none;
}
.rl-hero-ring {
  position: absolute; width: min(78vw, 680px); height: min(78vw, 680px);
  right: -12%; top: 4%; border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--accent) 16%, var(--stroke));
  box-shadow:
    0 0 0 42px color-mix(in srgb, var(--accent) 4%, transparent),
    0 0 0 92px color-mix(in srgb, var(--accent) 2.5%, transparent),
    inset 0 0 80px color-mix(in srgb, var(--accent) 6%, transparent);
  opacity: 0.85;
}
.rl-hero-wash {
  position: absolute; inset: 0;
  background: conic-gradient(from 210deg at 78% 18%, transparent 0 62%, color-mix(in srgb, var(--accent) 7%, transparent) 72%, transparent 86%);
  opacity: 0.7;
}
.rl-hero-floor {
  position: absolute; left: 0; right: 0; bottom: 0; height: 46%;
  background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--accent) 6%, transparent) 72%, transparent);
}

.rl-root .il-section-inner, .rl-root .il-hero-inner { position: relative; z-index: 2; }
/* У секций нет собственных подложек и свечений: фон один на всю страницу,
   поэтому стыков между секциями не существует в принципе. */
.rl-root .il-section--alt { background: none; border-top: 0; border-bottom: 0; }
.rl-root .il-marquee {
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent 18%, transparent 82%, color-mix(in srgb, var(--accent) 8%, transparent)),
    color-mix(in srgb, var(--bg-panel-solid) 55%, transparent);
}
/* Бегущая строка крутится всегда — в том числе на телефонах и при системном
   «уменьшении анимаций» (владелец явно попросил постоянное движение). */
.rl-root .il-marquee-track { animation: ilMarquee 38s linear infinite; will-change: transform; }
.rl-root .il-card {
  background:
    linear-gradient(165deg, color-mix(in srgb, #fff 5%, var(--bg-panel-solid)) 0%, var(--bg-panel-solid) 46%);
  box-shadow: var(--shadow-card), inset 0 1px 0 rgba(255,255,255,0.05);
}
/* ── Красный финальный CTA: форма или заголовок + кнопка, без тёмной карточки ── */
.rl-cta-panel { padding: clamp(36px, 5vw, 56px) clamp(20px, 5vw, 44px); text-align: left; }
.rl-cta-panel:not(:has(.rl-form)) { text-align: center; }
.rl-cta-panel .il-h2 { color: #fff; }
.rl-cta-panel > p {
  color: rgba(255, 255, 255, 0.88); margin: 14px auto 26px; max-width: 48ch;
  font-size: 1.02rem; line-height: 1.6;
}
.rl-cta-panel:not(:has(.rl-form)) .il-btn--primary {
  background: #fff; color: var(--accent); box-shadow: 0 14px 40px -12px rgba(0, 0, 0, 0.45);
  min-height: 54px;
}
.rl-cta-panel:not(:has(.rl-form)) .il-btn--primary:hover { transform: translateY(-2px); }
.rl-cta-panel .rl-form {
  position: relative; background: none; border: 0; box-shadow: none; padding: 0; color: #fff;
  align-items: start;
}
.rl-cta-panel .rl-form h3,
.rl-cta-panel .rl-form-full h3,
.rl-cta-panel .rl-sent h3 { color: #fff; font-size: clamp(1.4rem, 2.6vw, 1.85rem); }
.rl-cta-panel .rl-form-note,
.rl-cta-panel .rl-sent .rl-form-note { color: rgba(255, 255, 255, 0.88); }
.rl-cta-panel .rl-input {
  background: rgba(255, 255, 255, 0.16); border-color: rgba(255, 255, 255, 0.34);
  color: #fff; height: 52px; min-height: 52px; max-height: 52px; padding: 0 16px; line-height: normal;
}
.rl-cta-panel textarea.rl-input { height: auto; min-height: 72px; max-height: none; padding: 12px 16px; line-height: 1.45; }
.rl-cta-panel .rl-input::placeholder { color: rgba(255, 255, 255, 0.72); }
.rl-cta-panel .rl-input:focus { border-color: #fff; box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.22); }
.rl-cta-panel .rl-form .il-btn--primary {
  background: #fff; color: var(--accent); box-shadow: 0 14px 40px -12px rgba(0, 0, 0, 0.45);
  min-height: 54px; line-height: 1.2; padding-top: 16px; padding-bottom: 16px;
}
.rl-cta-panel .rl-form .il-btn--primary:hover { transform: translateY(-2px); }
.rl-cta-panel .rl-btn-spin { border-color: color-mix(in srgb, var(--accent) 35%, transparent); border-top-color: var(--accent); }
.rl-cta-panel .rl-form-error { color: #fff; font-weight: 700; }

/* ── Сравнительная таблица: украшение vs слиток Reaktivo ── */
.rl-compare {
  display: flex; flex-direction: column; border-radius: 22px; border: 1px solid var(--stroke-soft);
  overflow: hidden; background: var(--bg-panel);
}
.rl-compare-row {
  display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 12px; align-items: center;
  padding: 14px 20px; border-top: 1px solid var(--stroke-soft); font-size: 0.9rem;
}
.rl-compare-row:first-child { border-top: none; }
.rl-compare-head { font-size: 0.76rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-dim); padding-bottom: 16px; }
.rl-compare-label { color: var(--text-muted); font-weight: 600; }
.rl-compare-win { color: var(--accent); font-weight: 700; }
@media (max-width: 640px) {
  .rl-compare-row { grid-template-columns: 1fr; gap: 3px; padding: 14px 16px; text-align: left; }
  .rl-compare-head { display: none; }
  .rl-compare-label { font-size: 0.78rem; opacity: 0.75; }
  .rl-compare-row > span:nth-child(2)::before { content: 'Украшение: '; font-weight: 700; opacity: 0.6; }
  .rl-compare-row > span:nth-child(3)::before { content: 'Слиток Reaktivo: '; font-weight: 700; }
}

.rl-stars { display: inline-flex; gap: 3px; margin-bottom: 12px; color: var(--accent); }
.rl-stars svg { width: 15px; height: 15px; }
.rl-statement { position: relative; }
.rl-root .il-footer {
  position: relative;
  background:
    radial-gradient(ellipse 90% 80% at 50% 120%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 55%),
    color-mix(in srgb, var(--bg-panel-solid) 35%, transparent);
}

/* Единый фон страницы: компактные тёплые ореолы по краям, чередуются
   слева/справа по всей длине и затухают радиально — швов нет по построению.
   Центр полосы остаётся чистым под текст. */
.rl-root.il-root {
  background-image:
    radial-gradient(1100px 700px at 88% -160px, color-mix(in srgb, var(--accent) 15%, transparent), transparent 70%),
    radial-gradient(950px 640px at -8% 16%, rgba(201, 158, 78, 0.10), transparent 70%),
    radial-gradient(1050px 700px at 110% 42%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%),
    radial-gradient(950px 660px at -10% 68%, rgba(201, 158, 78, 0.075), transparent 70%),
    radial-gradient(1100px 760px at 108% 92%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 70%),
    var(--bg-gradient);
}
:root[data-theme='light'] .rl-root.il-root {
  background-image:
    radial-gradient(1100px 700px at 88% -160px, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%),
    radial-gradient(950px 640px at -8% 16%, rgba(186, 142, 72, 0.07), transparent 70%),
    radial-gradient(1050px 700px at 110% 42%, color-mix(in srgb, var(--accent) 6%, transparent), transparent 70%),
    radial-gradient(950px 660px at -10% 68%, rgba(186, 142, 72, 0.055), transparent 70%),
    radial-gradient(1100px 760px at 108% 92%, color-mix(in srgb, var(--accent) 5%, transparent), transparent 70%),
    var(--bg-gradient);
}
/* Светлая тема: серый текст на белом был слишком бледным — поднимаем контраст. */
:root[data-theme='light'] .rl-root {
  --text-muted: rgba(24, 26, 28, 0.82);
  --text-dim: rgba(24, 26, 28, 0.64);
}
:root[data-theme='light'] .rl-dust { display: none; }
:root[data-theme='light'] .rl-grain { mix-blend-mode: multiply; opacity: 0.028; }
:root[data-theme='light'] .rl-vignette { opacity: 0.35; }
:root[data-theme='light'] .rl-aurora-a { opacity: 0.3; }
:root[data-theme='light'] .rl-aurora-b { opacity: 0.24; }
:root[data-theme='light'] .rl-root .il-card {
  background: linear-gradient(165deg, #fff 0%, var(--bg-panel-solid) 70%);
}

@media (min-width: 900px) and (pointer: fine) {
  .rl-aurora-a { animation: rlDriftA 26s ease-in-out infinite alternate; }
  .rl-aurora-b { animation: rlDriftB 32s ease-in-out infinite alternate; }
  .rl-aurora-c { animation: rlDriftC 22s ease-in-out infinite alternate; }
}
@keyframes rlDriftA { to { transform: translate3d(-6%, 8%, 0) scale(1.06); } }
@keyframes rlDriftB { to { transform: translate3d(8%, -6%, 0) scale(1.08); } }
@keyframes rlDriftC { to { transform: translate3d(-4%, 5%, 0); } }
@media (prefers-reduced-motion: reduce) {
  .rl-aurora-a, .rl-aurora-b, .rl-aurora-c { animation: none !important; }
}

.rl-hero-title { max-width: 640px; }
.rl-products {
  display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px;
  grid-column: auto; grid-row: auto; height: auto;
}
.rl-products .il-product {
  flex: none;
  min-height: 220px;
  color: var(--text-strong);
  background: var(--bg-panel-solid);
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow-card);
  outline: none;
  filter: none;
}
.rl-products .il-product:hover {
  filter: none;
  border-color: color-mix(in srgb, var(--accent) 38%, var(--stroke));
  box-shadow: 0 22px 44px -28px color-mix(in srgb, var(--accent) 28%, transparent);
}
.rl-products .il-product-tag { color: var(--accent); }
.rl-products .il-product-title { color: var(--text-strong); }
.rl-products .il-product-text { color: var(--text-muted); }
.rl-products .il-product-link {
  color: #fff;
  background: var(--accent);
  box-shadow: 0 8px 18px -8px color-mix(in srgb, var(--accent) 45%, transparent);
}
.rl-products .rl-product--soon .il-product-tag { color: var(--text-dim); }
.rl-product--soon { opacity: 0.72; cursor: default; }
.rl-soon-chip {
  display: inline-flex; align-self: flex-start; margin-top: 4px;
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--text-dim); background: var(--stroke-soft); border: 1px solid var(--stroke);
  padding: 5px 10px; border-radius: 99px;
}
.rl-root .il-faq { border-top: none; }
.rl-root .il-faq-item { border-bottom: none; overflow: hidden; }
.rl-root .il-faq-q {
  width: 100%; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
  padding: 18px 14px 16px 20px; text-align: left; font-size: 1.02rem; font-weight: 600; letter-spacing: -0.01em;
  color: var(--text-strong); background: none; border: none; cursor: pointer; font-family: inherit;
  box-sizing: border-box;
}
.rl-root .il-faq-q-text { flex: 1; min-width: 0; line-height: 1.35; padding-top: 3px; }
.rl-root .il-faq-plus {
  width: 28px; height: 28px; border-radius: 50%; background: var(--bg-panel-solid); border: 1px solid var(--stroke);
  display: flex; align-items: center; justify-content: center; line-height: 1; flex: none; font-size: 16px;
  color: var(--accent); transition: transform 0.3s; padding: 0 0 2px; margin-top: 1px;
}
.rl-root .il-faq-plus.is-open { transform: rotate(45deg); background: var(--accent); color: #fff; border-color: var(--accent); }
.rl-root .il-faq-a { overflow: hidden; padding: 0 20px 18px; }
.rl-root .il-faq-a p {
  font-size: 0.94rem; line-height: 1.6; color: var(--text-muted);
  padding: 0; margin: 0; max-width: none; box-sizing: border-box;
}

.rl-cta-box {
  text-align: center; background: var(--bg-panel); border: 1px solid var(--stroke); border-radius: 28px;
  padding: 56px 40px; box-shadow: var(--shadow-card);
}
.rl-cta-box p { margin: 14px auto 26px; color: var(--text-muted); max-width: 48ch; font-size: 1.02rem; line-height: 1.6; }

/* ── Калькулятор ── */
/* Плотная непрозрачная подложка вместо backdrop-filter: на части устройств
   (в частности macOS/Safari) размытие поверх декоративных орбов фона давало
   неровный, «грязный» узор внутри карточки. Так подложка простая и одинаковая
   везде — фон карточки не зависит от того, что происходит позади неё. */
.rl-calc-card {
  width: 100%; max-width: 400px; border: 1px solid var(--stroke);
  border-radius: 24px; padding: 26px; box-shadow: var(--shadow-card);
  background: linear-gradient(165deg, color-mix(in srgb, #fff 6%, var(--bg-panel-solid)) 0%, var(--bg-panel-solid) 60%);
}
:root[data-theme='light'] .rl-calc-card {
  background: linear-gradient(165deg, #ffffff 0%, var(--bg-panel-solid) 100%);
  box-shadow: var(--shadow-card), 0 1px 0 rgba(255,255,255,0.6) inset;
}
.rl-calc-card.rl-calc-card--wide { max-width: 440px; }
.rl-calc-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
.rl-calc-brand { font-size: 0.78rem; font-weight: 800; letter-spacing: 0.06em; color: var(--text-dim); }
.rl-calc-brand i { color: var(--accent); margin: 0 2px; }
.rl-calc-live { display: inline-flex; align-items: center; gap: 6px; font-size: 0.76rem; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.04em; }
.rl-calc-live i { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: ilPulse 1.8s ease-in-out infinite; }
.rl-calc-label { font-size: 0.98rem; font-weight: 700; color: var(--text-strong); }
.rl-calc-note { font-size: 0.82rem; color: var(--text-dim); margin: 4px 0 0; }
.rl-seg { display: flex; gap: 4px; background: var(--stroke-soft); border-radius: 12px; padding: 4px; margin-top: 16px; }
.rl-seg button {
  flex: 1; padding: 9px 4px; border-radius: 9px; font-size: 0.82rem; font-weight: 600; font-family: inherit;
  color: var(--text-dim); background: none; border: none; cursor: pointer; transition: 0.2s;
}
.rl-seg button.is-active { background: var(--bg-panel-solid); color: var(--text-strong); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
.rl-calc-row { display: flex; justify-content: space-between; align-items: baseline; margin-top: 18px; font-size: 0.76rem; color: var(--text-dim); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.rl-calc-row b { font-size: 1rem; color: var(--text-strong); font-weight: 700; letter-spacing: 0; }
.rl-calc-num {
  width: 74px; text-align: right; font: inherit; font-size: 1rem; font-weight: 700; letter-spacing: 0;
  color: var(--text-strong); background: var(--bg-panel-solid); border: 1px solid var(--stroke);
  border-radius: 8px; padding: 4px 8px;
}
.rl-calc-num::-webkit-outer-spin-button,
.rl-calc-num::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.rl-calc-num { -moz-appearance: textfield; appearance: textfield; }
.rl-calc-card input[type=range],
.rl-calc-range {
  width: 100%; margin-top: 10px; accent-color: var(--accent);
  height: 28px; cursor: pointer;
}
.rl-calc-out { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--stroke-soft); display: flex; flex-direction: column; gap: 4px; }
.rl-calc-out-label { font-size: 0.78rem; color: var(--text-dim); }
.rl-calc-out-val { font-size: clamp(1.7rem, 3vw, 2.1rem); font-weight: 800; letter-spacing: -0.02em; color: var(--text-strong); font-variant-numeric: tabular-nums; }
.rl-calc-cta { display: block; width: 100%; text-align: center; margin-top: 18px; }
.rl-sbp { display: inline-flex; align-items: center; gap: 3px; vertical-align: -3px; margin-left: 6px; }
.rl-sbp img { height: 15px; width: auto; display: block; }
.rl-sbp b { font-size: 0.72em; font-weight: 800; letter-spacing: 0.01em; color: var(--text-dim); }
.rl-calc-out-label { display: inline-flex; align-items: center; }
.rl-calc-mini { display: flex; gap: 18px; margin-top: 14px; flex-wrap: wrap; }
.rl-calc-mini div { font-size: 0.72rem; color: var(--text-dim); }
.rl-calc-mini b { display: block; font-size: 0.92rem; color: var(--text-strong); font-weight: 700; margin-top: 2px; }

.rl-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 20px; border-radius: 99px; font-size: 0.9rem; font-weight: 700; text-decoration: none; transition: 0.2s; }
.rl-btn--primary { background: var(--accent-grad); color: #fff; box-shadow: 0 8px 18px -8px color-mix(in srgb, var(--accent) 42%, transparent); }
.rl-btn--primary:hover { transform: translateY(-1px); }

/* ── Строки процесса / сравнения ── */
.rl-rows { border-top: 1px solid var(--stroke-soft); }
.rl-row { display: grid; grid-template-columns: auto 1fr; gap: 18px; align-items: start; padding: 22px 4px; border-bottom: 1px solid var(--stroke-soft); }
.rl-row-n { font-family: var(--font-display); font-weight: 800; font-size: 0.78rem; color: var(--text-dim); padding-top: 3px; }
.rl-row h4 { font-size: 1.02rem; font-weight: 700; color: var(--text-strong); margin: 0; letter-spacing: -0.01em; }
.rl-row p { font-size: 0.88rem; color: var(--text-muted); margin: 6px 0 0; line-height: 1.55; }

.rl-vs { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.rl-vs-col { border-radius: 22px; padding: 30px 28px; border: 1px solid var(--stroke); }
.rl-vs-col--old { background: var(--bg-panel); }
.rl-vs-col--new { background: linear-gradient(140deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000)); border-color: transparent; color: #fff; }
.rl-vs-tag { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; padding: 5px 11px; border-radius: 99px; display: inline-block; }
.rl-vs-col--old .rl-vs-tag { background: var(--stroke-soft); color: var(--text-dim); }
.rl-vs-col--new .rl-vs-tag { background: rgba(255,255,255,0.2); color: #fff; }
.rl-vs-col h4 { font-size: 1.2rem; font-weight: 700; margin: 16px 0 0; letter-spacing: -0.02em; line-height: 1.3; }
.rl-vs-col ul { list-style: none; margin: 18px 0 0; padding: 0; display: grid; gap: 9px; }
.rl-vs-col li { font-size: 0.88rem; line-height: 1.5; display: flex; gap: 9px; }
.rl-vs-col--old li { color: var(--text-muted); }
.rl-vs-col--old li::before { content: '—'; flex: none; }
.rl-vs-col--new li { color: rgba(255,255,255,0.92); }
.rl-vs-col--new li::before { content: '✓'; flex: none; font-weight: 800; }
.rl-vs-fig { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--stroke); font-family: var(--font-display); font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; }
.rl-vs-col--new .rl-vs-fig { border-top-color: rgba(255,255,255,0.28); }
.rl-vs-figl { font-size: 0.74rem; opacity: 0.72; margin-top: 4px; }

.rl-lvls { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; }
.rl-lvl { background: var(--bg-panel); border: 1px solid var(--stroke); border-radius: 20px; padding: 24px 22px; }
.rl-lvl--top { background: linear-gradient(140deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000)); border-color: transparent; color: #fff; }
.rl-lvl-st { font-family: var(--font-display); font-size: 0.7rem; letter-spacing: 0.1em; font-weight: 800; color: var(--accent); }
.rl-lvl--top .rl-lvl-st { color: rgba(255,255,255,0.85); }
.rl-lvl-stars { font-size: 1.05rem; letter-spacing: 0.08em; }
.rl-lvl h4 { font-size: 1.08rem; font-weight: 700; margin: 10px 0 4px; letter-spacing: -0.015em; }
.rl-lvl-cond { font-size: 0.78rem; color: var(--text-dim); }
.rl-lvl--top .rl-lvl-cond { color: rgba(255,255,255,0.7); }
.rl-lvl ul { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 7px; }
.rl-lvl li { font-size: 0.82rem; color: var(--text-muted); display: flex; gap: 7px; line-height: 1.4; }
.rl-lvl--top li { color: rgba(255,255,255,0.82); }
.rl-lvl li::before { content: '·'; color: var(--accent); font-weight: 800; flex: none; }
.rl-lvl--top li::before { color: #fff; }

.rl-form { background: var(--bg-panel); border: 1px solid var(--stroke); border-radius: 26px; padding: 34px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; box-shadow: var(--shadow-card); }
.rl-form-full { grid-column: 1 / -1; }
.rl-form h3 { font-size: 1.3rem; font-weight: 700; letter-spacing: -0.02em; margin: 0; color: var(--text-strong); }
.rl-form-note { font-size: 0.86rem; color: var(--text-muted); margin: 8px 0 0; }
.rl-input { width: 100%; background: var(--bg-panel-solid); border: 1px solid var(--stroke); border-radius: 12px; padding: 13px 16px; font: inherit; font-size: 0.9rem; color: var(--text-strong); box-sizing: border-box; transition: border-color 0.2s, box-shadow 0.2s; }
.rl-input::placeholder { color: var(--text-dim); }
.rl-input:focus { outline: none; border-color: color-mix(in srgb, var(--accent) 55%, var(--stroke)); box-shadow: 0 0 0 3px var(--accent-soft); }
textarea.rl-input { resize: vertical; min-height: 52px; }
.rl-form { position: relative; }
.rl-hp { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.rl-form-error { margin: 10px 0 0; font-size: 0.85rem; color: var(--accent-strong); text-align: center; }
.rl-sent { text-align: center; padding: 26px 0; display: grid; justify-items: center; gap: 6px; }
.rl-sent-icon { width: 58px; height: 58px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; background: var(--accent-grad, var(--accent)); box-shadow: 0 12px 32px var(--accent-glow); margin-bottom: 10px; }
.rl-sent-icon svg { width: 30px; height: 30px; }
.rl-btn-spin { width: 15px; height: 15px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; animation: rlSpin 0.7s linear infinite; display: inline-block; vertical-align: -2px; margin-right: 8px; }
@keyframes rlSpin { to { transform: rotate(360deg); } }
.il-btn:disabled { opacity: 0.75; cursor: default; }

.rl-crumbs { padding: 108px 28px 0; max-width: 1360px; margin: 0 auto; font-size: 0.86rem; color: var(--text-dim); }
.rl-crumbs a { color: var(--accent); text-decoration: none; }
.il-section-lead { margin: 14px auto 0; max-width: 640px; font-size: 0.98rem; line-height: 1.55; color: var(--text-dim); }

/* ── Цифры-факты: карточки с фирменным фото (без общей подложки) ── */
.rl-kpis-section { padding: 64px 0 32px; }
.rl-kpis { position: relative; z-index: 1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; perspective: 1400px; }
.rl-kpi {
  display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 26px 10px 24px; border-radius: 20px;
  text-align: center; position: relative; overflow: hidden; min-width: 0;
  background: color-mix(in srgb, var(--bg-panel-solid) 60%, transparent);
  border: 1px solid var(--stroke-soft);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: border-color 260ms ease, box-shadow 260ms ease;
  transform-style: preserve-3d; will-change: transform; cursor: default;
}
.rl-kpi::before {
  content: ''; position: absolute; top: 0; left: 14%; right: 14%; height: 2px; border-radius: 0 0 4px 4px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent); background-size: 220% 100%;
  opacity: 0.75; animation: kpiLineSweep 5.5s linear infinite; animation-delay: var(--kpi-delay, 0s); z-index: 3;
}
.rl-kpi:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--stroke-soft));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 16px 34px -18px color-mix(in srgb, var(--accent) 50%, transparent);
}
.rl-kpi-content { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; }
/* Карточка с фото: тон всегда тёмный (не зависит от темы сайта) — так фото и обработка
   не «плывут» между светлой и тёмной темой, это и была главная сложность подбора фото. */
.rl-kpi--photo {
  padding: 0; min-height: clamp(200px, 22vw, 248px); justify-content: flex-end;
  background: #0a0605; border-color: rgba(255, 255, 255, 0.12);
}
.rl-kpi--photo::before { display: none; }
.rl-kpi--photo .rl-kpi-content { padding: 0 12px 20px; }
.rl-kpi-photo {
  position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; object-fit: cover;
  animation: kpiBreathe 10s ease-in-out infinite; animation-delay: var(--kpi-delay, 0s);
  transition: transform 500ms ease;
}
.rl-kpi--photo:hover .rl-kpi-photo { animation-play-state: paused; transform: scale(1.1) !important; }
.rl-kpi-photo-overlay {
  position: absolute; inset: 0; z-index: 1;
  background:
    linear-gradient(180deg, rgba(8, 4, 4, 0.1) 0%, rgba(8, 4, 4, 0.5) 55%, rgba(6, 3, 3, 0.92) 100%),
    radial-gradient(120% 90% at 15% 0%, color-mix(in srgb, var(--accent) 38%, transparent), transparent 60%);
  animation: kpiGlowPulse 4.5s ease-in-out infinite; animation-delay: var(--kpi-delay, 0s);
}
/* Диагональный блик света, периодически пробегающий по карточке — делает блок «живым» даже без наведения. */
.rl-kpi-shine {
  position: absolute; inset: -60% -30%; z-index: 1; pointer-events: none;
  background: linear-gradient(112deg, transparent 42%, rgba(255, 255, 255, 0.16) 48%, rgba(255, 255, 255, 0.32) 50%, rgba(255, 255, 255, 0.16) 52%, transparent 58%);
  transform: translateX(-140%); animation: kpiShine 6.5s ease-in-out infinite; animation-delay: var(--kpi-delay, 0s);
}
/* Блик, следующий за курсором — только там, где есть мышь. */
.rl-kpi-glare {
  position: absolute; inset: 0; z-index: 1; pointer-events: none; opacity: 0; transition: opacity 300ms ease;
  background: radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(255, 255, 255, 0.32), transparent 62%);
}
@media (hover: hover) {
  .rl-kpi:hover .rl-kpi-glare { opacity: 1; }
}
.rl-kpi--photo .rl-kpi-icon { background: rgba(255, 255, 255, 0.16); border-color: rgba(255, 255, 255, 0.35); color: #fff; }
.rl-kpi--photo .rl-kpi-val, .rl-kpi--photo .rl-kpi-label { color: #fff; }
.rl-kpi--photo .rl-kpi-label { opacity: 0.88; }
.rl-kpi-icon {
  display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%;
  color: var(--accent); position: relative;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
}
.rl-kpi-icon svg { width: 20px; height: 20px; position: relative; z-index: 1; }
/* Пульсирующее кольцо-«радар» вокруг иконки — тонкий, но заметный акцент внимания. */
.rl-kpi-icon-ring {
  position: absolute; inset: -7px; border-radius: 50%; pointer-events: none;
  border: 1.5px solid color-mix(in srgb, var(--accent) 60%, transparent);
  animation: kpiPulseRing 2.8s ease-out infinite; animation-delay: var(--kpi-delay, 0s);
}
.rl-kpi--photo .rl-kpi-icon-ring { border-color: rgba(255, 255, 255, 0.7); }
.rl-kpi-val {
  font-size: clamp(2rem, 3.8vw, 2.7rem); font-weight: 800; letter-spacing: -0.03em; color: var(--text-strong);
  font-variant-numeric: tabular-nums; white-space: nowrap; max-width: 100%;
}
.rl-kpi--photo .rl-kpi-val { text-shadow: 0 2px 18px rgba(0, 0, 0, 0.55), 0 0 26px color-mix(in srgb, var(--accent) 45%, transparent); }
.rl-kpi-val--sm { font-size: clamp(1.4rem, 2.6vw, 2rem); }
.rl-kpi-val--xs { font-size: clamp(1.1rem, 2vw, 1.5rem); }
.rl-kpi-label { font-size: 0.82rem; color: var(--text-strong); font-weight: 600; opacity: 0.82; line-height: 1.35; }

@keyframes kpiBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.045); } }
@keyframes kpiShine { 0%, 55% { transform: translateX(-140%); } 78% { transform: translateX(140%); } 100% { transform: translateX(140%); } }
@keyframes kpiGlowPulse { 0%, 100% { opacity: 0.88; } 50% { opacity: 1; } }
@keyframes kpiPulseRing { 0% { transform: scale(0.82); opacity: 0.9; } 70% { transform: scale(1.55); opacity: 0; } 100% { opacity: 0; } }
@keyframes kpiLineSweep { 0% { background-position: 0% 0; } 100% { background-position: -220% 0; } }

@media (prefers-reduced-motion: reduce) {
  .rl-kpi-photo, .rl-kpi-photo-overlay, .rl-kpi-shine, .rl-kpi-icon-ring, .rl-kpi::before { animation: none !important; }
}

/* ── Фраза, проявляющаяся при скролле ── */
.rl-statement { padding: 108px 0 90px; }
.rl-statement-text {
  max-width: 980px; margin: 0 auto; text-align: center;
  font-size: clamp(1.55rem, 3.5vw, 2.5rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.32;
  color: var(--text-strong); text-wrap: balance;
}
.rl-statement-word { display: inline-block; }

/* ── 3D-наклон для фото/иллюстраций ── */
.rl-tilt-perspective { perspective: 1400px; }
.rl-tilt { transform-style: preserve-3d; will-change: transform; border-radius: 26px; overflow: hidden; box-shadow: var(--shadow-card); }

/* ── Фото с лайтбоксом ── */
.rl-photo {
  position: relative; display: block; width: 100%; border: none; padding: 0; margin: 0; cursor: pointer;
  border-radius: 24px; overflow: hidden; background: var(--bg-panel-solid); -webkit-tap-highlight-color: transparent;
}
.rl-photo img { display: block; width: 100%; height: auto; object-fit: cover; transition: transform 0.5s cubic-bezier(0.22,1,0.36,1); }
.rl-photo:hover img, .rl-photo:focus-visible img { transform: scale(1.035); }
.rl-photo-caption {
  position: absolute; left: 16px; bottom: 14px; font-size: 0.82rem; font-weight: 700; color: #fff;
  text-shadow: 0 2px 10px rgba(0,0,0,0.55); letter-spacing: 0.01em;
}
.rl-photo-zoom {
  position: absolute; right: 12px; top: 12px; width: 34px; height: 34px; border-radius: 50%;
  display: grid; place-items: center; background: rgba(0,0,0,0.42); color: #fff; font-size: 15px;
  opacity: 0; transition: opacity 0.25s ease; pointer-events: none;
}
.rl-photo:hover .rl-photo-zoom, .rl-photo:focus-visible .rl-photo-zoom { opacity: 1; }
.rl-photo-frame { border-radius: 24px; border: 1px solid var(--stroke); box-shadow: var(--shadow-card); }
.rl-photo-frame .rl-photo { border-radius: 23px; }

/* ── Фото в правой колонке hero (страницы без калькулятора) ── */
.rl-hero-visual { width: 100%; max-width: 500px; justify-self: end; }
.rl-hero-photo { aspect-ratio: 4 / 3; }

/* ── Сетка из двух широких карточек (форматы франшизы и т.п.) ── */
.rl-two-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }

/* ── Разделение: список шагов + иллюстрация ── */
.rl-media-split { display: grid; grid-template-columns: 1.15fr 0.82fr; gap: 44px; align-items: start; }
.rl-media-split--reverse { grid-template-columns: 0.82fr 1.15fr; }
.rl-media-split--even { grid-template-columns: 1.05fr 0.95fr; align-items: stretch; gap: 28px; }
.rl-media-split--even.rl-media-split--reverse { grid-template-columns: 0.92fr 1.08fr; }
.rl-media-split--even.rl-media-split--reverse .rl-media-split-visual img { object-position: 50% 48%; }
.rl-media-split--fill { align-items: stretch; gap: 36px; }
.rl-media-split-visual { position: sticky; top: 108px; aspect-ratio: 3 / 4; }
.rl-media-split-visual img { display: block; width: 100%; height: 100%; object-fit: cover; }
.rl-media-split--even > .rl-tilt-perspective { height: 100%; display: flex; min-height: 0; }
.rl-media-split--even .rl-media-split-visual {
  position: static; aspect-ratio: auto; flex: 1; width: 100%; height: 100%; min-height: 0;
}
.rl-media-split--even .rl-media-split-visual img { object-position: 50% 70%; }
.rl-media-split--fill > .rl-tilt-perspective { height: 100%; display: flex; min-height: 0; }
.rl-media-split--fill .rl-media-split-visual {
  position: static; aspect-ratio: 4 / 5; flex: 1; width: 100%; height: auto;
}
.rl-media-split--fill .rl-media-split-visual img { object-position: 50% 28%; }

/* ── Плитки мировых рынков (Москва / Лондон), фото меняется с темой ── */
.rl-market-tiles { display: flex; flex-direction: column; gap: 12px; width: 100%; height: 100%; }
.rl-market-tile {
  position: relative; flex: 1; overflow: hidden; border-radius: 22px;
  padding: 20px 22px; display: flex; flex-direction: column; justify-content: space-between;
  background-size: cover; background-position: center 38%; isolation: isolate;
  min-height: 120px; transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}
.rl-market-tile::before {
  content: ''; position: absolute; inset: 0; z-index: -1;
  background: linear-gradient(180deg, rgba(8, 9, 12, 0.6) 0%, rgba(8, 9, 12, 0.14) 42%, rgba(8, 9, 12, 0.68) 100%);
}
.rl-market-tile:hover { transform: scale(1.012); }
.rl-market-tile-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.rl-market-tile-city {
  display: inline-flex; align-items: center; gap: 8px; font-size: 0.94rem; font-weight: 700; color: #fff;
  letter-spacing: 0.01em; text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55);
}
.rl-market-tile-city i {
  width: 7px; height: 7px; border-radius: 50%; background: #4ade80;
  box-shadow: 0 0 8px rgba(74, 222, 128, 0.9); animation: rlPulseDot 2.2s ease-in-out infinite;
}
@keyframes rlPulseDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
.rl-market-tile-code {
  font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: rgba(255, 255, 255, 0.85); background: rgba(10, 11, 15, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 999px; padding: 4px 10px;
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); white-space: nowrap;
}
.rl-market-tile-bottom { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.rl-market-tile-time {
  font-family: var(--font-display); font-size: clamp(1.7rem, 1.2rem + 2vw, 2.4rem); font-weight: 700;
  letter-spacing: 0.01em; color: #fff; line-height: 1; text-shadow: 0 2px 14px rgba(0, 0, 0, 0.6);
  font-variant-numeric: tabular-nums;
}
.rl-market-tile-time b { font-size: 0.55em; font-weight: 600; color: rgba(255, 255, 255, 0.66); margin-left: 2px; }
.rl-market-tile-date { font-size: 0.78rem; font-weight: 600; color: rgba(255, 255, 255, 0.82); text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55); white-space: nowrap; }
@media (max-width: 900px) { .rl-market-tile-time { font-size: clamp(1.4rem, 1rem + 2.5vw, 1.9rem); } }
.rl-media-split--fill .rl-rows {
  display: flex; flex-direction: column; height: 100%; align-self: stretch; min-height: 0;
}
.rl-media-split--fill .rl-row {
  flex: 1 1 0; align-items: center; padding-top: 18px; padding-bottom: 18px;
}
.rl-perks-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
.rl-media-split-cards { grid-template-columns: 1fr !important; }

/* ── Карточки-отзывы с 3D-наклоном ── */
.rl-tilt-cards { display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.rl-tilt-card { height: 100%; }

@media (max-width: 900px) {
  .rl-products { grid-template-columns: 1fr 1fr; }
  .rl-vs { grid-template-columns: 1fr; }
  .rl-lvls { grid-template-columns: 1fr 1fr; }
  .rl-form { grid-template-columns: 1fr; }
  .rl-kpis { grid-template-columns: 1fr 1fr; gap: 12px; }
  .rl-aurora-a { width: min(90vw, 520px); height: min(90vw, 520px); }
  .rl-aurora-b { width: min(80vw, 420px); height: min(80vw, 420px); }
  .rl-hero-ring { width: min(92vw, 420px); height: min(92vw, 420px); right: -28%; opacity: 0.55; }
  .rl-kpis-section { padding: 40px 0 8px; }
  .rl-media-split { grid-template-columns: 1fr; }
  .rl-media-split--even.rl-media-split--reverse { grid-template-columns: 1fr; }
  .rl-media-split-visual { position: static; aspect-ratio: 16 / 9; order: -1; }
  .rl-media-split--even.rl-media-split--reverse .rl-media-split-visual { aspect-ratio: 16 / 9; height: auto; flex: none; }
  .rl-media-split--even > .rl-tilt-perspective { height: auto; display: block; }
  .rl-media-split--even .rl-media-split-visual { aspect-ratio: 16 / 9; height: auto; flex: none; }
  .rl-media-split--fill > .rl-tilt-perspective { height: auto; display: block; }
  .rl-media-split--fill .rl-media-split-visual { aspect-ratio: 16 / 9; height: auto; flex: none; }
  .rl-media-split--fill .rl-rows { display: block; height: auto; }
  .rl-media-split--fill .rl-row { flex: none; }
  .rl-tilt-cards { grid-template-columns: 1fr 1fr; }
  .rl-perks-grid { grid-template-columns: 1fr 1fr !important; }
  .rl-hero-visual { justify-self: stretch; max-width: 620px; margin: 0 auto; }
}
@media (max-width: 620px) {
  .rl-products { grid-template-columns: 1fr; }
  .rl-calc-card { max-width: 100%; }
  .rl-row { grid-template-columns: 1fr; }
  .rl-lvls { grid-template-columns: 1fr; }
  .rl-crumbs { padding-top: 90px; }
  .il-section-inner { padding-left: 22px; padding-right: 22px; }
  .rl-root .il-faq-q { padding: 16px 12px 14px 18px; }
  .rl-root .il-faq-a { padding: 0 18px 16px; }
  .rl-kpis { grid-template-columns: 1fr 1fr; gap: 10px; }
  .rl-kpi { padding: 16px 8px 14px; }
  .rl-kpi-icon { width: 34px; height: 34px; }
  .rl-kpi-icon svg { width: 16px; height: 16px; }
  .rl-kpi-val { font-size: clamp(1.4rem, 6.2vw, 2rem); }
  .rl-kpi-val--sm { font-size: clamp(1.05rem, 4.6vw, 1.5rem); }
  .rl-kpi-val--xs { font-size: clamp(0.86rem, 3.6vw, 1.15rem); }
  .rl-kpi-label { font-size: 0.76rem; }
  .rl-kpi--photo { min-height: 168px; }
  .rl-statement { padding: 76px 0 60px; }
  .rl-tilt-cards { grid-template-columns: 1fr; }
  .rl-perks-grid { grid-template-columns: 1fr !important; }
  .rl-dust { opacity: 0.35; }
  .rl-grain { opacity: 0.03; }
  .rl-vignette { opacity: 0.75; }
  .rl-hero-orb-gold { width: 240px; height: 240px; }
  .rl-two-cards { grid-template-columns: 1fr; }
  /* Кнопки первого экрана: во всю ширину и по центру */
  .rl-root .il-hero-cta { flex-direction: column; align-items: stretch; gap: 12px; }
  .rl-root .il-hero-cta .il-magnetic { display: block; width: 100%; }
  .rl-root .il-hero-cta .il-btn { width: 100%; justify-content: center; box-sizing: border-box; }
}
`;
