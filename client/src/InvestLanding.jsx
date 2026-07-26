import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import Lenis from 'lenis';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { clientApi, fintechApi, getClientToken, getFintechToken } from './api.js';
import { ThemeToggle } from './ThemeToggle.jsx';
import { MissedBenefitCalc } from './MissedBenefitCalc.jsx';

const EASE = [0.22, 1, 0.36, 1];
const SPRING = { type: 'spring', stiffness: 230, damping: 28, mass: 0.9 };

/** «Топычканов Никита Сергеевич» → «Топычканов Н.С.» */
function formatSurnameInitials(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  const surname = parts[0];
  const initials = parts.slice(1).map((w) => `${w[0].toUpperCase()}.`).join('');
  return `${surname} ${initials}`;
}

function formatMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(n));
}

const isFinePointer = () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Иконки (инлайн SVG) ── */
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
  bolt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
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
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 13 4 4L19 7" />
    </svg>
  ),
};

const STEPS = [
  { n: '01', title: 'Вход по телефону', text: 'Номер + код из SMS. Без анкет, сканов и визитов в офис — кабинет открывается за две минуты.' },
  { n: '02', title: 'Покупка от 1 грамма', text: 'Фиксируете биржевой курс в моменте. Комиссия видна до подтверждения — никаких сюрпризов после.' },
  { n: '03', title: 'Портфель растёт онлайн', text: 'Курс обновляется в реальном времени. Баланс в граммах и рублях — всегда перед глазами.' },
  { n: '04', title: 'Продажа и вывод', text: 'Продаёте часть или всё по текущему курсу — деньги выводятся на карту любого банка.' },
];

const ADVANTAGES = [
  { icon: Ico.scale, title: 'Учёт до 0,0001 грамма', text: 'Никаких «удобных» округлений: каждая доля миллиграмма учитывается при покупке и продаже.' },
  { icon: Ico.eye, title: 'Комиссия видна заранее', text: 'Точная сумма комиссии показывается до подтверждения сделки. Скрытых удержаний нет.' },
  { icon: Ico.shield, title: 'Официальные котировки', text: 'Биржевой курс и данные ЦБ РФ — цены берутся из официальных источников, а не «с потолка».' },
  { icon: Ico.bolt, title: 'Моментальные пополнение и вывод', text: 'Кошелёк пополняется через СБП за секунды. Вывод — на карту любого банка сразу после продажи.' },
  { icon: Ico.doc, title: 'PDF-выписка в один клик', text: 'Полная история операций выгружается мгновенно — для отчётности и личного контроля.' },
  { icon: Ico.bot, title: 'AI-ассистент портфеля', text: 'Отвечает на вопросы о балансе и строит прогнозы на исторических данных ЦБ.' },
];

const FAQ = [
  { q: 'Сколько стоит купить золото в Reaktivo?', a: 'Минимальный порог — от 1 грамма. Комиссия показывается заранее, до подтверждения сделки, и зависит от текущих настроек площадки.' },
  { q: 'Что значит «золото на счету»?', a: 'В кабинете ведётся точный учёт вашего остатка в граммах по текущему курсу. Reaktivo выступает вашим агентом: покупает золото для вас и ведёт его учёт.' },
  { q: 'Как пополнить кошелёк?', a: 'Через СБП — по номеру телефона, без ввода реквизитов. Деньги зачисляются моментально и сразу доступны для покупки золота.' },
  { q: 'Как продать золото и получить деньги?', a: 'В разделе «Продать» указываете количество граммов или сумму — сделка фиксируется по актуальному курсу, а средства выводятся на карту любого банка.' },
  { q: 'По какому курсу считается доходность?', a: 'Исторические расчёты в калькуляторе используют официальные данные Банка России; текущие сделки — биржевой курс, отображаемый в кабинете в реальном времени.' },
  { q: 'Нужно ли приходить в офис?', a: 'Нет. Вся работа — от входа до продажи и вывода средств — происходит онлайн в личном кабинете.' },
  { q: 'Это инвестиционная рекомендация?', a: 'Нет. Материалы на сайте и в калькуляторе носят иллюстративный характер и не являются индивидуальной инвестиционной рекомендацией. Прошлый рост цены не гарантирует будущий результат.' },
];

const MARQUEE = ['Курс ЦБ РФ', 'Биржевые котировки', 'От 1 грамма', 'Пополнение через СБП', 'Вывод на карту', 'Комиссия до сделки', 'PDF-выписки', 'AI-ассистент', 'Учёт до 0,0001 г'];

const STATEMENT_WORDS = 'Золото пережило войны, кризисы и дефолты. Сбережения в золоте — спокойствие, проверенное веками.'.split(' ');

/* ═══════════════ Анимационные примитивы ═══════════════ */

function Reveal({ children, className = '', delay = 0, y = 34, ...rest }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.85, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

const staggerParent = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } } };
const staggerChild = {
  hidden: { opacity: 0, y: 36, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.75, ease: EASE } },
};

function AnimatedNumber({ to, format, duration = 1.9, className = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-6% 0px' });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView || to == null) return;
    const controls = animate(0, to, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setVal(v) });
    return () => controls.stop();
  }, [inView, to, duration]);
  return <span ref={ref} className={className}>{to == null ? '—' : format(val)}</span>;
}

/* Магнитная кнопка (desktop) */
function Magnetic({ children, strength = 0.28 }) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 180, damping: 16, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 180, damping: 16, mass: 0.5 });

  const onMove = useCallback((e) => {
    if (!isFinePointer() || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  }, [strength, x, y]);
  const onLeave = useCallback(() => { x.set(0); y.set(0); }, [x, y]);

  return (
    <motion.div ref={ref} className="il-magnetic" style={{ x: sx, y: sy }} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </motion.div>
  );
}

/* Свечение за курсором (desktop) */
function CursorGlow() {
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
  return <motion.div className="il-cursor-glow" style={{ x: sx, y: sy }} aria-hidden />;
}

const SbpBadge = ({ className = '' }) => <span className={`il-sbp ${className}`.trim()}>СБП</span>;

/* ═══════════════ Hero: колода карт ═══════════════ */

function deckSlot(pos) {
  if (pos === 0) return { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 };
  if (pos === 1) return { x: 34, y: 28, scale: 0.95, rotate: 3.5, opacity: 0.88 };
  if (pos === 2) return { x: 68, y: 56, scale: 0.9, rotate: 7, opacity: 0.62 };
  return { x: 96, y: 78, scale: 0.86, rotate: 9, opacity: 0 };
}

function DeckPortfolioCard({ quote, growth }) {
  const grams = 128.35;
  const valueRub = quote?.goldRubPerGram ? grams * quote.goldRubPerGram : null;
  return (
    <>
      <div className="il-card-top">
        <span className="il-card-brand">REAKTIVO<i>·</i>PRO</span>
        <span className="il-card-live"><i />live</span>
      </div>
      <span className="il-card-label">Портфель</span>
      <div className="il-card-big">{grams.toFixed(4).replace('.', ',')} г</div>
      <div className="il-card-row">
        <span className="il-card-val">{valueRub ? formatMoney(valueRub) : '· · ·'}</span>
        {growth && <span className="il-card-badge">+{Math.round((growth.multiple - 1) * 100).toLocaleString('ru-RU')}% за {growth.years} лет</span>}
      </div>
      <svg className="il-card-spark" viewBox="0 0 220 64" fill="none" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="ilSparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.30" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M2 56 C24 54 40 48 58 47 S92 40 108 36 S140 30 158 22 S196 10 218 6" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M2 56 C24 54 40 48 58 47 S92 40 108 36 S140 30 158 22 S196 10 218 6 L218 64 L2 64 Z" fill="url(#ilSparkFill)" opacity="0.7" />
      </svg>
      <div className="il-card-foot">
        <span>Золото · 999,9</span>
        <span>{quote?.goldRubPerGram ? `${Math.round(quote.goldRubPerGram).toLocaleString('ru-RU')} ₽/г` : ''}</span>
      </div>
    </>
  );
}

const PRICE_BARS = [34, 41, 38, 47, 44, 56, 52, 63, 60, 72, 78, 92];

function DeckPriceCard({ quote }) {
  return (
    <>
      <div className="il-card-top">
        <span className="il-card-brand">Курс золота</span>
        <span className="il-card-live"><i />MOEX</span>
      </div>
      <span className="il-card-label">Сейчас за грамм</span>
      <div className="il-card-big">{quote?.goldRubPerGram ? `${Math.round(quote.goldRubPerGram).toLocaleString('ru-RU')} ₽` : '· · ·'}</div>
      <div className="il-card-row">
        <span className="il-card-badge">обновляется в реальном времени</span>
      </div>
      <div className="il-card-bars" aria-hidden>
        {PRICE_BARS.map((h, i) => (
          <span key={i} style={{ height: `${h}%` }} className={i === PRICE_BARS.length - 1 ? 'is-hot' : ''} />
        ))}
      </div>
      <div className="il-card-foot">
        <span>Биржевые котировки</span>
        <span>без наценок «с потолка»</span>
      </div>
    </>
  );
}

function DeckTopupCard() {
  return (
    <>
      <div className="il-card-top">
        <span className="il-card-brand">Кошелёк</span>
        <span className="il-card-live il-card-live--ok"><i />зачислено</span>
      </div>
      <span className="il-card-label">Пополнение через СБП</span>
      <div className="il-card-big">+ 100 000 ₽</div>
      <div className="il-card-row">
        <SbpBadge />
        <span className="il-card-badge">за секунды</span>
      </div>
      <ul className="il-card-checks">
        <li><span className="il-card-check">{Ico.check}</span> По номеру телефона, без реквизитов</li>
        <li><span className="il-card-check">{Ico.check}</span> Сразу доступно для покупки золота</li>
      </ul>
      <div className="il-card-foot">
        <span>СБП</span>
        <span>моментальное зачисление</span>
      </div>
    </>
  );
}

function DeckDealCard({ quote }) {
  const total = quote?.goldRubPerGram ? quote.goldRubPerGram * 10 : null;
  return (
    <>
      <div className="il-card-top">
        <span className="il-card-brand">Сделка</span>
        <span className="il-card-live il-card-live--ok"><i />исполнена</span>
      </div>
      <span className="il-card-label">Покупка 10 г</span>
      <div className="il-card-big">{total ? formatMoney(total) : '· · ·'}</div>
      <ul className="il-card-checks">
        <li><span className="il-card-check">{Ico.check}</span> Курс зафиксирован в моменте</li>
        <li><span className="il-card-check">{Ico.check}</span> Комиссия показана до сделки</li>
        <li><span className="il-card-check">{Ico.check}</span> Граммы зачислены на счёт</li>
      </ul>
      <div className="il-card-foot">
        <span>Время сделки</span>
        <span>меньше минуты</span>
      </div>
    </>
  );
}

function DeckWithdrawCard() {
  return (
    <>
      <div className="il-card-top">
        <span className="il-card-brand">Вывод средств</span>
        <span className="il-card-live il-card-live--ok"><i />исполнен</span>
      </div>
      <span className="il-card-label">На карту любого банка</span>
      <div className="il-card-big">150 000 ₽</div>
      <ul className="il-card-checks">
        <li><span className="il-card-check">{Ico.check}</span> Заявка в один клик</li>
        <li><span className="il-card-check">{Ico.check}</span> После продажи золота по курсу</li>
        <li><span className="il-card-check">{Ico.check}</span> Без скрытых удержаний</li>
      </ul>
      <div className="il-card-foot">
        <span>Вывод</span>
        <span>на вашу карту</span>
      </div>
    </>
  );
}

function HeroDeck({ quote, growth }) {
  const cards = [
    <DeckPortfolioCard quote={quote} growth={growth} key="p" />,
    <DeckPriceCard quote={quote} key="q" />,
    <DeckTopupCard key="t" />,
    <DeckDealCard quote={quote} key="d" />,
    <DeckWithdrawCard key="w" />,
  ];
  const n = cards.length;
  const [order, setOrder] = useState(() => Array.from({ length: n }, (_, i) => i));
  const pausedRef = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const id = setInterval(() => {
      if (!pausedRef.current) setOrder(([f, ...rest]) => [...rest, f]);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  const advance = () => setOrder(([f, ...rest]) => [...rest, f]);
  const bringToFront = (i) => setOrder((cur) => {
    let next = cur;
    for (let k = 0; k < n && next[0] !== i; k += 1) next = [...next.slice(1), next[0]];
    return next;
  });

  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 120, damping: 18 });
  const sry = useSpring(ry, { stiffness: 120, damping: 18 });
  const onTilt = (e) => {
    if (!isFinePointer()) return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 8);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 8);
  };
  const resetTilt = () => { rx.set(0); ry.set(0); };

  return (
    <motion.div
      className="il-deck-wrap"
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.1, delay: 0.5, ease: EASE }}
    >
      <motion.div
        className="il-deck"
        style={{ rotateX: srx, rotateY: sry, transformPerspective: 1100 }}
        onPointerMove={onTilt}
        onPointerEnter={() => { pausedRef.current = true; }}
        onPointerLeave={() => { pausedRef.current = false; resetTilt(); }}
        onClick={advance}
        role="button"
        tabIndex={0}
        aria-label="Показать следующую карточку"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); } }}
      >
        {cards.map((card, i) => {
          const pos = order.indexOf(i);
          return (
            <motion.div key={i} className="il-deck-card" style={{ zIndex: n - pos }} animate={deckSlot(pos)} transition={SPRING}>
              {card}
            </motion.div>
          );
        })}
      </motion.div>
      <div className="il-deck-dots" role="tablist" aria-label="Карточки">
        {cards.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={order[0] === i}
            className={`il-deck-dot${order[0] === i ? ' is-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); bringToFront(i); }}
          />
        ))}
      </div>
    </motion.div>
  );
}

/* ═══════════════ Hero-заголовок ═══════════════ */

const TITLE_WORDS = [
  { t: 'Настоящее' }, { t: 'золото', accent: true }, { t: 'в' }, { t: 'вашем' }, { t: 'портфеле' },
  { t: '—' }, { t: 'от' }, { t: '1' }, { t: 'грамма' },
];

function HeroTitle() {
  return (
    <motion.h1
      className="il-hero-title"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.12 } } }}
      initial="hidden"
      animate="show"
      aria-label={TITLE_WORDS.map((w) => w.t).join(' ')}
    >
      {TITLE_WORDS.map((w, i) => (
        <span key={i} className="il-hero-word-clip" aria-hidden>
          <motion.span
            className={`il-hero-word${w.accent ? ' il-accent-text' : ''}`}
            variants={{
              hidden: { y: '110%' },
              show: { y: 0, transition: { duration: 0.85, ease: EASE } },
            }}
          >
            {w.t}
          </motion.span>
        </span>
      ))}
    </motion.h1>
  );
}

/* ═══════════════ Заявление со скролл-проявлением слов ═══════════════ */

function StatementWord({ progress, range, children }) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return <motion.span className="il-statement-word" style={{ opacity }}>{children}&nbsp;</motion.span>;
}

function Statement() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.82', 'end 0.42'] });
  return (
    <section className="il-statement" ref={ref}>
      <div className="il-section-inner">
        <p className="il-statement-text">
          {STATEMENT_WORDS.map((w, i) => (
            <StatementWord key={i} progress={scrollYProgress} range={[i / STATEMENT_WORDS.length, (i + 1) / STATEMENT_WORDS.length]}>
              {w}
            </StatementWord>
          ))}
        </p>
      </div>
    </section>
  );
}

/* ═══════════════ Превью кабинета ═══════════════ */

const CLOCK_CITIES = [
  ['Москва', 'Europe/Moscow'],
  ['Лондон', 'Europe/London'],
  ['Нью-Йорк', 'America/New_York'],
  ['Дубай', 'Asia/Dubai'],
];

function PreviewClocks() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="il-preview-clocks" aria-hidden>
      {CLOCK_CITIES.map(([city, tz]) => (
        <span className="il-preview-clock" key={city}>
          <i>{city}</i>
          <b>{new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(now)}</b>
        </span>
      ))}
    </div>
  );
}

function DashboardPreview({ chartData, quote }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-8% 0px' });
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.98', 'start 0.4'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [16, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [70, 0]);
  const opacity = useTransform(scrollYProgress, [0, 0.35, 1], [0, 0.75, 1]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.94, 1]);

  return (
    <div className="il-preview-perspective" ref={ref}>
      <motion.div className="il-preview-window" style={{ rotateX, y, opacity, scale }}>
        <div className="il-preview-bar">
          <span className="il-preview-dots" aria-hidden><i /><i /><i /></span>
          <span className="il-preview-url">reaktivo.pro/kabinet</span>
          <span />
        </div>
        <div className="il-preview-body">
          <aside className="il-preview-side" aria-hidden>
            <span className="il-preview-logo" />
            <span className="il-preview-navitem is-active" />
            <span className="il-preview-navitem" />
            <span className="il-preview-navitem" />
            <span className="il-preview-navitem" />
          </aside>
          <div className="il-preview-main">
            <div className="il-preview-kpis">
              <div className="il-preview-kpi">
                <span className="il-preview-kpi-label">Портфель</span>
                <span className="il-preview-kpi-val">128,3500 г</span>
              </div>
              <div className="il-preview-kpi">
                <span className="il-preview-kpi-label">Объём средств</span>
                <span className="il-preview-kpi-val">{quote?.goldRubPerGram ? formatMoney(128.35 * quote.goldRubPerGram) : '—'}</span>
              </div>
              <div className="il-preview-kpi il-preview-kpi--pos">
                <span className="il-preview-kpi-label">Доход</span>
                <span className="il-preview-kpi-val">+18,4%</span>
              </div>
            </div>
            <PreviewClocks />
            <div className="il-preview-chart">
              {inView && chartData.length > 1 && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ilPrevFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="price" stroke="var(--accent)" strokeWidth={2} fill="url(#ilPrevFill)" dot={false} animationDuration={1600} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="il-preview-rows" aria-hidden>
              <div className="il-preview-row"><span className="is-buy">Пополнение · СБП</span><span>зачислено моментально</span></div>
              <div className="il-preview-row"><span className="is-buy">Покупка · 5 г</span><span>курс зафиксирован</span></div>
              <div className="il-preview-row"><span className="is-sell">Вывод · на карту</span><span>после продажи золота</span></div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.span
        className="il-preview-chip il-preview-chip--1"
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        +5,0000 г
      </motion.span>
      <motion.span
        className="il-preview-chip il-preview-chip--2"
        animate={{ y: [0, 12, 0] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      >
        СБП · за секунды
      </motion.span>
      <motion.span
        className="il-preview-chip il-preview-chip--3"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      >
        Вывод на карту
      </motion.span>
    </div>
  );
}

/* ═══════════════ FAQ ═══════════════ */

function FaqItem({ item, open, onToggle }) {
  return (
    <div className={`il-faq-item${open ? ' il-faq-item--open' : ''}`}>
      <button type="button" className="il-faq-q" onClick={onToggle}>
        <span>{item.q}</span>
        <motion.span className="il-faq-plus" animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.35, ease: EASE }} aria-hidden>+</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1, transition: { height: { duration: 0.45, ease: EASE }, opacity: { duration: 0.35, delay: 0.08 } } }}
            exit={{ height: 0, opacity: 0, transition: { height: { duration: 0.38, ease: EASE }, opacity: { duration: 0.2 } } }}
            style={{ overflow: 'hidden' }}
          >
            <p className="il-faq-a">{item.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════ Страница ═══════════════ */

export function InvestLanding() {
  const [quote, setQuote] = useState(null);
  const [history, setHistory] = useState(null);
  const [openFaq, setOpenFaq] = useState(-1);
  const [scrolled, setScrolled] = useState(false);
  // Если пользователь уже в кабинете — в шапке фамилия с инициалами вместо «Войти»
  const [headerUser, setHeaderUser] = useState(null);
  const lenisRef = useRef(null);
  const heroRef = useRef(null);
  const chartBoxRef = useRef(null);
  const chartInView = useInView(chartBoxRef, { once: true, margin: '-12% 0px' });

  const { scrollY, scrollYProgress } = useScroll();
  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 16));
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });

  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const orbY1 = useTransform(heroProgress, [0, 1], [0, 150]);
  const orbY2 = useTransform(heroProgress, [0, 1], [0, -110]);
  const heroFade = useTransform(heroProgress, [0, 0.85], [1, 0]);
  const deckY = useTransform(heroProgress, [0, 1], [0, 100]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      async function fromFintechProfile() {
        const p = await fintechApi.profile();
        const short = formatSurnameInitials(p?.fullName);
        if (short) return short;
        return p?.phoneMasked || 'Кабинет';
      }
      try {
        if (getFintechToken()) {
          const label = await fromFintechProfile();
          if (!cancelled) setHeaderUser(label);
          return;
        }
        const clientToken = getClientToken();
        if (!clientToken) return;
        // Тихий обмен клиентской сессии на fintech — чтобы взять ФИО, если оно уже есть
        try {
          await fintechApi.sessionFromClient(clientToken);
          const label = await fromFintechProfile();
          if (!cancelled) setHeaderUser(label);
          return;
        } catch {
          /* нет fintech-профиля — покажем маску телефона из кабинета скупки */
        }
        const me = await clientApi.me();
        if (!cancelled) setHeaderUser(me?.phoneMasked || 'Кабинет');
      } catch {
        if (!cancelled) setHeaderUser(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const lenis = new Lenis({ duration: 1.2, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenisRef.current = lenis;
    let raf = requestAnimationFrame(function loop(time) {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    });
    return () => { cancelAnimationFrame(raf); lenis.destroy(); lenisRef.current = null; };
  }, []);

  const goTo = (e, selector) => {
    e.preventDefault();
    if (lenisRef.current) lenisRef.current.scrollTo(selector, { offset: -84, duration: 1.5 });
    else document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    document.title = 'REAKTIVO.PRO — покупка золота онлайн от 1 грамма';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      'content',
      'Reaktivo — покупка золота онлайн от 1 грамма по биржевому курсу: пополнение через СБП, вывод на карту, комиссия видна до сделки, калькулятор выгоды по курсу ЦБ РФ.'
    );
  }, []);

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

  const growth5y = useMemo(() => {
    if (!history?.length) return null;
    const last = history[history.length - 1];
    const base = [...history].reverse().find((p) => p.year <= last.year - 5);
    if (!base?.price || !last?.price) return null;
    return ((last.price / base.price) - 1) * 100;
  }, [history]);

  const chartData = useMemo(() => {
    if (!history?.length) return [];
    return history.map((p) => ({ year: String(p.year), price: p.price }));
  }, [history]);

  return (
    <div className="il-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <CursorGlow />

      <header className={`il-header${scrolled ? ' il-header--scrolled' : ''}`}>
        <div className="il-header-inner">
          <a href="/" className="il-logo">REAKTIVO<span>.PRO</span></a>
          <nav className="il-nav">
            <a href="#how" className="il-nav-link" onClick={(e) => goTo(e, '#how')}>Как это работает</a>
            <a href="#about" className="il-nav-link" onClick={(e) => goTo(e, '#about')}>О компании</a>
            <a href="#calc" className="il-nav-link" onClick={(e) => goTo(e, '#calc')}>Калькулятор</a>
            <a href="#market" className="il-nav-link" onClick={(e) => goTo(e, '#market')}>Динамика</a>
            <a href="#faq" className="il-nav-link" onClick={(e) => goTo(e, '#faq')}>FAQ</a>
          </nav>
          <div className="il-header-actions">
            <ThemeToggle />
            <motion.a
              href="/kabinet"
              className={`il-btn il-btn--ghost${headerUser ? ' il-btn--user' : ''}`}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              title={headerUser ? 'Открыть кабинет' : 'Войти в кабинет'}
            >
              {headerUser || 'Войти'}
            </motion.a>
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
              <motion.span className="il-badge" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
                <i className="il-badge-dot" /> Reaktivo · покупка золота онлайн
              </motion.span>

              <HeroTitle />

              <motion.p className="il-hero-sub" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.5, ease: EASE }}>
                Reaktivo — ваш агент по покупке золота: биржевой курс в реальном времени, комиссия видна до сделки,
                пополнение через СБП и вывод на карту. Всё онлайн, без визитов в офис.
              </motion.p>

              <motion.div className="il-hero-cta" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.64, ease: EASE }}>
                <Magnetic>
                  <motion.a href="/kabinet" className="il-btn il-btn--primary il-btn--lg" whileTap={{ scale: 0.96 }}>
                    Открыть кабинет
                    <span className="il-btn-arrow" aria-hidden>→</span>
                  </motion.a>
                </Magnetic>
                <motion.a href="#calc" className="il-btn il-btn--outline il-btn--lg" onClick={(e) => goTo(e, '#calc')} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}>
                  Рассчитать выгоду
                </motion.a>
              </motion.div>

              <motion.div className="il-hero-stats" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.78, ease: EASE }}>
                <div className="il-hero-stat">
                  <AnimatedNumber to={growth ? growth.multiple : null} format={(v) => `×${v.toFixed(1).replace('.', ',')}`} className="il-hero-stat-val" />
                  <span className="il-hero-stat-label">рост золота с {growth ? growth.first.year : '2000'} года</span>
                </div>
                <div className="il-hero-stat-sep" aria-hidden />
                <div className="il-hero-stat">
                  <AnimatedNumber to={quote?.goldRubPerGram ?? null} format={(v) => `${Math.round(v).toLocaleString('ru-RU')} ₽`} className="il-hero-stat-val" />
                  <span className="il-hero-stat-label"><i className="il-live-dot" /> за грамм сейчас</span>
                </div>
                <div className="il-hero-stat-sep" aria-hidden />
                <div className="il-hero-stat">
                  <span className="il-hero-stat-val">1 г</span>
                  <span className="il-hero-stat-label">минимальная покупка</span>
                </div>
              </motion.div>
            </div>

            <motion.div style={{ y: deckY }}>
              <HeroDeck quote={quote} growth={growth} />
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

        {/* ── Превью кабинета ── */}
        <section className="il-section il-section--preview">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Личный кабинет</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Весь портфель — <span className="il-accent-text">на одном экране</span></h2></Reveal>
              <Reveal delay={0.16}><p className="il-p">Портфель, объём средств и доход, мировые часы, живой график и история операций — без лишних кликов.</p></Reveal>
            </div>
            <DashboardPreview chartData={chartData} quote={quote} />
          </div>
        </section>

        {/* ── Заявление ── */}
        <Statement />

        {/* ── Динамика рынка ── */}
        <section className="il-section" id="market">
          <div className="il-section-inner">
            <div className="il-market-grid">
              <div className="il-market-copy">
                <Reveal><span className="il-pill">Динамика рынка</span></Reveal>
                <Reveal delay={0.08}>
                  <h2 className="il-h2 il-h2--market">
                    <AnimatedNumber to={growth ? growth.multiple : null} format={(v) => `×${v.toFixed(1).replace('.', ',')}`} className="il-market-mult-big" />
                    <span className="il-market-mult-cap">рост золота с {growth ? growth.first.year : 2000} года</span>
                  </h2>
                </Reveal>
                <Reveal delay={0.14}>
                  <p className="il-market-slogan">Золото дорожает — <span className="il-accent-text">даже когда всё падает.</span></p>
                </Reveal>
                <Reveal delay={0.2}>
                  <p className="il-p">
                    По официальным данным Банка России золото показывает устойчивый рост на длинном горизонте —
                    опережая инфляцию и большинство привычных способов сбережений.
                  </p>
                </Reveal>
                {growth && (
                  <Reveal delay={0.26}>
                    <div className="il-market-stats">
                      <div className="il-market-stat">
                        <span className="il-stat-label">{growth.first.year} год</span>
                        <span className="il-stat-val">{Math.round(growth.first.price).toLocaleString('ru-RU')} ₽/г</span>
                      </div>
                      <span className="il-market-arrow" aria-hidden>→</span>
                      <div className="il-market-stat">
                        <span className="il-stat-label">{growth.last.year} год</span>
                        <AnimatedNumber to={growth.last.price} format={(v) => `${Math.round(v).toLocaleString('ru-RU')} ₽/г`} className="il-stat-val il-accent-text" />
                      </div>
                    </div>
                  </Reveal>
                )}
                {growth5y != null && (
                  <Reveal delay={0.32}>
                    <div className="il-market-chips">
                      <span className="il-market-chip">+{Math.round(growth5y).toLocaleString('ru-RU')}% за 5 лет</span>
                      <span className="il-market-chip">источник — ЦБ РФ</span>
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
                  <ResponsiveContainer width="100%" height={290}>
                    <AreaChart data={chartData} margin={{ top: 12, right: 6, left: 6, bottom: 0 }}>
                      <defs>
                        <linearGradient id="ilMarketFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="year" tick={{ fill: 'var(--text-dim)', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={32} />
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
              <Reveal delay={0.16}><p className="il-p">Покупка золота онлайн от 1 грамма. Задайте сумму и год — калькулятор посчитает результат по официальному курсу ЦБ РФ. Без регистрации.</p></Reveal>
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
            <motion.div className="il-steps" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-10% 0px' }}>
              {STEPS.map((s, i) => (
                <motion.div className="il-step" key={s.n} variants={staggerChild} whileHover={{ y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
                  <div className="il-step-head">
                    <span className="il-step-n">{s.n}</span>
                    {i < STEPS.length - 1 && <span className="il-step-line" aria-hidden />}
                  </div>
                  <h3 className="il-step-title">{s.title}</h3>
                  <p className="il-step-text">{s.text}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── СБП: пополнение и вывод ── */}
        <section className="il-section il-section--sbp">
          <div className="il-section-inner">
            <div className="il-sbp-grid">
              <div className="il-sbp-copy">
                <Reveal><span className="il-pill">Деньги — реактивно быстро</span></Reveal>
                <Reveal delay={0.08}><h2 className="il-h2">Пополнение через <span className="il-accent-text">СБП</span>.<br />Вывод — на карту.</h2></Reveal>
                <Reveal delay={0.16}>
                  <ul className="il-sbp-list">
                    <li><span className="il-card-check">{Ico.check}</span> Пополнение по номеру телефона — без реквизитов</li>
                    <li><span className="il-card-check">{Ico.check}</span> Деньги зачисляются моментально и сразу доступны</li>
                    <li><span className="il-card-check">{Ico.check}</span> Вывод — на карту любого банка</li>
                    <li><span className="il-card-check">{Ico.check}</span> Комиссии видны заранее, до подтверждения</li>
                  </ul>
                </Reveal>
                <Reveal delay={0.24}>
                  <motion.a href="/kabinet" className="il-btn il-btn--primary" whileTap={{ scale: 0.96 }}>
                    Пополнить кошелёк
                    <span className="il-btn-arrow" aria-hidden>→</span>
                  </motion.a>
                </Reveal>
              </div>
              <Reveal delay={0.12} y={48} className="il-sbp-visual-wrap">
                <div className="il-sbp-sheet">
                  <div className="il-sbp-sheet-head">
                    <span>Пополнение кошелька</span>
                    <SbpBadge />
                  </div>
                  <div className="il-sbp-sheet-amount">100 000 ₽</div>
                  <div className="il-sbp-sheet-row">
                    <span>Способ</span>
                    <b>СБП · по номеру телефона</b>
                  </div>
                  <div className="il-sbp-sheet-row">
                    <span>Зачисление</span>
                    <b className="il-sbp-ok">моментально</b>
                  </div>
                  <div className="il-sbp-sheet-btn" aria-hidden>Подтвердить</div>
                </div>
                <motion.div
                  className="il-sbp-mini"
                  animate={{ y: [0, -12, 0] }}
                  transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <span>Вывод на карту</span>
                  <b>150 000 ₽ ✓</b>
                </motion.div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Преимущества ── */}
        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Почему Reaktivo</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Сделано так, как должен<br />работать финтех</h2></Reveal>
            </div>
            <motion.div className="il-cards" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
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

        {/* ── О компании ── */}
        <section className="il-section" id="about">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">О компании</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Reaktivo — деньги.<br /><span className="il-accent-text">Реактивно быстро!</span></h2></Reveal>
            </div>
            <div className="il-about-grid">
              <Reveal delay={0.1} className="il-about-text">
                <p>
                  Reaktivo развивает формат неклассической скупки золота. Мы создаём условия, при которых клиенты
                  свободно управляют своими активами в золоте: не только продают их, чтобы быстро получить ликвидность,
                  но и покупают — чтобы формировать доход, используя потенциал золота.
                </p>
                <p>
                  Клиенты Reaktivo могут быстро получить деньги за ненужное золото — и при этом накапливать золото онлайн:
                  видеть портфель в реальном времени, докупать и продавать по необходимости.
                </p>
                <p>
                  Мы строим не просто сеть пунктов покупки, а экосистему, в которой золото — быстрый, прозрачный
                  и удобный финансовый инструмент.
                </p>
              </Reveal>
              <motion.div className="il-products" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
                <motion.a className="il-product" href="https://reaktivo.ru" target="_blank" rel="noopener noreferrer" variants={staggerChild} whileHover={{ y: -6 }}>
                  <span className="il-product-tag">Reaktivo.ru</span>
                  <h3 className="il-product-title">Продать золото</h3>
                  <p className="il-product-text">Скупка золота в офисах и с доставкой — деньги сразу.</p>
                  <span className="il-product-link">Перейти на Reaktivo.ru →</span>
                </motion.a>
                <motion.a className="il-product il-product--main" href="/kabinet" variants={staggerChild} whileHover={{ y: -6 }}>
                  <span className="il-product-tag">Reaktivo.pro — вы здесь</span>
                  <h3 className="il-product-title">Купить золото</h3>
                  <p className="il-product-text">От 1 грамма онлайн. Reaktivo — ваш агент и покупает золото по выгодному курсу.</p>
                  <span className="il-product-link">Открыть кабинет →</span>
                </motion.a>
                <motion.a className="il-product" href="https://t.me/Reaktivoai" target="_blank" rel="noopener noreferrer" variants={staggerChild} whileHover={{ y: -6 }}>
                  <span className="il-product-tag">Telegram</span>
                  <h3 className="il-product-title">Reaktivo Resale</h3>
                  <p className="il-product-text">Продажа ювелирных украшений в Telegram-канале.</p>
                  <span className="il-product-link">Канал в Telegram →</span>
                </motion.a>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── Цифры ── */}
        <section className="il-section il-section--kpi">
          <div className="il-section-inner">
            <motion.div className="il-kpis" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-10% 0px' }}>
              <motion.div className="il-kpi" variants={staggerChild}>
                <AnimatedNumber to={growth ? growth.multiple : null} format={(v) => `×${v.toFixed(1).replace('.', ',')}`} className="il-kpi-val" />
                <span className="il-kpi-label">рост золота с {growth ? growth.first.year : '2000'} года</span>
              </motion.div>
              <motion.div className="il-kpi" variants={staggerChild}>
                <span className="il-kpi-val">0,0001 г</span>
                <span className="il-kpi-label">точность учёта портфеля</span>
              </motion.div>
              <motion.div className="il-kpi" variants={staggerChild}>
                <span className="il-kpi-val">2 мин</span>
                <span className="il-kpi-label">от входа до первой покупки</span>
              </motion.div>
              <motion.div className="il-kpi" variants={staggerChild}>
                <span className="il-kpi-val">24/7</span>
                <span className="il-kpi-label">кабинет и котировки онлайн</span>
              </motion.div>
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
            <motion.div className="il-faq" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-6% 0px' }}>
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
                <h2 className="il-cta-title">Начните сегодня —<br />это займёт две минуты</h2>
                <p className="il-cta-sub">Вход по номеру телефона. Без анкет и визитов в офис.</p>
                <Magnetic>
                  <motion.a href="/kabinet" className="il-btn il-btn--inverse il-btn--lg" whileTap={{ scale: 0.96 }}>
                    Открыть кабинет
                    <span className="il-btn-arrow" aria-hidden>→</span>
                  </motion.a>
                </Magnetic>
              </div>
            </Reveal>
            <p className="il-disclaimer">
              Материалы носят иллюстративный характер и не являются индивидуальной инвестиционной рекомендацией или предложением по покупке ценных бумаг. Прошлый рост цены не гарантирует будущий результат.
            </p>
          </div>
        </section>
      </main>

      <footer className="il-footer">
        <div className="il-section-inner">
          <div className="il-footer-grid">
            <div className="il-footer-brand">
              <span className="il-logo">REAKTIVO<span>.PRO</span></span>
              <p>Покупка золота онлайн от 1 грамма.<br />Официальные котировки, прозрачные комиссии.</p>
            </div>
            <div className="il-footer-col">
              <span className="il-footer-col-title">Разделы</span>
              <a href="#how" className="il-nav-link" onClick={(e) => goTo(e, '#how')}>Как это работает</a>
              <a href="#about" className="il-nav-link" onClick={(e) => goTo(e, '#about')}>О компании</a>
              <a href="#calc" className="il-nav-link" onClick={(e) => goTo(e, '#calc')}>Калькулятор выгоды</a>
              <a href="#market" className="il-nav-link" onClick={(e) => goTo(e, '#market')}>Динамика рынка</a>
              <a href="#faq" className="il-nav-link" onClick={(e) => goTo(e, '#faq')}>FAQ</a>
            </div>
            <div className="il-footer-col">
              <span className="il-footer-col-title">Продукты</span>
              <a href="https://reaktivo.ru" className="il-nav-link" target="_blank" rel="noopener noreferrer">Продать золото — Reaktivo.ru</a>
              <a href="/kabinet" className="il-nav-link">Купить золото — кабинет</a>
              <a href="https://t.me/Reaktivoai" className="il-nav-link" target="_blank" rel="noopener noreferrer">Reaktivo Resale — Telegram</a>
            </div>
            <div className="il-footer-col">
              <span className="il-footer-col-title">Контакты</span>
              <a href="tel:+78005551848" className="il-nav-link">8 (800) 555-18-48</a>
              <a href="mailto:team@reaktivo.ru" className="il-nav-link">team@reaktivo.ru</a>
              <a href="/pro" className="il-nav-link il-nav-link--dim">Сотрудникам</a>
              <span className="il-nav-link il-nav-link--dim">Документы и лицензии — раздел готовится</span>
            </div>
          </div>
          <div className="il-footer-bottom">
            <span>© {new Date().getFullYear()} REAKTIVO.PRO</span>
            <span>Не является индивидуальной инвестиционной рекомендацией</span>
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
.il-magnetic { display: inline-block; }

/* ── Прогресс скролла ── */
.il-progress {
  position: fixed; top: 0; left: 0; right: 0; height: 3px; z-index: 70;
  background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #fff));
  transform-origin: 0 50%;
}

/* ── Свечение за курсором ── */
.il-cursor-glow {
  position: fixed; top: 0; left: 0; z-index: 1; pointer-events: none;
  width: 620px; height: 620px; margin: -310px 0 0 -310px; border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 9%, transparent), transparent 65%);
}
@media (pointer: coarse) { .il-cursor-glow { display: none; } }

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
.il-nav { display: flex; gap: 24px; }
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
  position: relative; overflow: hidden;
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  border-radius: 14px; font-weight: 700; font-size: 0.9rem; text-decoration: none;
  padding: 12px 22px; border: 1px solid transparent; cursor: pointer;
  transition: box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease, color 0.3s ease, transform 0.3s cubic-bezier(0.22,1,0.36,1);
  white-space: nowrap; will-change: transform;
}
.il-btn-arrow { display: inline-block; transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
.il-btn:hover .il-btn-arrow { transform: translateX(4px); }
.il-btn--primary {
  background: var(--accent); color: #fff;
  box-shadow: 0 10px 32px -10px color-mix(in srgb, var(--accent) 70%, transparent);
}
.il-btn--primary::after {
  content: ''; position: absolute; top: 0; left: -70%; width: 42%; height: 100%;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,0.35), transparent);
  transform: skewX(-18deg); transition: left 0.7s cubic-bezier(0.22,1,0.36,1);
}
.il-btn--primary:hover { box-shadow: 0 18px 48px -12px color-mix(in srgb, var(--accent) 85%, transparent); }
.il-btn--primary:hover::after { left: 130%; }
.il-btn--ghost { background: transparent; border-color: var(--stroke); color: var(--text); }
.il-btn--ghost:hover { border-color: var(--accent); color: var(--accent); }
.il-btn--user {
  max-width: min(220px, 42vw);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  border-color: color-mix(in srgb, var(--accent) 35%, var(--stroke));
  background: var(--accent-soft);
  color: var(--text-strong);
}
:root[data-theme='dark'] .il-btn--user {
  background: rgba(255, 255, 255, 0.07);
  color: var(--text-strong);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}
.il-btn--user:hover { color: var(--accent); }
.il-btn--outline { background: color-mix(in srgb, var(--bg-panel-solid) 60%, transparent); border-color: var(--stroke); color: var(--text-strong); backdrop-filter: blur(6px); }
.il-btn--outline:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-2px); }
.il-btn--inverse { background: #fff; color: var(--accent); box-shadow: 0 14px 40px -12px rgba(0,0,0,0.45); }
.il-btn--inverse:hover { transform: translateY(-2px); }
.il-btn--lg { padding: 16px 30px; font-size: 1rem; border-radius: 16px; }

/* ── СБП бейдж ── */
.il-sbp {
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 0.72rem; font-weight: 800; letter-spacing: 0.04em;
  color: var(--accent); background: var(--accent-soft);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-radius: 8px; padding: 4px 9px;
}
:root[data-theme='dark'] .il-sbp {
  color: var(--text-strong);
  background: rgba(255, 255, 255, 0.08);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}

/* ── Hero ── */
.il-hero { position: relative; padding: 150px 28px 100px; overflow: clip; }
.il-hero-bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.il-hero-orb {
  position: absolute; border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 52%, transparent), transparent 66%);
}
.il-hero-orb--1 { width: 560px; height: 560px; top: -220px; right: -150px; opacity: 0.5; }
.il-hero-orb--2 { width: 420px; height: 420px; bottom: -200px; left: -130px; opacity: 0.32; }
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
  position: relative; z-index: 2; max-width: 1180px; margin: 0 auto;
  display: grid; grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.88fr);
  gap: 64px; align-items: center;
}
.il-badge {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 0.74rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--accent); background: var(--accent-soft);
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  padding: 7px 15px; border-radius: 100px; margin-bottom: 26px;
}
/* Тёмная тема: белый текст вместо красного на красном — иначе бейдж не читается */
:root[data-theme='dark'] .il-badge {
  color: var(--text-strong);
  background: rgba(255, 255, 255, 0.07);
  border-color: color-mix(in srgb, var(--accent) 48%, transparent);
}
.il-badge-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: ilPulse 1.8s ease-in-out infinite; flex-shrink: 0; }
@keyframes ilPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.72); } }

.il-hero-title {
  font-size: clamp(2.4rem, 5.4vw, 4rem);
  font-weight: 800; line-height: 1.07; letter-spacing: -0.035em;
  margin: 0 0 22px; color: var(--text-strong);
  text-wrap: balance;
}
.il-hero-word-clip { display: inline-block; overflow: hidden; vertical-align: bottom; margin-right: 0.26em; padding-bottom: 0.08em; margin-bottom: -0.08em; }
.il-hero-word { display: inline-block; will-change: transform; }
.il-hero-sub { font-size: 1.1rem; line-height: 1.65; color: var(--text-muted); max-width: 560px; margin: 0 0 34px; }
.il-hero-cta { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 46px; align-items: center; }

.il-hero-stats { display: flex; align-items: center; gap: 26px; flex-wrap: wrap; }
.il-hero-stat { display: flex; flex-direction: column; gap: 3px; }
.il-hero-stat-val { font-size: 1.85rem; font-weight: 800; letter-spacing: -0.02em; color: var(--text-strong); font-variant-numeric: tabular-nums; }
.il-hero-stat-label { font-size: 0.8rem; color: var(--text-dim); font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
.il-hero-stat-sep { width: 1px; height: 42px; background: var(--stroke); }
.il-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--emerald); display: inline-block; animation: ilPulse 1.6s ease-in-out infinite; }

/* ── Колода карт ── */
.il-deck-wrap { position: relative; }
.il-deck { position: relative; height: 420px; cursor: pointer; outline: none; }
.il-deck-card {
  position: absolute; top: 0; left: 0;
  width: calc(100% - 96px); height: calc(100% - 78px);
  display: flex; flex-direction: column;
  border-radius: 26px;
  background: color-mix(in srgb, var(--bg-panel-solid) 92%, transparent);
  border: 1px solid var(--stroke);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 40px 90px -40px rgba(0,0,0,0.5);
  padding: 26px 28px 20px;
  will-change: transform;
}
.il-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
.il-card-brand { font-weight: 800; font-size: 0.84rem; letter-spacing: 0.02em; color: var(--text-strong); }
.il-card-brand i { color: var(--accent); font-style: normal; margin: 0 2px; }
.il-card-live { display: inline-flex; align-items: center; gap: 6px; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--emerald); }
.il-card-live i { width: 6px; height: 6px; border-radius: 50%; background: var(--emerald); animation: ilPulse 1.6s ease-in-out infinite; }
.il-card-live--ok i { animation: none; }
.il-card-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); font-weight: 700; }
.il-card-big { font-size: 2.3rem; font-weight: 800; letter-spacing: -0.03em; color: var(--text-strong); font-variant-numeric: tabular-nums; margin: 4px 0 8px; }
.il-card-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.il-card-val { font-size: 1.1rem; font-weight: 700; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.il-card-badge { font-size: 0.72rem; font-weight: 800; color: var(--emerald); background: var(--emerald-soft); padding: 4px 10px; border-radius: 100px; }
.il-card-spark { width: 100%; flex: 1; min-height: 44px; display: block; margin-bottom: 14px; }
.il-card-bars { flex: 1; display: flex; align-items: flex-end; gap: 6px; margin-bottom: 14px; min-height: 52px; }
.il-card-bars span { flex: 1; border-radius: 4px 4px 2px 2px; background: color-mix(in srgb, var(--accent) 22%, var(--stroke)); }
.il-card-bars span.is-hot { background: var(--accent); animation: ilPulse 1.8s ease-in-out infinite; }
.il-card-checks { list-style: none; margin: 2px 0 14px; padding: 0; display: flex; flex-direction: column; gap: 9px; flex: 1; }
.il-card-checks li { display: flex; align-items: center; gap: 10px; font-size: 0.86rem; font-weight: 600; color: var(--text-muted); }
.il-card-check { display: inline-flex; width: 20px; height: 20px; border-radius: 50%; background: var(--emerald-soft); color: var(--emerald); align-items: center; justify-content: center; flex-shrink: 0; }
.il-card-check svg { width: 12px; height: 12px; }
.il-card-foot { display: flex; justify-content: space-between; font-size: 0.74rem; color: var(--text-dim); font-weight: 600; border-top: 1px solid var(--stroke-soft); padding-top: 14px; }
.il-deck-dots { display: flex; gap: 8px; justify-content: center; margin-top: 6px; }
.il-deck-dot {
  width: 20px; height: 5px; border-radius: 100px; border: none; cursor: pointer; padding: 0;
  background: var(--stroke); transition: background 0.3s ease, width 0.3s cubic-bezier(0.22,1,0.36,1);
}
.il-deck-dot.is-active { background: var(--accent); width: 32px; }

/* ── Marquee ── */
.il-marquee {
  border-top: 1px solid var(--stroke-soft); border-bottom: 1px solid var(--stroke-soft);
  background: color-mix(in srgb, var(--bg-panel-solid) 40%, transparent);
  overflow: hidden; padding: 16px 0;
  mask-image: linear-gradient(90deg, transparent, black 8%, black 92%, transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent, black 8%, black 92%, transparent);
}
.il-marquee-track { display: flex; width: max-content; animation: ilMarquee 40s linear infinite; }
.il-marquee:hover .il-marquee-track { animation-play-state: paused; }
@keyframes ilMarquee { to { transform: translateX(-50%); } }
.il-marquee-item {
  display: inline-flex; align-items: center; gap: 28px; padding-right: 28px;
  font-size: 0.84rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--text-dim); white-space: nowrap;
}
.il-marquee-item i { font-style: normal; color: var(--accent); font-size: 0.6rem; }

/* ── Секции ── */
.il-section { padding: 100px 0; position: relative; z-index: 2; }
.il-section--alt { background: color-mix(in srgb, var(--bg-panel-solid) 42%, transparent); }
.il-section-head { text-align: center; max-width: 720px; margin: 0 auto 56px; }
.il-pill {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--bg-panel-solid) 75%, transparent);
  border: 1px solid var(--stroke);
  padding: 7px 15px; border-radius: 100px; margin-bottom: 18px;
}
.il-pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
.il-h2 {
  font-size: clamp(1.85rem, 3.6vw, 2.75rem); font-weight: 800; letter-spacing: -0.03em;
  margin: 0 0 16px; color: var(--text-strong); line-height: 1.14; text-wrap: balance;
}
.il-p { font-size: 1.02rem; line-height: 1.7; color: var(--text-muted); margin: 0; }

/* ── Превью кабинета ── */
.il-section--preview { padding-bottom: 40px; }
.il-preview-perspective { position: relative; perspective: 1400px; max-width: 980px; margin: 0 auto; }
.il-preview-window {
  border-radius: 22px; overflow: hidden;
  background: var(--bg-panel-solid); border: 1px solid var(--stroke);
  box-shadow: 0 60px 120px -50px rgba(0,0,0,0.55);
  transform-origin: 50% 0%;
  will-change: transform;
}
.il-preview-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 18px; border-bottom: 1px solid var(--stroke-soft);
}
.il-preview-dots { display: inline-flex; gap: 6px; }
.il-preview-dots i { width: 10px; height: 10px; border-radius: 50%; background: var(--stroke); display: inline-block; }
.il-preview-url {
  font-size: 0.74rem; font-weight: 600; color: var(--text-dim);
  background: color-mix(in srgb, var(--stroke-soft) 60%, transparent);
  border: 1px solid var(--stroke-soft); border-radius: 100px; padding: 5px 16px;
}
.il-preview-body { display: grid; grid-template-columns: 64px 1fr; min-height: 400px; }
.il-preview-side { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 18px 0; border-right: 1px solid var(--stroke-soft); }
.il-preview-logo { width: 26px; height: 26px; border-radius: 8px; background: var(--accent); margin-bottom: 10px; }
.il-preview-navitem { width: 22px; height: 22px; border-radius: 7px; background: var(--stroke-soft); }
.il-preview-navitem.is-active { background: var(--accent-soft); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); }
.il-preview-main { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
.il-preview-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.il-preview-kpi { border: 1px solid var(--stroke-soft); border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
.il-preview-kpi--pos .il-preview-kpi-val { color: var(--emerald); }
.il-preview-kpi-label { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); font-weight: 700; }
.il-preview-kpi-val { font-size: 1.2rem; font-weight: 800; color: var(--text-strong); font-variant-numeric: tabular-nums; }
.il-preview-clocks { display: flex; gap: 10px; flex-wrap: wrap; }
.il-preview-clock {
  display: inline-flex; align-items: baseline; gap: 8px;
  border: 1px solid var(--stroke-soft); border-radius: 100px; padding: 7px 14px;
}
.il-preview-clock i { font-style: normal; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); }
.il-preview-clock b { font-size: 0.85rem; font-weight: 800; color: var(--text-strong); font-variant-numeric: tabular-nums; }
.il-preview-chart { flex: 1; min-height: 120px; }
.il-preview-rows { display: flex; flex-direction: column; gap: 8px; }
.il-preview-row {
  display: flex; justify-content: space-between; align-items: center;
  border: 1px solid var(--stroke-soft); border-radius: 12px; padding: 10px 14px;
  font-size: 0.8rem; font-weight: 600; color: var(--text-dim);
}
.il-preview-row .is-buy { color: var(--emerald); font-weight: 700; }
.il-preview-row .is-sell { color: var(--accent); font-weight: 700; }
.il-preview-chip {
  position: absolute; z-index: 3;
  font-size: 0.78rem; font-weight: 800; color: var(--text-strong);
  background: color-mix(in srgb, var(--bg-panel-solid) 92%, transparent);
  border: 1px solid var(--stroke); border-radius: 100px; padding: 9px 16px;
  box-shadow: 0 18px 40px -18px rgba(0,0,0,0.4);
  backdrop-filter: blur(10px);
}
.il-preview-chip--1 { top: 8%; left: -26px; color: var(--emerald); }
.il-preview-chip--2 { bottom: 16%; right: -30px; }
.il-preview-chip--3 { bottom: -14px; left: 10%; }

/* ── Заявление ── */
.il-statement { padding: 130px 0 110px; }
.il-statement-text {
  max-width: 900px; margin: 0 auto; text-align: center;
  font-size: clamp(1.7rem, 3.9vw, 2.8rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.3;
  color: var(--text-strong); text-wrap: balance;
}
.il-statement-word { display: inline-block; }

/* ── Market ── */
.il-market-grid { display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr); gap: 56px; align-items: center; }
.il-h2--market { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; }
.il-market-mult-big {
  font-size: clamp(3.2rem, 7vw, 5rem); font-weight: 800; letter-spacing: -0.04em;
  color: var(--accent); font-variant-numeric: tabular-nums; line-height: 1;
}
.il-market-mult-cap { font-size: clamp(1.15rem, 2vw, 1.5rem); color: var(--text-strong); font-weight: 800; letter-spacing: -0.02em; }
.il-market-slogan { font-size: 1.15rem; font-weight: 700; color: var(--text-strong); margin: 0 0 14px; }
.il-market-stats { display: flex; align-items: center; gap: 22px; margin-top: 28px; flex-wrap: wrap; }
.il-market-arrow { color: var(--text-dim); font-size: 1.3rem; }
.il-stat-label { display: block; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-dim); font-weight: 700; margin-bottom: 5px; }
.il-stat-val { display: block; font-size: 1.7rem; font-weight: 800; color: var(--text-strong); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.il-market-chips { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
.il-market-chip {
  font-size: 0.8rem; font-weight: 700; color: var(--text-muted);
  border: 1px solid var(--stroke); border-radius: 100px; padding: 8px 15px;
}
.il-market-chart {
  background: var(--bg-panel-solid); border: 1px solid var(--stroke); border-radius: 22px; padding: 22px 18px;
  box-shadow: 0 30px 70px -40px rgba(0,0,0,0.4);
}
.il-market-loading { display: flex; align-items: center; justify-content: center; height: 290px; color: var(--text-muted); font-size: 0.9rem; }

/* ── Шаги ── */
.il-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
.il-step {
  position: relative;
  background: var(--bg-panel-solid); border: 1px solid var(--stroke); border-radius: 20px; padding: 26px 24px;
  transition: border-color 0.35s ease, box-shadow 0.35s ease;
}
.il-step:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--stroke)); box-shadow: 0 24px 48px -28px color-mix(in srgb, var(--accent) 35%, transparent); }
.il-step-head { position: relative; display: flex; align-items: center; margin-bottom: 18px; }
.il-step-n {
  display: inline-block; font-size: 0.8rem; font-weight: 800; letter-spacing: 0.06em;
  color: var(--accent); background: var(--accent-soft);
  padding: 6px 12px; border-radius: 100px;
}
.il-step-line { position: absolute; left: calc(100% - 46px); right: -44px; top: 50%; height: 2px; background: linear-gradient(90deg, var(--stroke), transparent); }
.il-step-title { font-size: 1.08rem; font-weight: 800; margin: 0 0 10px; color: var(--text-strong); letter-spacing: -0.01em; }
.il-step-text { font-size: 0.89rem; line-height: 1.6; color: var(--text-muted); margin: 0; }

/* ── СБП секция ── */
.il-sbp-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr); gap: 56px; align-items: center; }
.il-sbp-list { list-style: none; margin: 6px 0 28px; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.il-sbp-list li { display: flex; align-items: center; gap: 12px; font-size: 0.98rem; font-weight: 600; color: var(--text-muted); }
.il-sbp-visual-wrap { position: relative; }
.il-sbp-sheet {
  background: var(--bg-panel-solid); border: 1px solid var(--stroke); border-radius: 24px;
  padding: 26px 28px; max-width: 420px; margin: 0 auto;
  box-shadow: 0 40px 90px -40px rgba(0,0,0,0.5);
}
.il-sbp-sheet-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; font-size: 0.8rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; }
.il-sbp-sheet-amount { font-size: 2.4rem; font-weight: 800; letter-spacing: -0.03em; color: var(--text-strong); font-variant-numeric: tabular-nums; margin-bottom: 18px; }
.il-sbp-sheet-row {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  border-top: 1px solid var(--stroke-soft); padding: 13px 0; font-size: 0.88rem;
}
.il-sbp-sheet-row span { color: var(--text-dim); font-weight: 600; }
.il-sbp-sheet-row b { color: var(--text-strong); font-weight: 700; }
.il-sbp-ok { color: var(--emerald) !important; }
.il-sbp-sheet-btn {
  margin-top: 16px; text-align: center; background: var(--accent); color: #fff;
  font-weight: 800; font-size: 0.95rem; border-radius: 14px; padding: 14px;
}
.il-sbp-mini {
  position: absolute; right: 2%; bottom: -26px;
  display: flex; flex-direction: column; gap: 2px;
  background: color-mix(in srgb, var(--bg-panel-solid) 94%, transparent);
  border: 1px solid var(--stroke); border-radius: 16px; padding: 12px 18px;
  box-shadow: 0 18px 40px -18px rgba(0,0,0,0.4);
}
.il-sbp-mini span { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); }
.il-sbp-mini b { font-size: 1.05rem; font-weight: 800; color: var(--emerald); font-variant-numeric: tabular-nums; }

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
.il-card-title { font-size: 1.04rem; font-weight: 800; margin: 0 0 9px; color: var(--text-strong); letter-spacing: -0.01em; }
.il-card-text { font-size: 0.89rem; line-height: 1.6; color: var(--text-muted); margin: 0; }

/* ── О компании ── */
.il-about-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 48px; align-items: start; }
.il-about-text p { margin: 0 0 16px; font-size: 1rem; line-height: 1.75; color: var(--text-muted); }
.il-about-text p:last-child { margin-bottom: 0; }
.il-products { display: flex; flex-direction: column; gap: 14px; }
.il-product {
  display: block; text-decoration: none;
  background: var(--bg-panel-solid); border: 1px solid var(--stroke); border-radius: 18px; padding: 20px 22px;
  transition: border-color 0.35s ease, box-shadow 0.35s ease;
}
.il-product:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--stroke)); box-shadow: 0 24px 48px -28px color-mix(in srgb, var(--accent) 30%, transparent); }
.il-product--main { border-color: color-mix(in srgb, var(--accent) 40%, var(--stroke)); background: linear-gradient(140deg, var(--accent-soft), var(--bg-panel-solid) 55%); }
.il-product-tag { font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); }
.il-product-title { font-size: 1.12rem; font-weight: 800; color: var(--text-strong); margin: 6px 0 6px; letter-spacing: -0.01em; }
.il-product-text { font-size: 0.88rem; line-height: 1.55; color: var(--text-muted); margin: 0 0 10px; }
.il-product-link { font-size: 0.84rem; font-weight: 700; color: var(--accent); }
.il-product-link--dim { color: var(--text-dim); }

/* ── Цифры ── */
.il-section--kpi { padding: 84px 0; }
.il-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; text-align: center; }
.il-kpi { display: flex; flex-direction: column; gap: 8px; padding: 28px 14px; border-radius: 20px; border: 1px solid var(--stroke-soft); }
.il-kpi-val { font-size: clamp(2.3rem, 4.2vw, 3.3rem); font-weight: 800; letter-spacing: -0.03em; color: var(--accent); font-variant-numeric: tabular-nums; }
.il-kpi-label { font-size: 0.84rem; color: var(--text-muted); font-weight: 600; }

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
  font-size: 1rem; font-weight: 700; color: var(--text-strong); font-family: inherit;
}
.il-faq-plus { display: inline-flex; font-size: 1.35rem; color: var(--accent); font-weight: 600; flex-shrink: 0; line-height: 1; }
.il-faq-a { margin: 0; padding: 0 24px 22px; font-size: 0.92rem; line-height: 1.65; color: var(--text-muted); }

/* ── CTA ── */
.il-section--cta { padding-bottom: 72px; }
.il-cta-panel {
  position: relative; overflow: hidden; text-align: center; isolation: isolate;
  background:
    radial-gradient(circle at 10% -10%, rgba(255,255,255,0.24), transparent 42%),
    radial-gradient(circle at 92% 110%, rgba(255,255,255,0.16), transparent 46%),
    linear-gradient(140deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000));
  border-radius: 30px; padding: 78px 32px;
  box-shadow: 0 40px 90px -40px color-mix(in srgb, var(--accent) 60%, transparent);
}
.il-cta-title { position: relative; font-size: clamp(1.8rem, 3.6vw, 2.6rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.15; color: #fff; margin: 0 0 14px; }
.il-cta-sub { position: relative; font-size: 1.02rem; color: rgba(255,255,255,0.82); margin: 0 0 30px; }
.il-cta-panel .il-magnetic { position: relative; }
.il-disclaimer { font-size: 0.74rem; color: var(--text-dim); line-height: 1.55; max-width: 640px; margin: 26px auto 0; text-align: center; }

/* ── Footer ── */
.il-footer { border-top: 1px solid var(--stroke-soft); padding: 48px 0 28px; }
.il-footer-grid { display: grid; grid-template-columns: 1.3fr 1fr 1fr 1fr; gap: 32px; margin-bottom: 36px; }
.il-footer-brand p { margin: 12px 0 0; font-size: 0.87rem; line-height: 1.6; color: var(--text-muted); }
.il-footer-col { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.il-footer-col-title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 800; color: var(--text-dim); margin-bottom: 4px; }
.il-footer-bottom {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  border-top: 1px solid var(--stroke-soft); padding-top: 22px;
  font-size: 0.78rem; color: var(--text-dim);
}
.il-nav-link--dim { color: var(--text-dim); font-weight: 500; }

/* ── Адаптив ── */
@media (max-width: 1020px) {
  .il-hero-inner { grid-template-columns: 1fr; gap: 52px; }
  .il-deck-wrap { max-width: 500px; margin: 0 auto; width: 100%; }
  .il-market-grid { grid-template-columns: 1fr; gap: 40px; }
  .il-sbp-grid { grid-template-columns: 1fr; gap: 44px; }
  .il-about-grid { grid-template-columns: 1fr; gap: 36px; }
  .il-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .il-step-line { display: none; }
  .il-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .il-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .il-footer-grid { grid-template-columns: 1fr 1fr; }
  .il-preview-chip--1 { left: 8px; }
  .il-preview-chip--2 { right: 8px; }
}
@media (max-width: 720px) {
  .il-nav { display: none; }
  .il-hero { padding: 118px 20px 64px; }
  .il-hero-title { font-size: clamp(2.1rem, 9.4vw, 2.7rem); }
  .il-hero-stats { gap: 18px; }
  .il-hero-stat-sep { display: none; }
  .il-hero-stat-val { font-size: 1.6rem; }
  .il-section { padding: 68px 0; }
  .il-section-head { margin-bottom: 38px; }
  .il-deck { height: 400px; }
  .il-deck-card { width: calc(100% - 52px); height: calc(100% - 66px); padding: 22px 22px 16px; }
  .il-card-big { font-size: 2rem; }
  .il-statement { padding: 84px 0 70px; }
  .il-steps { grid-template-columns: 1fr; }
  .il-cards { grid-template-columns: 1fr; }
  .il-sbp-mini { right: 0; bottom: -20px; }
  .il-preview-body { grid-template-columns: 1fr; }
  .il-preview-side { display: none; }
  .il-preview-kpis { grid-template-columns: 1fr 1fr; }
  .il-cta-panel { padding: 56px 22px; }
  .il-footer-grid { grid-template-columns: 1fr; gap: 26px; }
  .il-footer-bottom { flex-direction: column; align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) {
  .il-marquee-track { animation: none; }
  .il-cursor-glow { display: none; }
}
`;
