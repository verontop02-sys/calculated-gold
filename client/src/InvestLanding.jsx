import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from 'motion/react';
import Lenis from 'lenis';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { clientApi, fintechApi } from './api.js';
import { ThemeToggle } from './ThemeToggle.jsx';
import { MissedBenefitCalc } from './MissedBenefitCalc.jsx';

const EASE = [0.22, 1, 0.36, 1];

function formatMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(n));
}

/* ── Иконки (инлайн SVG, наследуют currentColor) ── */
const Ico = {
  scale: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18M5 7l7-4 7 4M3 13l2-6 2 6a3.4 3.4 0 0 1-4 0zM17 13l2-6 2 6a3.4 3.4 0 0 1-4 0zM8 21h8" />
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
  doc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" />
    </svg>
  ),
  bot: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 8V4M8 4h8" /><circle cx="9" cy="14" r="1" fill="currentColor" /><circle cx="15" cy="14" r="1" fill="currentColor" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
    </svg>
  ),
};

const STEPS = [
  { n: '01', title: 'Вход по телефону', text: 'Номер + код из SMS. Без анкет, сканов и визитов в офис — кабинет открывается за две минуты.' },
  { n: '02', title: 'Покупка от 1 грамма', text: 'Фиксируете биржевой курс в моменте. Комиссия видна до подтверждения — никаких сюрпризов после.' },
  { n: '03', title: 'Портфель растёт онлайн', text: 'Курс обновляется в реальном времени. Баланс в граммах и рублях — всегда перед глазами.' },
  { n: '04', title: 'Продажа и вывод', text: 'Продаёте часть или всё по текущему курсу — деньги доступны к выводу сразу после сделки.' },
];

const ADVANTAGES = [
  { icon: Ico.scale, title: 'Учёт до 0,0001 грамма', text: 'Никаких «удобных» округлений: каждая доля миллиграмма учитывается при покупке и продаже.' },
  { icon: Ico.eye, title: 'Комиссия видна заранее', text: 'Точная сумма комиссии показывается до подтверждения сделки. Скрытых удержаний нет.' },
  { icon: Ico.shield, title: 'Официальные котировки', text: 'Биржевой курс и данные ЦБ РФ — цены берутся из официальных источников, а не «с потолка».' },
  { icon: Ico.doc, title: 'PDF-выписка в один клик', text: 'Полная история операций выгружается мгновенно — для отчётности и личного контроля.' },
  { icon: Ico.bot, title: 'AI-ассистент портфеля', text: 'Отвечает на вопросы о балансе и строит прогнозы на исторических данных ЦБ.' },
  { icon: Ico.moon, title: 'Тёмная и светлая тема', text: 'Кабинет одинаково удобен днём и ночью — интерфейс подстраивается под вас.' },
];

const FAQ = [
  { q: 'Сколько стоит купить золото в Reaktivo?', a: 'Минимальный порог — от 1 грамма. Комиссия показывается заранее, до подтверждения сделки, и зависит от текущих настроек площадки.' },
  { q: 'Что значит «золото на счету»?', a: 'В кабинете ведётся точный учёт вашего виртуального остатка в граммах по текущему курсу. Это учётная запись в системе Reaktivo, а не физическое хранение слитка.' },
  { q: 'Как продать золото и получить деньги?', a: 'В разделе «Продать» указываете количество граммов или сумму — сделка фиксируется по актуальному курсу, а средства становятся доступны к выводу.' },
  { q: 'По какому курсу считается доходность?', a: 'Исторические расчёты в калькуляторе используют официальные данные Банка России; текущие сделки — биржевой курс, отображаемый в кабинете в реальном времени.' },
  { q: 'Нужно ли приходить в офис?', a: 'Нет. Вся работа — от входа до продажи и вывода средств — происходит онлайн в личном кабинете.' },
  { q: 'Это инвестиционная рекомендация?', a: 'Нет. Материалы на сайте и в калькуляторе носят иллюстративный характер и не являются индивидуальной инвестиционной рекомендацией. Прошлый рост цены не гарантирует будущий результат.' },
];

const MARQUEE = ['Курс ЦБ РФ', 'Биржевые котировки', 'От 1 грамма', 'Комиссия до сделки', 'PDF-выписки', 'AI-ассистент', 'Учёт до 0,0001 г', 'Продажа онлайн'];

/* ── Анимационные примитивы ── */

function Reveal({ children, className = '', delay = 0, y = 36, ...rest }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-12% 0px' }}
      transition={{ duration: 0.9, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const staggerChild = {
  hidden: { opacity: 0, y: 32, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } },
};

function AnimatedNumber({ to, format, duration = 1.8, className = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-8% 0px' });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView || to == null) return;
    const controls = animate(0, to, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setVal(v) });
    return () => controls.stop();
  }, [inView, to, duration]);
  return <span ref={ref} className={className}>{to == null ? '—' : format(val)}</span>;
}

/* ── Hero-заголовок: пословное появление с blur ── */
const TITLE_WORDS = [
  { t: 'Настоящее' }, { t: 'золото', accent: true }, { t: 'в' }, { t: 'вашем' }, { t: 'портфеле' },
  { t: '—' }, { t: 'от' }, { t: '1' }, { t: 'грамма' },
];

function HeroTitle() {
  return (
    <motion.h1
      className="il-hero-title"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.055, delayChildren: 0.15 } } }}
      initial="hidden"
      animate="show"
      aria-label={TITLE_WORDS.map((w) => w.t).join(' ')}
    >
      {TITLE_WORDS.map((w, i) => (
        <motion.span
          key={i}
          className={`il-hero-word${w.accent ? ' il-accent-text' : ''}`}
          variants={{
            hidden: { opacity: 0, y: '0.6em', filter: 'blur(10px)' },
            show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.75, ease: EASE } },
          }}
          aria-hidden
        >
          {w.t}
        </motion.span>
      ))}
    </motion.h1>
  );
}

/* ── Плавающая карточка портфеля в hero ── */
function HeroCard({ quote, growth }) {
  const grams = 128.35;
  const valueRub = quote?.goldRubPerGram ? grams * quote.goldRubPerGram : null;
  return (
    <motion.div
      className="il-hero-visual"
      initial={{ opacity: 0, y: 60, rotate: 2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 1.1, delay: 0.45, ease: EASE }}
    >
      <div className="il-hero-card-back" aria-hidden />
      <motion.div
        className="il-hero-card"
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut', delay: 1.6 }}
      >
        <div className="il-hero-card-top">
          <span className="il-hero-card-brand">REAKTIVO<i>·</i>Invest</span>
          <span className="il-hero-card-live"><i />live</span>
        </div>
        <span className="il-hero-card-label">Портфель</span>
        <div className="il-hero-card-grams">{grams.toFixed(4).replace('.', ',')} г</div>
        <div className="il-hero-card-value">
          {valueRub ? formatMoney(valueRub) : '· · ·'}
          {growth && <span className="il-hero-card-badge">+{Math.round((growth.multiple - 1) * 100).toLocaleString('ru-RU')}% за {growth.years} лет</span>}
        </div>
        <svg className="il-hero-card-spark" viewBox="0 0 220 64" fill="none" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="ilSparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.30" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            d="M2 56 C24 54 40 48 58 47 S92 40 108 36 S140 30 158 22 S196 10 218 6"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 2, delay: 0.9, ease: EASE }}
          />
          <path d="M2 56 C24 54 40 48 58 47 S92 40 108 36 S140 30 158 22 S196 10 218 6 L218 64 L2 64 Z" fill="url(#ilSparkFill)" opacity="0.7" />
        </svg>
        <div className="il-hero-card-foot">
          <span>Золото · 999,9</span>
          <span>{quote?.goldRubPerGram ? `${Math.round(quote.goldRubPerGram).toLocaleString('ru-RU')} ₽/г` : ''}</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

function FaqItem({ item, open, onToggle }) {
  return (
    <div className={`il-faq-item${open ? ' il-faq-item--open' : ''}`}>
      <button type="button" className="il-faq-q" onClick={onToggle}>
        <span>{item.q}</span>
        <motion.span className="il-faq-plus" animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.3, ease: EASE }} aria-hidden>+</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            style={{ overflow: 'hidden' }}
          >
            <p className="il-faq-a">{item.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function InvestLanding() {
  const [quote, setQuote] = useState(null);
  const [history, setHistory] = useState(null);
  const [openFaq, setOpenFaq] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const lenisRef = useRef(null);
  const heroRef = useRef(null);
  const chartBoxRef = useRef(null);
  const chartInView = useInView(chartBoxRef, { once: true, margin: '-15% 0px' });

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 16));

  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const orbY1 = useTransform(heroProgress, [0, 1], [0, 140]);
  const orbY2 = useTransform(heroProgress, [0, 1], [0, -100]);
  const heroFade = useTransform(heroProgress, [0, 0.85], [1, 0]);
  const cardY = useTransform(heroProgress, [0, 1], [0, 90]);

  /* Плавный скролл Lenis */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenisRef.current = lenis;
    let raf = requestAnimationFrame(function loop(time) {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    });
    return () => { cancelAnimationFrame(raf); lenis.destroy(); lenisRef.current = null; };
  }, []);

  const goTo = (e, selector) => {
    e.preventDefault();
    if (lenisRef.current) lenisRef.current.scrollTo(selector, { offset: -84, duration: 1.4 });
    else document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth' });
  };

  /* SEO */
  useEffect(() => {
    document.title = 'Reaktivo Invest — инвестиции в золото онлайн';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      'content',
      'Инвестируйте в золото онлайн от 1 грамма: реальный курс, прозрачная комиссия, калькулятор упущенной выгоды и личный кабинет Reaktivo.PRO.'
    );
  }, []);

  /* Данные */
  useEffect(() => {
    let alive = true;
    clientApi.buybackQuote('moex').then((q) => { if (alive) setQuote(q); }).catch(() => {});
    fintechApi.cbrGoldHistory().then((out) => { if (alive) setHistory(out.points || []); }).catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, []);

  const growth = useMemo(() => {
    if (!history?.length) return null;
    const first = history[0];
    const last = history[history.length - 1];
    if (!first?.price || !last?.price) return null;
    return { first, last, multiple: last.price / first.price, years: last.year - first.year };
  }, [history]);

  const chartData = useMemo(() => {
    if (!history?.length) return [];
    return history.map((p) => ({ year: String(p.year), price: p.price }));
  }, [history]);

  return (
    <div className="il-root">
      <header className={`il-header${scrolled ? ' il-header--scrolled' : ''}`}>
        <div className="il-header-inner">
          <a href="/" className="il-logo">REAKTIVO<span>.PRO</span> <em>Invest</em></a>
          <nav className="il-nav">
            <a href="#market" className="il-nav-link" onClick={(e) => goTo(e, '#market')}>Динамика</a>
            <a href="#calc" className="il-nav-link" onClick={(e) => goTo(e, '#calc')}>Калькулятор</a>
            <a href="#how" className="il-nav-link" onClick={(e) => goTo(e, '#how')}>Как это работает</a>
            <a href="#faq" className="il-nav-link" onClick={(e) => goTo(e, '#faq')}>FAQ</a>
          </nav>
          <div className="il-header-actions">
            <ThemeToggle />
            <motion.a href="/kabinet" className="il-btn il-btn--ghost" whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}>Войти</motion.a>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="il-hero" ref={heroRef}>
          <div className="il-hero-bg" aria-hidden>
            <motion.span className="il-hero-orb il-hero-orb--1" style={{ y: orbY1 }} />
            <motion.span className="il-hero-orb il-hero-orb--2" style={{ y: orbY2 }} />
            <span className="il-hero-grid" />
          </div>
          <motion.div className="il-hero-inner" style={{ opacity: heroFade }}>
            <div className="il-hero-copy">
              <motion.span
                className="il-badge"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: EASE }}
              >
                <i className="il-badge-dot" /> Reaktivo Invest · золото онлайн
              </motion.span>

              <HeroTitle />

              <motion.p
                className="il-hero-sub"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.55, ease: EASE }}
              >
                Биржевой курс в реальном времени, комиссия видна до сделки, учёт до 0,0001 грамма.
                Покупка, продажа и вывод — в пару кликов, без визитов в офис.
              </motion.p>

              <motion.div
                className="il-hero-cta"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.7, ease: EASE }}
              >
                <motion.a href="/kabinet" className="il-btn il-btn--primary il-btn--lg" whileHover={{ y: -2, scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                  Открыть кабинет
                  <span className="il-btn-arrow" aria-hidden>→</span>
                </motion.a>
                <motion.a href="#calc" className="il-btn il-btn--outline il-btn--lg" onClick={(e) => goTo(e, '#calc')} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
                  Рассчитать выгоду
                </motion.a>
              </motion.div>

              <motion.div
                className="il-hero-stats"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.85, ease: EASE }}
              >
                <div className="il-hero-stat">
                  <AnimatedNumber
                    to={growth ? growth.multiple : null}
                    format={(v) => `${v.toFixed(1).replace('.', ',')}×`}
                    className="il-hero-stat-val"
                  />
                  <span className="il-hero-stat-label">рост золота с {growth ? growth.first.year : '2000'} года</span>
                </div>
                <div className="il-hero-stat-sep" aria-hidden />
                <div className="il-hero-stat">
                  <AnimatedNumber
                    to={quote?.goldRubPerGram ?? null}
                    format={(v) => `${Math.round(v).toLocaleString('ru-RU')} ₽`}
                    className="il-hero-stat-val"
                  />
                  <span className="il-hero-stat-label"><i className="il-live-dot" /> за грамм сейчас</span>
                </div>
                <div className="il-hero-stat-sep" aria-hidden />
                <div className="il-hero-stat">
                  <span className="il-hero-stat-val">1 г</span>
                  <span className="il-hero-stat-label">минимальная покупка</span>
                </div>
              </motion.div>
            </div>

            <motion.div style={{ y: cardY }}>
              <HeroCard quote={quote} growth={growth} />
            </motion.div>
          </motion.div>
        </section>

        {/* ── Бегущая строка ── */}
        <div className="il-marquee" aria-hidden>
          <div className="il-marquee-track">
            {[...MARQUEE, ...MARQUEE].map((t, i) => (
              <span className="il-marquee-item" key={i}>{t}<i>◆</i></span>
            ))}
          </div>
        </div>

        {/* ── Динамика рынка ── */}
        <section className="il-section" id="market">
          <div className="il-section-inner">
            <div className="il-market-grid">
              <div className="il-market-copy">
                <Reveal><span className="il-pill">Динамика рынка</span></Reveal>
                <Reveal delay={0.08}>
                  <h2 className="il-h2">
                    Золото дорожает.<br />
                    <span className="il-accent-text">Даже когда всё падает.</span>
                  </h2>
                </Reveal>
                <Reveal delay={0.16}>
                  <p className="il-p">
                    По официальным данным Банка России золото показывает устойчивый рост на длинном горизонте —
                    опережая инфляцию и большинство привычных способов сбережений.
                  </p>
                </Reveal>
                {growth && (
                  <Reveal delay={0.24}>
                    <div className="il-market-stats">
                      <div className="il-market-stat">
                        <span className="il-stat-label">{growth.first.year} год</span>
                        <span className="il-stat-val">{Math.round(growth.first.price).toLocaleString('ru-RU')} ₽/г</span>
                      </div>
                      <span className="il-market-arrow" aria-hidden>→</span>
                      <div className="il-market-stat">
                        <span className="il-stat-label">{growth.last.year} год</span>
                        <AnimatedNumber
                          to={growth.last.price}
                          format={(v) => `${Math.round(v).toLocaleString('ru-RU')} ₽/г`}
                          className="il-stat-val il-accent-text"
                        />
                      </div>
                      <div className="il-market-mult">
                        <AnimatedNumber to={growth.multiple} format={(v) => `в ${v.toFixed(1).replace('.', ',')} раза`} />
                      </div>
                    </div>
                  </Reveal>
                )}
              </div>
              <motion.div
                className="il-market-chart"
                ref={chartBoxRef}
                initial={{ opacity: 0, y: 48, scale: 0.96 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: '-12% 0px' }}
                transition={{ duration: 1, ease: EASE }}
              >
                {chartInView && chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={chartData} margin={{ top: 12, right: 6, left: 6, bottom: 0 }}>
                      <defs>
                        <linearGradient id="ilMarketFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="year" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={32} />
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-panel-solid)', border: '1px solid var(--stroke)', borderRadius: 12, fontSize: 12, color: 'var(--text)' }}
                        formatter={(v) => [`${Number(v).toLocaleString('ru-RU')} ₽/г`, 'ЦБ РФ']}
                      />
                      <Area type="monotone" dataKey="price" stroke="var(--accent)" strokeWidth={2.5} fill="url(#ilMarketFill)" dot={false} animationDuration={1800} animationEasing="ease-out" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="il-market-loading">Загружаем историю ЦБ…</div>
                )}
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── Калькулятор ── */}
        <section className="il-section il-section--calc" id="calc">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Бесплатный инструмент</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Сколько бы вы <span className="il-accent-text">заработали?</span></h2></Reveal>
              <Reveal delay={0.16}><p className="il-p">Сумма и год покупки — калькулятор посчитает результат по официальному курсу ЦБ РФ. Без регистрации.</p></Reveal>
            </div>
            <Reveal delay={0.1} y={48}>
              <MissedBenefitCalc />
            </Reveal>
          </div>
        </section>

        {/* ── Как это работает ── */}
        <section className="il-section" id="how">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Как это работает</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Четыре шага — и золото в портфеле</h2></Reveal>
            </div>
            <motion.div
              className="il-steps"
              variants={staggerParent}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-12% 0px' }}
            >
              {STEPS.map((s) => (
                <motion.div className="il-step" key={s.n} variants={staggerChild} whileHover={{ y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
                  <span className="il-step-n">{s.n}</span>
                  <h3 className="il-step-title">{s.title}</h3>
                  <p className="il-step-text">{s.text}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── Преимущества ── */}
        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Почему Reaktivo</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Сделано так, как должен<br />работать финтех</h2></Reveal>
            </div>
            <motion.div
              className="il-cards"
              variants={staggerParent}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-10% 0px' }}
            >
              {ADVANTAGES.map((a) => (
                <motion.div className="il-card" key={a.title} variants={staggerChild} whileHover={{ y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
                  <span className="il-card-icon">{a.icon}</span>
                  <h3 className="il-card-title">{a.title}</h3>
                  <p className="il-card-text">{a.text}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="il-section" id="faq">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Частые вопросы</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Отвечаем честно</h2></Reveal>
            </div>
            <motion.div
              className="il-faq"
              variants={staggerParent}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-8% 0px' }}
            >
              {FAQ.map((item, i) => (
                <motion.div key={item.q} variants={staggerChild}>
                  <FaqItem item={item} open={openFaq === i} onToggle={() => setOpenFaq((cur) => (cur === i ? -1 : i))} />
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── Финальный CTA ── */}
        <section className="il-section il-section--cta">
          <div className="il-section-inner">
            <Reveal y={56}>
              <div className="il-cta-panel">
                <span className="il-cta-orb il-cta-orb--1" aria-hidden />
                <span className="il-cta-orb il-cta-orb--2" aria-hidden />
                <h2 className="il-cta-title">Начните сегодня —<br />это займёт две минуты</h2>
                <p className="il-cta-sub">Вход по номеру телефона. Без анкет и визитов в офис.</p>
                <motion.a href="/kabinet" className="il-btn il-btn--inverse il-btn--lg" whileHover={{ y: -2, scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  Открыть кабинет
                  <span className="il-btn-arrow" aria-hidden>→</span>
                </motion.a>
              </div>
            </Reveal>
            <p className="il-disclaimer">
              Материалы носят иллюстративный характер и не являются индивидуальной инвестиционной рекомендацией или предложением по покупке ценных бумаг. Прошлый рост цены не гарантирует будущий результат.
            </p>
          </div>
        </section>
      </main>

      <footer className="il-footer">
        <div className="il-section-inner il-footer-inner">
          <span>© {new Date().getFullYear()} REAKTIVO.PRO</span>
          <div className="il-footer-links">
            <a href="/kabinet" className="il-nav-link">Личный кабинет</a>
            <a href="/pro" className="il-nav-link il-nav-link--dim">Сотрудникам</a>
          </div>
        </div>
      </footer>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.il-root {
  min-height: 100dvh;
  background: var(--bg-deep);
  background-image: var(--bg-gradient);
  color: var(--text);
  font-family: var(--font-display);
  overflow-x: clip;
  -webkit-font-smoothing: antialiased;
}
.il-section-inner { max-width: 1180px; margin: 0 auto; padding: 0 28px; }
.il-section-inner--narrow { max-width: 800px; }
.il-accent-text { color: var(--accent); }

/* ── Header ── */
.il-header {
  position: fixed; top: 0; left: 0; right: 0; z-index: 50;
  transition: background 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease;
  border-bottom: 1px solid transparent;
}
.il-header--scrolled {
  background: color-mix(in srgb, var(--bg-panel-solid) 82%, transparent);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border-bottom-color: var(--stroke-soft);
  box-shadow: 0 8px 32px -20px rgba(0,0,0,0.35);
}
.il-header-inner {
  max-width: 1180px; margin: 0 auto; padding: 16px 28px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
}
.il-logo { font-weight: 800; font-size: 1.05rem; letter-spacing: -0.01em; color: var(--text-strong); text-decoration: none; white-space: nowrap; }
.il-logo span { color: var(--accent); }
.il-logo em { font-style: normal; color: var(--text-muted); font-weight: 600; margin-left: 4px; }
.il-nav { display: flex; gap: 26px; }
.il-nav-link { position: relative; color: var(--text-muted); text-decoration: none; font-size: 0.86rem; font-weight: 600; transition: color 0.25s; padding: 4px 0; }
.il-nav-link::after {
  content: ''; position: absolute; left: 0; bottom: 0; width: 100%; height: 2px;
  background: var(--accent); border-radius: 2px;
  transform: scaleX(0); transform-origin: right; transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
.il-nav-link:hover { color: var(--text-strong); }
.il-nav-link:hover::after { transform: scaleX(1); transform-origin: left; }
.il-header-actions { display: flex; align-items: center; gap: 12px; }

/* ── Кнопки ── */
.il-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  border-radius: 14px; font-weight: 700; font-size: 0.88rem; text-decoration: none;
  padding: 11px 20px; border: 1px solid transparent; cursor: pointer;
  transition: box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease, color 0.3s ease;
  white-space: nowrap; will-change: transform;
}
.il-btn-arrow { display: inline-block; transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
.il-btn:hover .il-btn-arrow { transform: translateX(4px); }
.il-btn--primary {
  background: var(--accent); color: #fff;
  box-shadow: 0 10px 32px -10px color-mix(in srgb, var(--accent) 70%, transparent);
}
.il-btn--primary:hover { box-shadow: 0 16px 44px -12px color-mix(in srgb, var(--accent) 85%, transparent); }
.il-btn--ghost { background: transparent; border-color: var(--stroke); color: var(--text); }
.il-btn--ghost:hover { border-color: var(--accent); color: var(--accent); }
.il-btn--outline { background: color-mix(in srgb, var(--bg-panel-solid) 60%, transparent); border-color: var(--stroke); color: var(--text-strong); backdrop-filter: blur(6px); }
.il-btn--outline:hover { border-color: var(--accent); color: var(--accent); }
.il-btn--inverse { background: #fff; color: var(--accent); box-shadow: 0 14px 40px -12px rgba(0,0,0,0.45); }
.il-btn--lg { padding: 16px 30px; font-size: 0.98rem; border-radius: 16px; }

/* ── Hero ── */
.il-hero { position: relative; padding: 148px 28px 96px; overflow: clip; }
.il-hero-bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.il-hero-orb {
  position: absolute; border-radius: 50%; filter: blur(90px);
  background: radial-gradient(circle, var(--accent), transparent 70%);
}
.il-hero-orb--1 { width: 520px; height: 520px; top: -200px; right: -140px; opacity: 0.30; }
.il-hero-orb--2 { width: 380px; height: 380px; bottom: -180px; left: -120px; opacity: 0.18; }
.il-hero-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(var(--stroke-soft) 1px, transparent 1px),
    linear-gradient(90deg, var(--stroke-soft) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse 90% 70% at 50% 0%, black 20%, transparent 75%);
  -webkit-mask-image: radial-gradient(ellipse 90% 70% at 50% 0%, black 20%, transparent 75%);
  opacity: 0.6;
}
.il-hero-inner {
  position: relative; z-index: 1; max-width: 1180px; margin: 0 auto;
  display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: 56px; align-items: center;
}
.il-badge {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 0.74rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--accent); background: var(--accent-soft);
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  padding: 7px 15px; border-radius: 100px; margin-bottom: 26px;
}
.il-badge-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: ilPulse 1.8s ease-in-out infinite; }
@keyframes ilPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.72); } }

.il-hero-title {
  font-size: clamp(2.3rem, 5.2vw, 3.9rem);
  font-weight: 800; line-height: 1.06; letter-spacing: -0.035em;
  margin: 0 0 22px; color: var(--text-strong);
  text-wrap: balance;
}
.il-hero-word { display: inline-block; margin-right: 0.26em; will-change: transform, filter; }
.il-hero-sub {
  font-size: 1.08rem; line-height: 1.65; color: var(--text-muted);
  max-width: 540px; margin: 0 0 34px;
}
.il-hero-cta { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 44px; }

.il-hero-stats { display: flex; align-items: center; gap: 26px; flex-wrap: wrap; }
.il-hero-stat { display: flex; flex-direction: column; gap: 3px; }
.il-hero-stat-val { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; color: var(--text-strong); font-variant-numeric: tabular-nums; }
.il-hero-stat-label { font-size: 0.76rem; color: var(--text-dim); font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
.il-hero-stat-sep { width: 1px; height: 38px; background: var(--stroke); }
.il-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--emerald); display: inline-block; animation: ilPulse 1.6s ease-in-out infinite; }

/* Hero card */
.il-hero-visual { position: relative; }
.il-hero-card-back {
  position: absolute; inset: 16px -14px -14px 30px; border-radius: 26px;
  background: color-mix(in srgb, var(--bg-panel-solid) 55%, transparent);
  border: 1px solid var(--stroke-soft);
  transform: rotate(4deg);
}
.il-hero-card {
  position: relative; border-radius: 26px;
  background: color-mix(in srgb, var(--bg-panel-solid) 88%, transparent);
  border: 1px solid var(--stroke);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 40px 90px -40px rgba(0,0,0,0.5);
  padding: 26px 28px 20px;
}
.il-hero-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 22px; }
.il-hero-card-brand { font-weight: 800; font-size: 0.82rem; letter-spacing: 0.02em; color: var(--text-strong); }
.il-hero-card-brand i { color: var(--accent); font-style: normal; margin: 0 2px; }
.il-hero-card-live { display: inline-flex; align-items: center; gap: 6px; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--emerald); }
.il-hero-card-live i { width: 6px; height: 6px; border-radius: 50%; background: var(--emerald); animation: ilPulse 1.6s ease-in-out infinite; }
.il-hero-card-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); font-weight: 700; }
.il-hero-card-grams { font-size: 2.1rem; font-weight: 800; letter-spacing: -0.03em; color: var(--text-strong); font-variant-numeric: tabular-nums; margin: 4px 0 6px; }
.il-hero-card-value { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 1.02rem; font-weight: 700; color: var(--text-muted); font-variant-numeric: tabular-nums; margin-bottom: 18px; }
.il-hero-card-badge {
  font-size: 0.7rem; font-weight: 800; color: var(--emerald);
  background: var(--emerald-soft); padding: 4px 10px; border-radius: 100px;
}
.il-hero-card-spark { width: 100%; height: 64px; display: block; margin-bottom: 14px; }
.il-hero-card-foot { display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-dim); font-weight: 600; border-top: 1px solid var(--stroke-soft); padding-top: 14px; }

/* ── Marquee ── */
.il-marquee {
  border-top: 1px solid var(--stroke-soft); border-bottom: 1px solid var(--stroke-soft);
  background: color-mix(in srgb, var(--bg-panel-solid) 40%, transparent);
  overflow: hidden; padding: 16px 0;
  mask-image: linear-gradient(90deg, transparent, black 8%, black 92%, transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent, black 8%, black 92%, transparent);
}
.il-marquee-track { display: flex; width: max-content; animation: ilMarquee 36s linear infinite; }
.il-marquee:hover .il-marquee-track { animation-play-state: paused; }
@keyframes ilMarquee { to { transform: translateX(-50%); } }
.il-marquee-item {
  display: inline-flex; align-items: center; gap: 28px; padding-right: 28px;
  font-size: 0.82rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--text-dim); white-space: nowrap;
}
.il-marquee-item i { font-style: normal; color: var(--accent); font-size: 0.6rem; }

/* ── Секции ── */
.il-section { padding: 104px 0; }
.il-section--alt { background: color-mix(in srgb, var(--bg-panel-solid) 42%, transparent); }
.il-section--calc { position: relative; }
.il-section-head { text-align: center; max-width: 680px; margin: 0 auto 56px; }
.il-pill {
  display: inline-block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700;
  color: var(--accent); background: var(--accent-soft);
  border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
  padding: 6px 14px; border-radius: 100px; margin-bottom: 18px;
}
.il-h2 {
  font-size: clamp(1.75rem, 3.4vw, 2.6rem); font-weight: 800; letter-spacing: -0.03em;
  margin: 0 0 16px; color: var(--text-strong); line-height: 1.14; text-wrap: balance;
}
.il-p { font-size: 1rem; line-height: 1.7; color: var(--text-muted); margin: 0; }

/* ── Market ── */
.il-market-grid { display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr); gap: 56px; align-items: center; }
.il-market-stats { display: flex; align-items: center; gap: 22px; margin-top: 30px; flex-wrap: wrap; }
.il-market-arrow { color: var(--text-dim); font-size: 1.3rem; }
.il-stat-label { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-dim); font-weight: 700; margin-bottom: 5px; }
.il-stat-val { display: block; font-size: 1.45rem; font-weight: 800; color: var(--text-strong); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.il-market-mult {
  font-size: 0.82rem; font-weight: 800; color: var(--accent);
  background: var(--accent-soft); padding: 8px 14px; border-radius: 100px;
}
.il-market-chart {
  background: var(--bg-panel-solid); border: 1px solid var(--stroke); border-radius: 22px; padding: 22px 18px;
  box-shadow: 0 30px 70px -40px rgba(0,0,0,0.4);
}
.il-market-loading { display: flex; align-items: center; justify-content: center; height: 280px; color: var(--text-muted); font-size: 0.88rem; }

/* ── Шаги ── */
.il-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
.il-step {
  position: relative;
  background: var(--bg-panel-solid); border: 1px solid var(--stroke); border-radius: 20px; padding: 28px 24px;
  transition: border-color 0.35s ease, box-shadow 0.35s ease;
}
.il-step:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--stroke)); box-shadow: 0 24px 48px -28px color-mix(in srgb, var(--accent) 35%, transparent); }
.il-step-n {
  display: inline-block; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.06em;
  color: var(--accent); background: var(--accent-soft);
  padding: 6px 12px; border-radius: 100px; margin-bottom: 18px;
}
.il-step-title { font-size: 1.05rem; font-weight: 800; margin: 0 0 10px; color: var(--text-strong); letter-spacing: -0.01em; }
.il-step-text { font-size: 0.87rem; line-height: 1.6; color: var(--text-muted); margin: 0; }

/* ── Преимущества ── */
.il-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
.il-card {
  background: var(--bg-panel-solid); border: 1px solid var(--stroke); border-radius: 20px; padding: 28px 26px;
  transition: border-color 0.35s ease, box-shadow 0.35s ease;
}
.il-card:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--stroke)); box-shadow: 0 24px 48px -28px color-mix(in srgb, var(--accent) 35%, transparent); }
.il-card-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 46px; height: 46px; border-radius: 14px;
  background: var(--accent-soft); color: var(--accent); margin-bottom: 18px;
}
.il-card-icon svg { width: 24px; height: 24px; }
.il-card-title { font-size: 1.02rem; font-weight: 800; margin: 0 0 9px; color: var(--text-strong); letter-spacing: -0.01em; }
.il-card-text { font-size: 0.87rem; line-height: 1.6; color: var(--text-muted); margin: 0; }

/* ── FAQ ── */
.il-faq { display: flex; flex-direction: column; gap: 12px; }
.il-faq-item {
  background: var(--bg-panel-solid); border: 1px solid var(--stroke); border-radius: 18px;
  transition: border-color 0.35s ease;
}
.il-faq-item--open { border-color: color-mix(in srgb, var(--accent) 50%, var(--stroke)); }
.il-faq-q {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 14px;
  background: none; border: none; padding: 20px 24px; text-align: left; cursor: pointer;
  font-size: 0.98rem; font-weight: 700; color: var(--text-strong); font-family: inherit;
}
.il-faq-plus { display: inline-flex; font-size: 1.35rem; color: var(--accent); font-weight: 600; flex-shrink: 0; line-height: 1; }
.il-faq-a { margin: 0; padding: 0 24px 22px; font-size: 0.9rem; line-height: 1.65; color: var(--text-muted); }

/* ── CTA ── */
.il-section--cta { padding-bottom: 72px; }
.il-cta-panel {
  position: relative; overflow: hidden; text-align: center;
  background: linear-gradient(140deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000));
  border-radius: 30px; padding: 76px 32px;
  box-shadow: 0 40px 90px -40px color-mix(in srgb, var(--accent) 60%, transparent);
}
.il-cta-orb { position: absolute; border-radius: 50%; filter: blur(70px); background: rgba(255,255,255,0.28); pointer-events: none; }
.il-cta-orb--1 { width: 320px; height: 320px; top: -160px; left: -80px; }
.il-cta-orb--2 { width: 260px; height: 260px; bottom: -140px; right: -60px; opacity: 0.6; }
.il-cta-title { position: relative; font-size: clamp(1.7rem, 3.4vw, 2.5rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.15; color: #fff; margin: 0 0 14px; }
.il-cta-sub { position: relative; font-size: 1rem; color: rgba(255,255,255,0.82); margin: 0 0 30px; }
.il-cta-panel .il-btn { position: relative; }
.il-disclaimer { font-size: 0.72rem; color: var(--text-dim); line-height: 1.55; max-width: 640px; margin: 26px auto 0; text-align: center; }

/* ── Footer ── */
.il-footer { border-top: 1px solid var(--stroke-soft); padding: 28px 0; }
.il-footer-inner { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 0.82rem; color: var(--text-muted); }
.il-footer-links { display: flex; align-items: center; gap: 20px; }
.il-nav-link--dim { color: var(--text-dim); font-weight: 500; }

/* ── Адаптив ── */
@media (max-width: 1020px) {
  .il-hero-inner { grid-template-columns: 1fr; gap: 48px; }
  .il-hero-visual { max-width: 460px; margin: 0 auto; width: 100%; }
  .il-market-grid { grid-template-columns: 1fr; gap: 40px; }
  .il-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .il-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .il-nav { display: none; }
  .il-hero { padding: 120px 20px 64px; }
  .il-hero-title { font-size: clamp(2rem, 9vw, 2.6rem); }
  .il-hero-stats { gap: 18px; }
  .il-hero-stat-sep { display: none; }
  .il-section { padding: 72px 0; }
  .il-section-head { margin-bottom: 40px; }
  .il-steps { grid-template-columns: 1fr; }
  .il-cards { grid-template-columns: 1fr; }
  .il-cta-panel { padding: 56px 22px; }
  .il-footer-inner { flex-direction: column; gap: 10px; text-align: center; }
}
@media (prefers-reduced-motion: reduce) {
  .il-marquee-track { animation: none; }
}
`;
