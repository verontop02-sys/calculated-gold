import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import Lenis from 'lenis';
import { clientApi, fintechApi, getClientToken, getFintechToken } from './api.js';
import { ymReachGoal } from './yandexMetrika.js';
import { ThemeToggle } from './ThemeToggle.jsx';
import { JewelryShowcase } from './JewelryShowcase.jsx';
import officeHall from './assets/office/hall.jpg';

export const EASE = [0.22, 1, 0.36, 1];
export const SPRING = { type: 'spring', stiffness: 230, damping: 28, mass: 0.9 };

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
  { n: '01', title: 'Выберите изделие', text: 'На витрине конкретные ювелирные изделия из сети скупки. У каждого — проба, вес, клеймо и цена.' },
  { n: '02', title: 'Оплатите выбранное', text: 'Карта или СБП. Оплата всегда за конкретное изделие — без счёта «на потом» и без свободного ввода-вывода денег.' },
  { n: '03', title: 'Заказ в кабинете', text: 'После оплаты заказ появляется в личном кабинете. Там же — ваши продажи в режиме скупки.' },
  { n: '04', title: 'Получение', text: 'Самовывоз, доставка или хранение изделия. Когда решите забрать — оформляете выдачу отдельным запросом.' },
];

const ADVANTAGES = [
  { icon: Ico.scale, title: 'Конкретное изделие', text: 'Вы покупаете ювелирное изделие с пробой, клеймом, именником и биркой — не абстрактный металл.' },
  { icon: Ico.eye, title: 'Цена до оплаты', text: 'Стоимость изделия видна на витрине. Наценка уже внутри цены, скрытых удержаний нет.' },
  { icon: Ico.shield, title: 'Проба и ГИИС', text: 'На изделиях государственное пробирное клеймо, именник, бирка и учёт в ГИИС ДМДК.' },
  { icon: Ico.bolt, title: 'Оплата за заказ', text: 'Карта или СБП только за выбранное изделие. Отдельного счёта и вывода «свободных» денег нет.' },
  { icon: Ico.doc, title: 'Кабинет заказов', text: 'В кабинете два раздела: ваши продажи в скупку и заказы ювелирных изделий.' },
  { icon: Ico.bot, title: 'Украшения из скупки', text: 'Кольца, цепи, серьги, браслеты и подвески, выкупленные в отделениях Reaktivo. У каждого изделия — проба и цена.' },
];

const FAQ = [
  { q: 'Что продаёт Reaktivo на этом сайте?', a: 'Конкретные ювелирные изделия с пробой, клеймом, именником и биркой, в учёте ГИИС ДМДК. На витрине кольца, цепи, серьги, браслеты и подвески, выкупленные в отделениях скупки.' },
  { q: 'Это магазин изделий или продажа металла «на вес»?', a: 'Это интернет-магазин конкретных ювелирных изделий. Вы выбираете позицию на витрине и оплачиваете именно её.' },
  { q: 'Можно ли внести деньги заранее и купить позже?', a: 'Нет. Отдельного счёта для свободных денег нет. Оплата проходит только за выбранное изделие — картой или СБП.' },
  { q: 'Что видно в личном кабинете?', a: 'Заказы ювелирных изделий и ваши продажи в режиме скупки. Других разделов нет: ни свободного пополнения, ни вывода денег мимо покупки изделия.' },
  { q: 'Это банковский металл 999?', a: 'Нет. Мы продаём ювелирные изделия с пробой, клеймом и биркой. Банковский металл 999 на этом сайте не продаётся.' },
  { q: 'Нужно ли приходить в офис?', a: 'Для заказа на сайте — нет. Для получения изделия можно оформить доставку или забрать в сети. Для покупки по закону нужна идентификация по паспорту РФ.' },
  { q: 'Как продать изделие Reaktivo?', a: 'Через сеть скупки: оценка в отделении, договор, выплата. История этих продаж остаётся в кабинете отдельно от заказов на витрине.' },
];

const MARQUEE = [
  'Ювелирные изделия',
  'Пробы 585 / 750 / 900',
  'Клеймо и именник',
  'ГИИС ДМДК',
  'Витрина онлайн',
  'Оплата изделия',
  'Украшения из скупки',
  'Кабинет заказов',
];

const STATEMENT_WORDS = 'Интернет-магазин ювелирных изделий. Украшения с пробой, клеймом и биркой.'.split(' ');

const OFFICE_GALLERY = [
  { src: officeHall, alt: 'Зал обслуживания Reaktivo' },
];

const LB_EVENT = 'il:lightbox';

/* ═══════════════ Галерея офиса + лайтбокс ═══════════════ */

function OfficeGallery() {
  const [open, setOpen] = useState(false);
  const photo = OFFICE_GALLERY[0];

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    const blockScroll = (e) => {
      e.preventDefault();
    };

    const prevOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.classList.add('il-lb-open');
    window.dispatchEvent(new CustomEvent(LB_EVENT, { detail: { open: true } }));

    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', blockScroll, { passive: false });
    window.addEventListener('touchmove', blockScroll, { passive: false });

    return () => {
      document.body.style.overflow = prevOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.documentElement.classList.remove('il-lb-open');
      window.dispatchEvent(new CustomEvent(LB_EVENT, { detail: { open: false } }));
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', blockScroll);
      window.removeEventListener('touchmove', blockScroll);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="il-about-photo-btn"
        onClick={() => setOpen(true)}
        aria-label={`Открыть фото: ${photo.alt}`}
      >
        <img src={photo.src} alt={photo.alt} loading="eager" decoding="async" />
        <span className="il-about-mosaic-zoom" aria-hidden>⤢</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="il-lb"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-label="Просмотр фото"
          >
            <button type="button" className="il-lb-backdrop" aria-label="Закрыть" onClick={close} />
            <button type="button" className="il-lb-close" aria-label="Закрыть" onClick={close}>×</button>
            <motion.figure
              className="il-lb-figure"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              <img src={photo.src} alt={photo.alt} draggable={false} />
              <figcaption>{photo.alt}</figcaption>
            </motion.figure>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ═══════════════ Анимационные примитивы ═══════════════ */

export function Reveal({ children, className = '', delay = 0, y = 34, ...rest }) {
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

export const staggerParent = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } } };
export const staggerChild = {
  hidden: { opacity: 0, y: 36, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.75, ease: EASE } },
};

/* Магнитная кнопка (desktop) */
export function Magnetic({ children, strength = 0.28 }) {
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

const SbpBadge = ({ className = '' }) => (
  <span className={`il-sbp ${className}`.trim()} title="Система быстрых платежей" role="img" aria-label="СБП">
    <img src="/sbp.png" alt="" className="il-sbp-logo" width="72" height="24" decoding="async" />
  </span>
);

/** Вставляет официальный значок СБП вместо текста «СБП» в строках. */
function withSbp(text) {
  const parts = String(text || '').split('СБП');
  if (parts.length === 1) return text;
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 ? <SbpBadge className="il-sbp--inline" /> : null}
    </Fragment>
  ));
}

function ConsultLeadForm() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setOk(false);
    if (!consent) {
      setErr('Отметьте согласие на обработку персональных данных');
      return;
    }
    setBusy(true);
    try {
      const API_BASE = import.meta.env.DEV ? '/api' : import.meta.env.VITE_API_BASE || '/api';
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      const viaSb = /supabase\.co\/functions\//i.test(API_BASE);
      const res = await fetch(`${API_BASE}/public/consult-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(viaSb && anon
            ? { apikey: anon, Authorization: `Bearer ${anon}` }
            : {}),
        },
        body: JSON.stringify({ name, phone }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Не удалось отправить заявку');
      ymReachGoal('lead', { source: 'consult' });
      setOk(true);
      setName('');
      setPhone('');
      setConsent(false);
    } catch (e2) {
      setErr(e2?.message || 'Не удалось отправить заявку');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="il-lead-form" onSubmit={submit}>
      <label className="il-lead-field">
        <span>Имя</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Как к вам обращаться"
          autoComplete="name"
          required
          minLength={2}
        />
      </label>
      <label className="il-lead-field">
        <span>Телефон</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+7 (900) 000-00-00"
          inputMode="tel"
          autoComplete="tel"
          required
        />
      </label>
      <label className="il-lead-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
        />
        <span>
          Даю согласие на обработку персональных данных в соответствии с{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer">
            Политикой обработки персональных данных
          </a>
        </span>
      </label>
      <button type="submit" className="il-btn il-btn--primary" disabled={busy || !consent}>
        {busy ? 'Отправляем…' : 'Оставить заявку'}
      </button>
      {err && <p className="il-lead-err">{err}</p>}
      {ok && <p className="il-lead-ok">Заявка принята. Специалист свяжется с вами.</p>}
    </form>
  );
}

/* ═══════════════ Hero: колода карт ═══════════════ */

function deckSlot(pos) {
  if (pos === 0) return { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 };
  if (pos === 1) return { x: 34, y: 28, scale: 0.95, rotate: 3.5, opacity: 0.88 };
  if (pos === 2) return { x: 68, y: 56, scale: 0.9, rotate: 7, opacity: 0.62 };
  return { x: 96, y: 78, scale: 0.86, rotate: 9, opacity: 0 };
}

function DeckPortfolioCard({ quote }) {
  const price = quote?.goldRubPerGram ? Math.round(quote.goldRubPerGram * 0.585 * 4.2) : null;
  return (
    <>
      <div className="il-card-top">
        <span className="il-card-brand">REAKTIVO<i>·</i>PRO</span>
      </div>
      <span className="il-card-label">Заказ изделия</span>
      <div className="il-card-big">Кольцо · 585</div>
      <div className="il-card-row">
        <span className="il-card-val">{price ? formatMoney(price) : '· · ·'}</span>
        <span className="il-card-badge">украшение</span>
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
        <span>Клеймо · именник · бирка</span>
        <span>ГИИС ДМДК</span>
      </div>
    </>
  );
}

const PRICE_BARS = [34, 41, 38, 47, 44, 56, 52, 63, 60, 72, 78, 92];

function DeckPriceCard({ quote }) {
  return (
    <>
      <div className="il-card-top">
        <span className="il-card-brand">Витрина</span>
        <span className="il-card-live"><i />585</span>
      </div>
      <span className="il-card-label">Кольцо обручальное</span>
      <div className="il-card-big">{quote?.goldRubPerGram ? formatMoney(Math.round(quote.goldRubPerGram * 0.585 * 4.2)) : '· · ·'}</div>
      <div className="il-card-row">
        <span className="il-card-badge">4,2 г · проба 585</span>
      </div>
      <div className="il-card-bars" aria-hidden>
        {PRICE_BARS.map((h, i) => (
          <span key={i} style={{ height: `${h}%` }} className={i === PRICE_BARS.length - 1 ? 'is-hot' : ''} />
        ))}
      </div>
      <div className="il-card-foot">
        <span>Цена изделия</span>
        <span>оплата за выбранное</span>
      </div>
    </>
  );
}

function DeckTopupCard() {
  return (
    <>
      <div className="il-card-top">
        <span className="il-card-brand">Украшение</span>
        <span className="il-card-live il-card-live--ok"><i />в наличии</span>
      </div>
      <span className="il-card-label">Цепь якорная 585</span>
      <div className="il-card-big">8,6 г</div>
      <div className="il-card-row">
        <span className="il-card-badge">из сети скупки</span>
      </div>
      <ul className="il-card-checks">
        <li><span className="il-card-check">{Ico.check}</span> Выкуплено в отделении Reaktivo</li>
        <li><span className="il-card-check">{Ico.check}</span> Проба, клеймо и бирка</li>
      </ul>
      <div className="il-card-foot">
        <span>Конкретное изделие</span>
        <span>с пробой и биркой</span>
      </div>
    </>
  );
}

function DeckDealCard({ quote }) {
  const total = quote?.goldRubPerGram ? Math.round(quote.goldRubPerGram * 0.585 * 4.2) : null;
  return (
    <>
      <div className="il-card-top">
        <span className="il-card-brand">Оплата</span>
        <span className="il-card-live il-card-live--ok"><i />за изделие</span>
      </div>
      <span className="il-card-label">Кольцо 585 · 4,2 г</span>
      <div className="il-card-big">{total ? formatMoney(total) : '· · ·'}</div>
      <ul className="il-card-checks">
        <li><span className="il-card-check">{Ico.check}</span> Цена изделия до оплаты</li>
        <li><span className="il-card-check">{Ico.check}</span> Карта или СБП</li>
        <li><span className="il-card-check">{Ico.check}</span> Оплата только изделия</li>
      </ul>
      <div className="il-card-foot">
        <span>Заказ</span>
        <span>в кабинете</span>
      </div>
    </>
  );
}

function DeckWithdrawCard() {
  return (
    <>
      <div className="il-card-top">
        <span className="il-card-brand">Скупка</span>
        <span className="il-card-live il-card-live--ok"><i />выплата</span>
      </div>
      <span className="il-card-label">Продажа изделия нам</span>
      <div className="il-card-big">наличные / карта</div>
      <ul className="il-card-checks">
        <li><span className="il-card-check">{Ico.check}</span> Оценка в отделении</li>
        <li><span className="il-card-check">{Ico.check}</span> Договор скупки</li>
        <li><span className="il-card-check">{Ico.check}</span> История в кабинете</li>
      </ul>
      <div className="il-card-foot">
        <span>Reaktivo.ru</span>
        <span>сеть скупки</span>
      </div>
    </>
  );
}

function HeroDeck({ quote }) {
  const cards = [
    <DeckPortfolioCard quote={quote} key="p" />,
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
  { t: 'Ювелирные' }, { t: 'изделия', gold: true }, { t: 'с' }, { t: 'пробой' },
  { t: 'и' }, { t: 'клеймом' },
];

function HeroTitle() {
  return (
    <motion.h1
      className="il-hero-title"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.055, delayChildren: 0.12 } } }}
      aria-label={TITLE_WORDS.map((w) => w.t).join(' ')}
    >
      {TITLE_WORDS.map((w, i) => (
        <span key={i} className="il-hero-word-clip" aria-hidden>
          <motion.span
            className={`il-hero-word${w.gold ? ' il-gold-text' : ''}`}
            variants={{
              hidden: { y: '110%', opacity: 0 },
              show: { y: 0, opacity: 1, transition: { duration: 0.7, ease: EASE } },
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

function DashboardPreview() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-8% 0px' });
  void inView;
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
                <span className="il-preview-kpi-label">Заказы</span>
                <span className="il-preview-kpi-val">2 изделия</span>
              </div>
              <div className="il-preview-kpi">
                <span className="il-preview-kpi-label">Скупка</span>
                <span className="il-preview-kpi-val">3 продажи</span>
              </div>
              <div className="il-preview-kpi il-preview-kpi--pos">
                <span className="il-preview-kpi-label">Статус</span>
                <span className="il-preview-kpi-val">оплачено</span>
              </div>
            </div>
            <PreviewClocks />
            <div className="il-preview-rows" aria-hidden>
              <div className="il-preview-row"><span className="is-buy">Заказ · кольцо 585</span><span>оплачено</span></div>
              <div className="il-preview-row"><span className="is-buy">Заказ · цепь 585</span><span>ожидает выдачи</span></div>
              <div className="il-preview-row"><span className="is-sell">Скупка · кольцо</span><span>выплата в отделении</span></div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.span
        className="il-preview-chip il-preview-chip--1"
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        Кольцо 585
      </motion.span>
      <motion.span
        className="il-preview-chip il-preview-chip--2"
        animate={{ y: [0, 12, 0] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      >
        <SbpBadge className="il-sbp--compact" /> · за секунды
      </motion.span>
      <motion.span
        className="il-preview-chip il-preview-chip--3"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      >
        Оплата изделия
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
            <p className="il-faq-a">{withSbp(item.a)}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════ Страница ═══════════════ */

export function InvestLanding() {
  const [quote, setQuote] = useState(null);
  const [openFaq, setOpenFaq] = useState(-1);
  const [scrolled, setScrolled] = useState(false);
  // Если пользователь уже в кабинете — в шапке фамилия с инициалами вместо «Войти»
  const [headerUser, setHeaderUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const lenisRef = useRef(null);
  const heroRef = useRef(null);

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
    const onLightbox = (e) => {
      if (e.detail?.open) lenis.stop();
      else lenis.start();
    };
    window.addEventListener(LB_EVENT, onLightbox);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(LB_EVENT, onLightbox);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  const goTo = (e, selector) => {
    e.preventDefault();
    setMenuOpen(false);
    if (lenisRef.current) lenisRef.current.scrollTo(selector, { offset: -84, duration: 1.5 });
    else document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [menuOpen]);

  useEffect(() => {
    document.title = 'REAKTIVO.PRO — ювелирные изделия с пробой и клеймом';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      'content',
      'Reaktivo — интернет-магазин ювелирных изделий из сети скупки. Клеймо, именник, бирка, ГИИС ДМДК. Оплата конкретного изделия.'
    );
  }, []);

  useEffect(() => {
    let alive = true;
    clientApi.buybackQuote('moex').then((q) => { if (alive) setQuote(q); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <div className="il-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <CursorGlow />

      <header className={`il-header${scrolled ? ' il-header--scrolled' : ''}`}>
        <div className="il-header-inner">
          <a href="/" className="il-logo" aria-label="REAKTIVO.PRO">
            <img className="il-logo-mark" src="/logo-reaktivo-mark.svg" alt="" width="40" height="40" />
            <span className="il-logo-text">REAKTIVO<span>.PRO</span></span>
          </a>
          <nav className="il-nav" aria-label="Основная навигация">
            <a href="#shop" className="il-nav-link" onClick={(e) => goTo(e, '#shop')}>Витрина</a>
            <a href="#how" className="il-nav-link" onClick={(e) => goTo(e, '#how')}>Как это работает</a>
            <a href="#about" className="il-nav-link" onClick={(e) => goTo(e, '#about')}>О компании</a>
            <a href="#partners" className="il-nav-link" onClick={(e) => goTo(e, '#partners')}>Партнёрам</a>
            <a href="#faq" className="il-nav-link" onClick={(e) => goTo(e, '#faq')}>Отвечаем честно</a>
            <a href="#contacts" className="il-nav-link" onClick={(e) => goTo(e, '#contacts')}>Контакты</a>
          </nav>
          <div className="il-header-actions">
            <a href="tel:+78005551848" className="il-header-phone" title="8 800 555-18-48" aria-label="Позвонить: 8 800 555-18-48">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z" />
              </svg>
            </a>
            <ThemeToggle />
            <motion.a
              href="/kabinet"
              className={`il-btn il-btn--ghost il-btn--header-login${headerUser ? ' il-btn--user' : ''}`}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              title={headerUser ? 'Открыть кабинет' : 'Войти в кабинет'}
            >
              {headerUser || 'Войти'}
            </motion.a>
            <motion.a
              href="/kabinet"
              className="il-btn il-btn--primary il-btn--header-buy"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
            >
              Купить изделие
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
          <motion.div
            className="il-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <button type="button" className="il-menu-backdrop" aria-label="Закрыть" onClick={() => setMenuOpen(false)} />
            <motion.div
              className="il-menu-sheet"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              role="dialog"
              aria-modal="true"
              aria-label="Меню"
            >
              <div className="il-menu-head">
                <a href="/" className="il-logo" aria-label="REAKTIVO.PRO" onClick={() => setMenuOpen(false)}>
                  <img className="il-logo-mark" src="/logo-reaktivo-mark.svg" alt="" width="36" height="36" />
                  <span className="il-logo-text">REAKTIVO<span>.PRO</span></span>
                </a>
                <button type="button" className="il-menu-close" aria-label="Закрыть" onClick={() => setMenuOpen(false)}>×</button>
              </div>
              <nav className="il-menu-nav">
                <a href="#shop" onClick={(e) => goTo(e, '#shop')}>Витрина</a>
                <a href="#how" onClick={(e) => goTo(e, '#how')}>Как это работает</a>
                <a href="#about" onClick={(e) => goTo(e, '#about')}>О компании</a>
                <a href="#partners" onClick={(e) => goTo(e, '#partners')}>Партнёрам</a>
                <a href="#faq" onClick={(e) => goTo(e, '#faq')}>Отвечаем честно</a>
                <a href="#contacts" onClick={(e) => goTo(e, '#contacts')}>Контакты</a>
              </nav>
              <div className="il-menu-actions">
                <a href="/kabinet" className="il-btn il-btn--ghost" onClick={() => setMenuOpen(false)}>
                  {headerUser || 'Войти'}
                </a>
                <a href="/kabinet" className="il-btn il-btn--primary" onClick={() => setMenuOpen(false)}>
                  Купить изделие
                </a>
              </div>
              <div className="il-menu-contacts">
                <a href="tel:+78005551848" className="il-menu-phone">8 800 555-18-48</a>
                <a href="mailto:team@reaktivo.ru" className="il-menu-mail">Team@reaktivo.ru</a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                <i className="il-badge-dot" /> Интернет-магазин ювелирных изделий
              </motion.span>

              <HeroTitle />

              <motion.p className="il-hero-sub" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.5, ease: EASE }}>
                Витрина конкретных изделий: кольца, цепи, серьги, браслеты и подвески из сети скупки.
                Проба, клеймо, именник, бирка. Оплата только выбранного изделия — без свободного пополнения и вывода денег.
              </motion.p>

              <motion.div className="il-hero-cta" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.64, ease: EASE }}>
                <Magnetic>
                  <motion.a href="/kabinet" className="il-btn il-btn--primary il-btn--lg" whileTap={{ scale: 0.96 }}>
                    Купить изделие
                    <span className="il-btn-arrow" aria-hidden>→</span>
                  </motion.a>
                </Magnetic>
                <motion.a href="#shop" className="il-btn il-btn--outline il-btn--lg" onClick={(e) => goTo(e, '#shop')} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}>
                  Открыть витрину
                </motion.a>
              </motion.div>

              <motion.div className="il-hero-stats" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.78, ease: EASE }}>
                <div className="il-hero-stat">
                  <span className="il-hero-stat-val">585 · 750 · 900</span>
                  <span className="il-hero-stat-label">пробы изделий</span>
                </div>
                <div className="il-hero-stat-sep" aria-hidden />
                <div className="il-hero-stat">
                  <span className="il-hero-stat-val">ГИИС</span>
                  <span className="il-hero-stat-label">клеймо, именник, бирка</span>
                </div>
                <div className="il-hero-stat-sep" aria-hidden />
                <div className="il-hero-stat">
                  <span className="il-hero-stat-val">витрина</span>
                  <span className="il-hero-stat-label">украшения с пробой</span>
                </div>
              </motion.div>
            </div>

            <motion.div style={{ y: deckY }}>
              <HeroDeck quote={quote} />
            </motion.div>
          </motion.div>
        </section>

        {/* ── Бегущая строка ── */}
        <div className="il-marquee" aria-hidden>
          <div className="il-marquee-track">
            {[...MARQUEE, ...MARQUEE].map((t, i) => (
              <span className="il-marquee-item" key={i}>{withSbp(t)}<i>◆</i></span>
            ))}
          </div>
        </div>

        {/* ── Превью кабинета ── */}
        <section className="il-section il-section--preview">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Личный кабинет</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Кабинет: <span className="il-accent-text">заказы и скупка</span></h2></Reveal>
              <Reveal delay={0.16}><p className="il-p">В кабинете только заказы ювелирных изделий и ваши продажи в режиме скупки.</p></Reveal>
            </div>
            <DashboardPreview />
          </div>
        </section>

        {/* ── Заявление ── */}
        <Statement />

        {/* ── Витрина ── */}
        <section className="il-section il-section--shop" id="shop">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Витрина</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Ювелирные изделия, <span className="il-accent-text">доступные к покупке</span></h2></Reveal>
              <Reveal delay={0.16}><p className="il-p">Кольца, цепи, серьги, браслеты и подвески, выкупленные в отделениях скупки Reaktivo. У каждой позиции — проба, вес, клеймо и цена. Оплата только выбранного изделия. Часть позиций появится позже.</p></Reveal>
            </div>
            <Reveal delay={0.08} y={28}>
              <JewelryShowcase quote={quote} />
            </Reveal>
          </div>
        </section>

        {/* ── Как это работает ── */}
        <section className="il-section" id="how">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Как это работает</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Четыре шага — от витрины до изделия</h2></Reveal>
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

        {/* ── Оплата изделия ── */}
        <section className="il-section il-section--sbp">
          <div className="il-section-inner">
            <div className="il-sbp-grid">
              <div className="il-sbp-copy">
                <Reveal><span className="il-pill">Оплата</span></Reveal>
                <Reveal delay={0.08}>
                  <h2 className="il-h2">Карта или <SbpBadge className="il-sbp--heading" /><br />только за выбранное изделие.</h2>
                </Reveal>
                <Reveal delay={0.16}>
                  <ul className="il-sbp-list">
                    <li><span className="il-card-check">{Ico.check}</span> Цена изделия видна до оплаты</li>
                    <li><span className="il-card-check">{Ico.check}</span> Карта или СБП — без реквизитов вручную</li>
                    <li><span className="il-card-check">{Ico.check}</span> Заказ появляется в кабинете после оплаты</li>
                    <li><span className="il-card-check">{Ico.check}</span> Свободного пополнения и вывода денег нет</li>
                  </ul>
                </Reveal>
                <Reveal delay={0.24}>
                  <motion.a href="#shop" className="il-btn il-btn--primary" onClick={(e) => goTo(e, '#shop')} whileTap={{ scale: 0.96 }}>
                    Выбрать изделие
                    <span className="il-btn-arrow" aria-hidden>→</span>
                  </motion.a>
                </Reveal>
              </div>
              <Reveal delay={0.12} y={48} className="il-sbp-visual-wrap">
                <div className="il-sbp-sheet">
                  <div className="il-sbp-sheet-head">
                    <span>Оплата изделия</span>
                    <SbpBadge />
                  </div>
                  <div className="il-sbp-sheet-amount">Кольцо обручальное · 585</div>
                  <div className="il-sbp-sheet-row">
                    <span>Способ</span>
                    <b className="il-sbp-method">{withSbp('СБП')} или карта</b>
                  </div>
                  <div className="il-sbp-sheet-row">
                    <span>Назначение</span>
                    <b className="il-sbp-ok">конкретное изделие</b>
                  </div>
                  <div className="il-sbp-sheet-btn" aria-hidden>Оплатить</div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Преимущества ── */}
        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Почему Reaktivo</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Сделано так, как должен<br />работать ювелирный магазин</h2></Reveal>
            </div>
            <motion.div className="il-cards" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
              {ADVANTAGES.map((a) => (
                <motion.div className="il-card" key={a.title} variants={staggerChild} whileHover={{ y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
                  <span className="il-card-icon">{a.icon}</span>
                  <h3 className="il-card-title">{a.title}</h3>
                  <p className="il-card-text">{withSbp(a.text)}</p>
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
                  Reaktivo — сеть скупки и интернет-магазин ювелирных изделий. Клиенты продают нам изделия в отделениях
                  и заказывают на сайте конкретные позиции с витрины: кольца, цепи, серьги, браслеты и подвески, выкупленные в скупке.
                </p>
                <p>
                  Каждое изделие — с пробой, клеймом, именником и биркой, в учёте ГИИС ДМДК. Оплата на сайте идёт только
                  за выбранную позицию. В кабинете видны заказы и история продаж в режиме скупки.
                </p>
                <p>
                  Мы строим удобную сеть пунктов покупки и витрину изделий, которые можно выбрать и оплатить дистанционно.
                </p>
              </Reveal>
              <motion.div className="il-products" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
                <motion.a className="il-product" href="https://reaktivo.ru" target="_blank" rel="noopener noreferrer" variants={staggerChild} whileHover={{ y: -3 }}>
                  <span className="il-product-tag">Reaktivo.ru</span>
                  <h3 className="il-product-title">Продать изделие</h3>
                  <p className="il-product-text">Скупка золота в офисах и с доставкой — деньги сразу.</p>
                  <span className="il-product-link">Перейти на Reaktivo.ru →</span>
                </motion.a>
                <motion.a className="il-product il-product--main" href="/kabinet" variants={staggerChild} whileHover={{ y: -3 }}>
                  <span className="il-product-tag">Reaktivo.pro — вы здесь</span>
                  <h3 className="il-product-title">Ювелирные изделия</h3>
                  <p className="il-product-text">Витрина украшений из сети скупки. Оплата конкретного изделия.</p>
                  <span className="il-product-link">Открыть витрину →</span>
                </motion.a>
                <motion.a className="il-product" href="https://t.me/Reaktivoai" target="_blank" rel="noopener noreferrer" variants={staggerChild} whileHover={{ y: -3 }}>
                  <span className="il-product-tag">Telegram</span>
                  <h3 className="il-product-title">Reaktivo Resale</h3>
                  <p className="il-product-text">Продажа ювелирных украшений в Telegram-канале.</p>
                  <span className="il-product-link">Канал в Telegram →</span>
                </motion.a>
              </motion.div>
              <Reveal delay={0.16} className="il-about-photo">
                <OfficeGallery />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Партнёрам ── */}
        <section className="il-section il-section--partners" id="partners">
          <div className="il-section-inner">
            <Reveal y={40}>
              <div className="il-partner-banner">
                <div className="il-partner-copy">
                  <span className="il-pill">Стать партнёром</span>
                  <h2 className="il-partner-title">Открыть точку Reaktivo<br /><span className="il-accent-text">или стать партнёром</span></h2>
                  <p className="il-partner-text">
                    Напишите нам, если хотите стать партнёром Reaktivo или открыть свою точку скупки золота под брендом Reaktivo.
                  </p>
                  <div className="il-partner-actions">
                    <Magnetic>
                      <motion.a href="mailto:team@reaktivo.ru?subject=Партнёрство%20Reaktivo" className="il-btn il-btn--primary il-btn--lg il-partner-cta" whileTap={{ scale: 0.96 }}>
                        Написать команде
                        <span className="il-btn-arrow" aria-hidden>→</span>
                      </motion.a>
                    </Magnetic>
                    <a href="https://reaktivo.ru" className="il-btn il-btn--outline il-btn--lg" target="_blank" rel="noopener noreferrer">
                      Узнать о точках
                    </a>
                  </div>
                </div>
                <div className="il-partner-aside" aria-hidden>
                  <span className="il-partner-mark">
                    <img src="/logo-reaktivo-mark.svg" alt="" width="168" height="168" />
                  </span>
                  <span className="il-partner-aside-label">Reaktivo Partner</span>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Цифры ── */}
        <section className="il-section il-section--kpi">
          <div className="il-section-inner">
            <motion.div className="il-kpis" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-10% 0px' }}>
              <motion.div className="il-kpi" variants={staggerChild}>
                <span className="il-kpi-val">585 · 750 · 900</span>
                <span className="il-kpi-label">пробы ювелирных изделий</span>
              </motion.div>
              <motion.div className="il-kpi" variants={staggerChild}>
                <span className="il-kpi-val">ГИИС</span>
                <span className="il-kpi-label">клеймо, именник и бирка</span>
              </motion.div>
              <motion.div className="il-kpi" variants={staggerChild}>
                <span className="il-kpi-val">2 мин</span>
                <span className="il-kpi-label">от входа до заказа изделия</span>
              </motion.div>
              <motion.div className="il-kpi" variants={staggerChild}>
                <span className="il-kpi-val">24/7</span>
                <span className="il-kpi-label">витрина и кабинет заказов</span>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ── Лицензии ── */}
        <section className="il-section" id="license">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Документы и лицензии</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Работаем легально —<br /><span className="il-accent-text">можно проверить за 10 секунд</span></h2></Reveal>
            </div>
            <div className="il-license-grid">
              <Reveal delay={0.1} className="il-license-card">
                <span className="il-license-badge">Действующая</span>
                <h3 className="il-license-title">Лицензия на скупку драгоценных металлов</h3>
                <dl className="il-license-meta">
                  <div><dt>Номер</dt><dd>Л023-00119-77/04343605</dd></div>
                  <div><dt>Дата выдачи</dt><dd>11.02.2026</dd></div>
                  <div><dt>Выдана</dt><dd>Межрегиональное управление Федеральной пробирной палаты по ЦФО</dd></div>
                </dl>
                <p className="il-license-scope">
                  Скупка у физических лиц ювелирных и других изделий из драгоценных металлов и (или) драгоценных
                  камней, лома таких изделий, заготовка лома и отходов драгоценных металлов и продукции,
                  содержащей драгоценные металлы.
                </p>
                <a href="/docs/license-probpalata.pdf" target="_blank" rel="noopener noreferrer" className="il-license-link">
                  Открыть PDF лицензии <span aria-hidden>→</span>
                </a>
              </Reveal>
              <Reveal delay={0.16} className="il-license-card">
                <span className="il-license-badge il-license-badge--indigo">ГИИС ДМДК</span>
                <h3 className="il-license-title">Спецучёт участников рынка драгметаллов</h3>
                <dl className="il-license-meta">
                  <div><dt>Учётный номер</dt><dd>ЮЛ7701041176</dd></div>
                  <div><dt>Дата постановки</dt><dd>05.02.2026</dd></div>
                  <div><dt>Реестр</dt><dd>Государственная информационная система ГИИС ДМДК</dd></div>
                </dl>
                <p className="il-license-scope">
                  ООО «СЭТ» включено в реестр юридических лиц, индивидуальных предпринимателей и художников-ювелиров,
                  осуществляющих операции с драгоценными металлами и драгоценными камнями.
                </p>
                <a href="/docs/giis-dmdk-registration.pdf" target="_blank" rel="noopener noreferrer" className="il-license-link">
                  Открыть PDF уведомления <span aria-hidden>→</span>
                </a>
              </Reveal>
              <Reveal delay={0.22} className="il-license-qr-card">
                <a
                  href="https://knd.gov.ru/registry-entry?registryType=purchasePreciousMetals&id=698c2ad78212522cdf5de5c6"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="il-license-qr-link"
                  aria-label="Открыть карточку лицензии в реестре knd.gov.ru"
                >
                  <img src="/license-qr.png" alt="QR-код проверки лицензии в реестре knd.gov.ru" width="160" height="160" loading="lazy" />
                </a>
                <div className="il-license-qr-copy">
                  <span className="il-license-qr-label">Проверить лицензию онлайн</span>
                  <p className="il-license-qr-text">
                    Наведите камеру на QR или откройте ссылку — попадёте прямо на карточку нашей лицензии
                    в государственном реестре knd.gov.ru.
                  </p>
                  <a
                    href="https://knd.gov.ru/registry-entry?registryType=purchasePreciousMetals&id=698c2ad78212522cdf5de5c6"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="il-license-link"
                  >
                    Открыть реестр <span aria-hidden>→</span>
                  </a>
                </div>
              </Reveal>
            </div>
            <Reveal delay={0.28} className="il-license-company">
              <span>ООО «СЭТ»</span><i aria-hidden>·</i><span>ИНН 9710095927</span><i aria-hidden>·</i><span>ОГРН 1227700089627</span>
            </Reveal>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="il-section" id="faq">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Всё о продаже ювелирных изделий</span></Reveal>
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

        {/* ── Консультация ── */}
        <section className="il-section il-section--lead" id="consult">
          <div className="il-section-inner il-section-inner--narrow">
            <Reveal y={40}>
              <div className="il-lead-panel">
                <div className="il-lead-copy">
                  <span className="il-pill">Поддержка</span>
                  <h2 className="il-h2">У вас остались вопросы?</h2>
                  <p className="il-p">Оставьте заявку — и наши специалисты вас проконсультируют.</p>
                </div>
                <ConsultLeadForm />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Финальный CTA ── */}
        <section className="il-section il-section--cta">
          <div className="il-section-inner">
            <Reveal y={56}>
              <div className="il-cta-panel">
                <h2 className="il-cta-title">Выберите изделие сегодня —<br />это займёт две минуты</h2>
                <p className="il-cta-sub">Вход по номеру телефона. Оплата конкретного изделия с витрины.</p>
                <Magnetic>
                  <motion.a href="/kabinet" className="il-btn il-btn--inverse il-btn--lg" whileTap={{ scale: 0.96 }}>
                    Купить изделие
                    <span className="il-btn-arrow" aria-hidden>→</span>
                  </motion.a>
                </Magnetic>
              </div>
            </Reveal>
            <p className="il-disclaimer">
              Reaktivo продаёт конкретные ювелирные изделия с пробой, клеймом и биркой. Это не предложение банковского металла и не рекомендация по ценным бумагам.
            </p>
          </div>
        </section>
      </main>

      <footer className="il-footer">
        <div className="il-section-inner">
          <div className="il-footer-grid">
            <div className="il-footer-brand">
              <span className="il-logo il-logo--footer" aria-label="REAKTIVO.PRO">
                <img className="il-logo-mark" src="/logo-reaktivo-mark.svg" alt="" width="44" height="44" />
                <span className="il-logo-text">REAKTIVO<span>.PRO</span></span>
              </span>
              <p>Интернет-магазин ювелирных изделий.<br />Украшения из сети скупки с пробой, клеймом и биркой.</p>
            </div>
            <div className="il-footer-col">
              <span className="il-footer-col-title">Разделы</span>
              <a href="#shop" className="il-nav-link" onClick={(e) => goTo(e, '#shop')}>Витрина</a>
              <a href="#how" className="il-nav-link" onClick={(e) => goTo(e, '#how')}>Как это работает</a>
              <a href="#about" className="il-nav-link" onClick={(e) => goTo(e, '#about')}>О компании</a>
              <a href="#partners" className="il-nav-link" onClick={(e) => goTo(e, '#partners')}>Партнёрам</a>
              <a href="#license" className="il-nav-link" onClick={(e) => goTo(e, '#license')}>Документы и лицензии</a>
              <a href="#faq" className="il-nav-link" onClick={(e) => goTo(e, '#faq')}>Отвечаем честно</a>
              <a href="#contacts" className="il-nav-link" onClick={(e) => goTo(e, '#contacts')}>Контакты</a>
            </div>
            <div className="il-footer-col">
              <span className="il-footer-col-title">Продукты</span>
              <a href="https://reaktivo.ru" className="il-nav-link" target="_blank" rel="noopener noreferrer">Скупка изделий — Reaktivo.ru</a>
              <a href="/kabinet" className="il-nav-link">Витрина — кабинет</a>
              <a href="https://t.me/Reaktivoai" className="il-nav-link" target="_blank" rel="noopener noreferrer">Reaktivo Resale — Telegram</a>
            </div>
            <div className="il-footer-col" id="contacts">
              <span className="il-footer-col-title">Контакты</span>
              <a href="tel:+78005551848" className="il-nav-link">8 (800) 555-18-48</a>
              <a href="mailto:team@reaktivo.ru" className="il-nav-link">Team@reaktivo.ru</a>
              <a href="mailto:team@reaktivo.ru?subject=Партнёрство%20Reaktivo" className="il-nav-link">Стать партнёром</a>
              <a href="/pro" className="il-nav-link">Сотрудникам — вход</a>
            </div>
          </div>
          <div className="il-footer-bottom">
            <span>© {new Date().getFullYear()} REAKTIVO.PRO</span>
            <a href="/privacy" className="il-footer-privacy">Политика персональных данных</a>
            <span>ООО «СЭТ» · продажа ювелирных изделий</span>
          </div>
        </div>
      </footer>

      <style>{CSS}</style>
    </div>
  );
}

export const CSS = `
.il-root {
  min-height: 100dvh;
  background: var(--bg-deep);
  background-image: var(--bg-gradient);
  color: var(--text);
  font-family: var(--font-display);
  overflow-x: clip;
  -webkit-font-smoothing: antialiased;
}
.il-section-inner { max-width: 1360px; margin: 0 auto; padding: 0 28px; }
.il-section-inner--narrow { max-width: 960px; }
.il-accent-text { color: var(--accent); }
.il-gold-text {
  color: #e6b422;
  -webkit-text-fill-color: #e6b422;
  background: none;
}
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
  max-width: 1520px; margin: 0 auto; padding: 16px 28px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  min-width: 0; width: 100%; box-sizing: border-box;
}
.il-logo {
  display: inline-flex; align-items: center; gap: 12px;
  font-family: var(--font-brand);
  font-weight: 800; font-size: 1.2rem; letter-spacing: -0.01em;
  color: var(--text-strong); text-decoration: none; white-space: nowrap;
  flex-shrink: 0; min-width: 0; position: relative; z-index: 2;
}
.il-logo-mark {
  width: 40px; height: 40px; border-radius: 11px; object-fit: cover;
  box-shadow: 0 8px 24px -10px color-mix(in srgb, var(--accent) 70%, transparent);
  flex-shrink: 0;
}
.il-logo--footer .il-logo-mark { width: 44px; height: 44px; border-radius: 12px; }
.il-logo-text {
  display: inline-flex; align-items: baseline;
  font-family: var(--font-brand);
  color: var(--text-strong);
}
.il-logo-text > span { color: var(--accent); }
.il-nav { display: flex; gap: 14px; flex-wrap: nowrap; justify-content: center; flex: 1 1 auto; min-width: 0; }
.il-nav-link { position: relative; color: var(--text-muted); text-decoration: none; font-size: 0.86rem; font-weight: 600; transition: color 0.25s; padding: 4px 0; }
.il-nav-link::after {
  content: ''; position: absolute; left: 0; bottom: 0; width: 100%; height: 2px;
  background: var(--accent); border-radius: 2px;
  transform: scaleX(0); transform-origin: right; transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
.il-nav-link:hover { color: var(--text-strong); }
.il-nav-link:hover::after { transform: scaleX(1); transform-origin: left; }
.il-header-actions { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.il-btn--header-buy { padding: 11px 18px; font-size: 0.86rem; }
.il-header-phone {
  display: none; align-items: center; justify-content: center;
  width: 42px; height: 42px; border-radius: 12px;
  border: 1px solid var(--stroke); color: var(--text-strong);
  text-decoration: none; flex-shrink: 0;
  transition: border-color 0.2s, color 0.2s, background 0.2s;
}
.il-header-phone svg { width: 18px; height: 18px; }
.il-header-phone:hover {
  border-color: var(--accent); color: var(--accent);
  background: var(--accent-soft);
}
.il-menu-btn {
  display: none; width: 42px; height: 42px; border-radius: 12px;
  border: 1px solid var(--stroke); background: transparent; cursor: pointer;
  align-items: center; justify-content: center; flex-direction: column; gap: 5px; padding: 0;
}
.il-menu-btn span {
  display: block; width: 16px; height: 2px; border-radius: 2px; background: var(--text-strong);
  transition: transform 0.25s ease, opacity 0.2s;
}
.il-menu-btn.is-open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
.il-menu-btn.is-open span:nth-child(2) { opacity: 0; }
.il-menu-btn.is-open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
.il-menu {
  position: fixed; inset: 0; z-index: 60; display: flex; align-items: flex-start; justify-content: center;
  padding: 72px 16px 24px;
}
.il-menu-backdrop {
  position: absolute; inset: 0; border: none; cursor: pointer;
  background: color-mix(in srgb, var(--bg-deep) 55%, transparent);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
.il-menu-sheet {
  position: relative; z-index: 1; width: min(420px, 100%);
  background: var(--bg-panel-solid); border: 1px solid var(--stroke); border-radius: 22px;
  padding: 18px 18px 22px; box-shadow: 0 30px 70px -30px rgba(0,0,0,0.5);
  display: flex; flex-direction: column; gap: 18px; max-height: calc(100dvh - 96px); overflow: auto;
}
.il-menu-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.il-menu-close {
  width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--stroke);
  background: transparent; color: var(--text-strong); font-size: 1.5rem; line-height: 1; cursor: pointer;
}
.il-menu-nav { display: flex; flex-direction: column; gap: 4px; }
.il-menu-nav a {
  display: block; text-decoration: none; color: var(--text-strong); font-weight: 700; font-size: 1.05rem;
  padding: 12px 10px; border-radius: 12px; transition: background 0.2s;
}
.il-menu-nav a:hover { background: var(--accent-soft); color: var(--accent); }
.il-menu-actions { display: flex; flex-direction: column; gap: 10px; }
.il-menu-actions .il-btn { width: 100%; }
.il-menu-contacts {
  border-top: 1px solid var(--stroke-soft); padding-top: 16px;
  display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center;
}
.il-menu-phone {
  font-size: 1.2rem; font-weight: 800; color: var(--text-strong); text-decoration: none;
  letter-spacing: -0.02em; font-variant-numeric: tabular-nums;
}
.il-menu-phone:hover { color: var(--accent); }
.il-menu-mail { font-size: 0.88rem; font-weight: 600; color: var(--text-muted); text-decoration: none; }
.il-menu-mail:hover { color: var(--accent); }

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
  box-shadow: 0 10px 28px -12px color-mix(in srgb, var(--accent) 42%, transparent);
}
.il-btn--primary::after {
  content: ''; position: absolute; top: 0; left: -70%; width: 42%; height: 100%;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,0.28), transparent);
  transform: skewX(-18deg); transition: left 0.7s cubic-bezier(0.22,1,0.36,1);
}
.il-btn--primary:hover { box-shadow: 0 16px 40px -14px color-mix(in srgb, var(--accent) 52%, transparent); }
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

/* ── СБП бейдж (официальный логотип) ── */
.il-sbp {
  display: inline-flex; align-items: center; justify-content: center;
  vertical-align: -0.3em; line-height: 0;
  background: #fff;
  border-radius: 0.42em;
  padding: 0.16em 0.34em;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}
.il-sbp-logo { height: 1.55em; width: auto; display: block; }
.il-sbp--inline { margin: 0 0.16em; vertical-align: -0.34em; }
.il-sbp--inline .il-sbp-logo { height: 1.55em; }
.il-sbp--compact .il-sbp-logo { height: 1.3em; }
.il-sbp--heading { margin: 0 0.12em; vertical-align: -0.14em; }
.il-sbp--heading .il-sbp-logo { height: clamp(1.05em, 0.72em + 1.1vw, 1.55em); }
.il-sbp-method { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; }
.il-card-row .il-sbp-logo,
.il-sbp-sheet-head .il-sbp-logo { height: 26px; }
.il-preview-chip .il-sbp-logo { height: 20px; }

/* ── Hero ── */
.il-hero { position: relative; padding: 150px 28px 100px; overflow: clip; }
.il-hero-bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.il-hero-orb {
  position: absolute; border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 36%, transparent), transparent 66%);
}
.il-hero-orb--1 { width: 560px; height: 560px; top: -220px; right: -150px; opacity: 0.18; }
.il-hero-orb--2 { width: 420px; height: 420px; bottom: -200px; left: -130px; opacity: 0.12; }
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
  position: relative; z-index: 2; max-width: 1360px; margin: 0 auto;
  display: grid; grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.88fr);
  gap: 64px; align-items: center;
  min-width: 0; width: 100%;
}
.il-hero-copy { min-width: 0; max-width: 100%; }
.il-badge {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 0.74rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--text-strong); background: var(--accent-soft);
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
  overflow-wrap: break-word;
  max-width: 100%;
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
.il-card-brand { font-family: var(--font-brand); font-weight: 800; font-size: 0.84rem; letter-spacing: 0.02em; color: var(--text-strong); }
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
.il-section-head { text-align: center; max-width: 820px; margin: 0 auto 56px; }
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
.il-preview-perspective { position: relative; perspective: 1400px; max-width: 1120px; margin: 0 auto; }
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
  display: inline-flex; align-items: center; gap: 6px;
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
  max-width: 1040px; margin: 0 auto; text-align: center;
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
.il-market-mult-pct {
  font-size: clamp(1rem, 1.6vw, 1.2rem); color: var(--text-muted); font-weight: 700;
  letter-spacing: -0.01em; margin-top: 6px;
}
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
.il-market-chip--cta {
  text-decoration: none;
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
  padding: 11px 20px;
  font-size: 0.88rem; font-weight: 800;
  box-shadow: 0 10px 28px -12px color-mix(in srgb, var(--accent) 70%, transparent);
  transition: background 0.25s, box-shadow 0.25s, transform 0.25s;
}
.il-market-chip--cta:hover {
  background: color-mix(in srgb, var(--accent) 88%, #000);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 14px 36px -12px color-mix(in srgb, var(--accent) 80%, transparent);
  transform: translateY(-1px);
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
  color: var(--text-strong); background: var(--accent-soft);
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
  background: var(--accent-soft); color: var(--text-strong); margin-bottom: 18px;
}
.il-card-icon svg { width: 24px; height: 24px; }
.il-card-title { font-size: 1.04rem; font-weight: 800; margin: 0 0 9px; color: var(--text-strong); letter-spacing: -0.01em; }
.il-card-text { font-size: 0.89rem; line-height: 1.6; color: var(--text-muted); margin: 0; }

/* ── Витрина ── */
.il-vitrine-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}
.il-vitrine-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 16px 16px;
  border-radius: 18px;
  border: 1px solid var(--stroke);
  background: var(--bg-panel-solid);
  color: inherit;
  text-decoration: none;
  min-height: 220px;
  transition: border-color 0.3s ease, transform 0.3s ease, box-shadow 0.3s ease;
}
.il-vitrine-card:hover {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--stroke));
  transform: translateY(-4px);
  box-shadow: 0 20px 40px -28px color-mix(in srgb, var(--accent) 40%, transparent);
}
.il-vitrine-card-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.il-vitrine-kind {
  font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--text-dim);
}
.il-vitrine-assay {
  font-size: 0.78rem; font-weight: 800; color: var(--accent);
}
.il-vitrine-title { margin: 4px 0 0; font-size: 1.02rem; font-weight: 800; letter-spacing: -0.02em; color: var(--text-strong); }
.il-vitrine-meta { margin: 0; font-size: 0.82rem; color: var(--text-muted); }
.il-vitrine-origin { margin: 0; font-size: 0.78rem; line-height: 1.45; color: var(--text-dim); flex: 1; }
.il-vitrine-foot {
  display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-top: 8px;
}
.il-vitrine-foot strong { font-size: 1.05rem; font-weight: 800; color: var(--text-strong); font-variant-numeric: tabular-nums; }
.il-vitrine-foot span { font-size: 0.78rem; font-weight: 700; color: var(--accent); }
.il-vitrine-card--soon {
  pointer-events: none;
  cursor: default;
  opacity: 0.7;
  border-style: dashed;
  background: color-mix(in srgb, var(--bg-panel-solid) 82%, transparent);
}
.il-vitrine-card--soon:hover {
  transform: none;
  box-shadow: none;
  border-color: var(--stroke);
}

/* ── О компании ── */
.il-about-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  grid-template-rows: auto minmax(200px, 1fr);
  gap: 20px 40px;
  align-items: stretch;
}
.il-about-text { grid-column: 1; grid-row: 1; }
.il-about-photo { grid-column: 1; grid-row: 2; min-height: 0; height: 100%; }
.il-about-text p { margin: 0 0 16px; font-size: 1rem; line-height: 1.75; color: var(--text-muted); }
.il-about-text p:last-child { margin-bottom: 0; }
.il-about-photo-btn {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  min-height: 240px;
  aspect-ratio: 16 / 9;
  padding: 0;
  margin: 0;
  border: 1px solid var(--stroke);
  border-radius: 18px;
  overflow: hidden;
  background: var(--bg-panel-solid);
  cursor: zoom-in;
  -webkit-tap-highlight-color: transparent;
}
.il-about-photo-btn img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
  transition: transform 0.45s cubic-bezier(0.22,1,0.36,1);
}
.il-about-photo-btn:hover img,
.il-about-photo-btn:focus-visible img {
  transform: scale(1.03);
}
.il-about-mosaic-zoom {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 1;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: rgba(0,0,0,0.45);
  color: #fff;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
}
.il-about-photo-btn:hover .il-about-mosaic-zoom,
.il-about-photo-btn:focus-visible .il-about-mosaic-zoom {
  opacity: 1;
}
html.il-lb-open,
html.il-lb-open body {
  overflow: hidden !important;
  overscroll-behavior: none;
  touch-action: none;
}
.il-lb {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 28px 16px 40px;
  overscroll-behavior: none;
  touch-action: none;
}
.il-lb-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  padding: 0;
  margin: 0;
  background: rgba(0,0,0,0.82);
  cursor: pointer;
}
.il-lb-figure {
  position: relative;
  z-index: 1;
  margin: 0;
  max-width: min(1100px, 100%);
  max-height: min(82vh, 900px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.il-lb-figure img {
  display: block;
  max-width: 100%;
  max-height: min(74vh, 820px);
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 14px;
  box-shadow: 0 28px 80px rgba(0,0,0,0.45);
}
.il-lb-figure figcaption {
  display: flex;
  gap: 16px;
  align-items: baseline;
  justify-content: space-between;
  width: 100%;
  max-width: 720px;
  color: rgba(255,255,255,0.82);
  font-size: 0.92rem;
}
.il-lb-figure figcaption span {
  color: rgba(255,255,255,0.5);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.il-lb-close,
.il-lb-nav {
  position: absolute;
  z-index: 2;
  border: 0;
  background: rgba(255,255,255,0.12);
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: background 0.2s ease;
}
.il-lb-close:hover,
.il-lb-nav:hover {
  background: rgba(255,255,255,0.22);
}
.il-lb-close {
  top: 18px;
  right: 18px;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  font-size: 28px;
  line-height: 1;
}
.il-lb-nav {
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 64px;
  border-radius: 14px;
  font-size: 36px;
  line-height: 1;
  display: grid;
  place-items: center;
}
.il-lb-nav--prev { left: 16px; }
.il-lb-nav--next { right: 16px; }
.il-products {
  grid-column: 2; grid-row: 1 / -1;
  display: flex; flex-direction: column; gap: 12px;
  height: 100%; min-height: 0;
}
.il-product {
  flex: 1 1 0;
  display: flex; flex-direction: column; justify-content: center;
  text-decoration: none;
  border: none; border-radius: 22px; padding: 22px 24px;
  color: #fff;
  background:
    radial-gradient(circle at 12% -20%, rgba(255,255,255,0.16), transparent 42%),
    radial-gradient(circle at 100% 120%, rgba(255,255,255,0.08), transparent 48%),
    linear-gradient(140deg, color-mix(in srgb, var(--accent) 88%, #1a0505), color-mix(in srgb, var(--accent) 46%, #000));
  box-shadow: 0 22px 48px -28px color-mix(in srgb, var(--accent) 38%, transparent);
  transition: transform 0.3s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s ease, filter 0.3s ease;
  min-height: 0;
}
.il-product:hover {
  filter: brightness(1.04);
  box-shadow: 0 26px 52px -24px color-mix(in srgb, var(--accent) 48%, transparent);
}
.il-product--main {
  outline: 2px solid rgba(255,255,255,0.22);
  outline-offset: 0;
  box-shadow: 0 26px 56px -24px color-mix(in srgb, var(--accent) 46%, transparent);
}
.il-product-tag {
  font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em;
  color: rgba(255,255,255,0.78);
}
.il-product-title {
  font-size: clamp(1.35rem, 2.1vw, 1.7rem); font-weight: 800; color: #fff;
  margin: 10px 0 10px; letter-spacing: -0.025em; line-height: 1.15;
}
.il-product-text {
  font-size: 0.88rem; line-height: 1.55; color: rgba(255,255,255,0.84); margin: 0 0 14px;
}
.il-product-link {
  display: inline-flex; align-items: center; align-self: flex-start;
  margin-top: auto;
  font-size: 0.84rem; font-weight: 800; color: var(--accent);
  background: #fff; border-radius: 100px; padding: 10px 16px;
  box-shadow: 0 8px 22px -10px rgba(0,0,0,0.35);
}
.il-product-link--dim { color: var(--text-dim); }

/* ── Партнёры ── */
.il-partner-banner {
  display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.7fr);
  gap: 36px; align-items: center;
  padding: clamp(28px, 5vw, 52px);
  border-radius: 28px; border: 1px solid var(--stroke);
  background: linear-gradient(135deg, var(--accent-soft), var(--bg-panel-solid) 48%, var(--bg-panel-solid));
  box-shadow: 0 30px 70px -48px color-mix(in srgb, var(--accent) 40%, transparent);
  overflow: hidden; min-width: 0;
}
.il-partner-copy { min-width: 0; }
.il-partner-title {
  font-size: clamp(1.55rem, 3.2vw, 2.4rem); font-weight: 800; letter-spacing: -0.03em;
  line-height: 1.2; color: var(--text-strong); margin: 14px 0 14px;
}
.il-partner-text { margin: 0 0 26px; font-size: 1.02rem; line-height: 1.65; color: var(--text-muted); max-width: 520px; }
.il-partner-actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; min-width: 0; }
.il-partner-actions .il-magnetic { max-width: 100%; }
.il-partner-actions .il-btn { max-width: 100%; }
.il-partner-aside { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; }
.il-partner-mark {
  width: clamp(140px, 14vw, 180px); height: clamp(140px, 14vw, 180px);
  border-radius: 36px; overflow: hidden;
  box-shadow: 0 24px 56px -18px color-mix(in srgb, var(--accent) 70%, transparent);
}
.il-partner-mark img { width: 100%; height: 100%; object-fit: cover; display: block; }
.il-partner-aside-label {
  font-size: 0.9rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-dim);
}

/* ── Цифры ── */
.il-section--kpi { padding: 84px 0; }
.il-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; text-align: center; }
.il-kpi { display: flex; flex-direction: column; gap: 8px; padding: 28px 14px; border-radius: 20px; border: 1px solid var(--stroke-soft); background: transparent; }
.il-kpi-val { font-size: clamp(2.3rem, 4.2vw, 3.3rem); font-weight: 800; letter-spacing: -0.03em; color: var(--text-strong); font-variant-numeric: tabular-nums; }
.il-kpi-label { font-size: 0.84rem; color: var(--text-strong); font-weight: 600; opacity: 0.72; }

/* ── Заявка на консультацию ── */
.il-lead-panel {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 0.9fr);
  gap: 36px; align-items: center;
  padding: clamp(28px, 4vw, 44px);
  border-radius: 28px; border: 1px solid var(--stroke);
  background:
    radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 48%),
    var(--bg-panel-solid);
  box-shadow: 0 28px 70px -48px color-mix(in srgb, var(--accent) 35%, transparent);
}
.il-lead-copy .il-h2 { margin: 12px 0 10px; }
.il-lead-copy .il-p { margin: 0; max-width: 420px; }
.il-lead-form { display: grid; gap: 12px; }
.il-lead-field {
  display: grid; gap: 6px;
  font-size: 0.78rem; font-weight: 700; color: var(--text-dim);
}
.il-lead-field input {
  width: 100%; box-sizing: border-box;
  border: 1px solid var(--stroke); border-radius: 14px;
  background: var(--bg); color: var(--text-strong);
  padding: 13px 14px; font: inherit; font-size: 0.95rem; font-weight: 600;
  outline: none; transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.il-lead-field input:focus {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--stroke));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}
.il-lead-form .il-btn { width: 100%; justify-content: center; margin-top: 4px; }
.il-lead-consent {
  display: flex; align-items: flex-start; gap: 10px;
  font-size: 0.8rem; line-height: 1.45; color: var(--text-muted); cursor: pointer;
  margin: 2px 0 0;
}
.il-lead-consent input {
  width: 18px; height: 18px; margin: 1px 0 0; flex-shrink: 0;
  accent-color: var(--accent); cursor: pointer;
}
.il-lead-consent a { color: var(--accent); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
.il-lead-consent a:hover { opacity: 0.85; }
.il-lead-err { margin: 0; font-size: 0.84rem; color: var(--accent); font-weight: 600; }
.il-lead-ok { margin: 0; font-size: 0.84rem; color: var(--emerald); font-weight: 600; }

/* ── Лицензии ── */
.il-license-grid {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(240px, 0.82fr);
  gap: 20px; align-items: stretch;
}
.il-license-card, .il-license-qr-card {
  display: flex; flex-direction: column;
  border-radius: 22px; border: 1px solid var(--stroke);
  background: var(--bg-panel-solid);
  padding: 26px 26px 24px;
}
.il-license-badge {
  align-self: flex-start;
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 0.7rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--emerald); background: var(--emerald-soft);
  border: 1px solid color-mix(in srgb, var(--emerald) 30%, transparent);
  padding: 5px 12px; border-radius: 100px; margin-bottom: 14px;
}
.il-license-badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--emerald); flex-shrink: 0; }
.il-license-badge--indigo {
  color: var(--text-strong); background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
}
.il-license-badge--indigo::before { background: var(--accent); }
.il-license-title { font-size: 1.08rem; font-weight: 800; letter-spacing: -0.01em; color: var(--text-strong); margin: 0 0 16px; line-height: 1.35; }
.il-license-meta { display: flex; flex-direction: column; gap: 9px; margin: 0 0 16px; }
.il-license-meta > div { display: flex; justify-content: space-between; gap: 14px; padding-bottom: 9px; border-bottom: 1px dashed var(--stroke); font-size: 0.86rem; }
.il-license-meta dt { color: var(--text-dim); font-weight: 600; flex-shrink: 0; }
.il-license-meta dd { margin: 0; color: var(--text-strong); font-weight: 700; text-align: right; }
.il-license-scope { flex: 1; font-size: 0.86rem; line-height: 1.6; color: var(--text-muted); margin: 0 0 20px; }
.il-license-link {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 0.86rem; font-weight: 700; color: var(--accent); text-decoration: none;
  margin-top: auto;
}
.il-license-link span { transition: transform 0.2s; }
.il-license-link:hover span { transform: translateX(3px); }
.il-license-qr-card { align-items: center; text-align: center; gap: 6px; background: linear-gradient(160deg, var(--accent-soft), var(--bg-panel-solid) 55%); }
.il-license-qr-link {
  display: block; padding: 10px; border-radius: 16px; background: #fff;
  box-shadow: 0 12px 30px -16px color-mix(in srgb, var(--accent) 55%, transparent);
  transition: transform 0.2s;
}
.il-license-qr-link:hover { transform: translateY(-2px) scale(1.02); }
.il-license-qr-link img { display: block; width: 130px; height: 130px; border-radius: 6px; }
.il-license-qr-copy { display: flex; flex-direction: column; align-items: center; }
.il-license-qr-label { font-size: 0.94rem; font-weight: 800; color: var(--text-strong); margin-top: 14px; }
.il-license-qr-text { font-size: 0.82rem; line-height: 1.55; color: var(--text-muted); margin: 8px 0 16px; }
.il-license-company {
  display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap;
  margin-top: 28px; font-size: 0.82rem; font-weight: 600; color: var(--text-dim);
}
.il-license-company i { font-style: normal; opacity: 0.5; }

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
.il-footer-privacy { color: var(--text-dim); text-decoration: underline; text-underline-offset: 2px; font-weight: 600; }
.il-footer-privacy:hover { color: var(--accent); }
.il-nav-link--dim { color: var(--text-dim); font-weight: 500; }

/* ── Адаптив ── */
@media (max-width: 1180px) {
  .il-hero-inner { grid-template-columns: 1fr; gap: 52px; }
  .il-deck-wrap { max-width: 500px; margin: 0 auto; width: 100%; }
  .il-market-grid { grid-template-columns: 1fr; gap: 40px; }
  .il-sbp-grid { grid-template-columns: 1fr; gap: 44px; }
  .il-about-grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto;
    gap: 28px;
  }
  .il-about-text,
  .il-about-photo,
  .il-products { grid-column: 1; grid-row: auto; height: auto; }
  .il-about-photo { min-height: 0; order: 3; }
  .il-about-photo-btn {
    aspect-ratio: 16 / 9;
    min-height: 0;
  }
  .il-lb-nav { width: 40px; height: 52px; font-size: 30px; }
  .il-lb-nav--prev { left: 8px; }
  .il-lb-nav--next { right: 8px; }
  .il-lb-close { top: 12px; right: 12px; }
  .il-products { order: 2; }
  .il-product { flex: none; }
  .il-partner-banner { grid-template-columns: 1fr; gap: 28px; text-align: left; padding: 26px 20px; }
  .il-partner-aside { display: none; }
  .il-partner-actions { flex-direction: column; align-items: stretch; }
  .il-partner-actions .il-magnetic { display: block; width: 100%; }
  .il-partner-actions .il-btn { width: 100%; box-sizing: border-box; }
  .il-lead-panel { grid-template-columns: 1fr; gap: 22px; }
  .il-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .il-step-line { display: none; }
  .il-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .il-vitrine-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .il-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .il-license-grid { grid-template-columns: 1fr 1fr; }
  .il-license-qr-card { grid-column: 1 / -1; flex-direction: row; text-align: left; align-items: center; gap: 22px; }
  .il-license-qr-link { flex-shrink: 0; }
  .il-license-qr-copy { align-items: flex-start; }
  .il-license-qr-label { margin-top: 0; }
  .il-footer-grid { grid-template-columns: 1fr 1fr; }
  .il-preview-chip--1 { left: 8px; }
  .il-preview-chip--2 { right: 8px; }
}
@media (max-width: 1440px) {
  .il-nav { gap: 10px; }
  .il-nav-link { font-size: 0.8rem; }
  .il-header-inner { gap: 12px; padding: 14px 22px; }
}
@media (min-width: 1280px) {
  .il-header-phone { display: flex; }
}
@media (max-width: 1279px) {
  .il-nav { display: none; }
  .il-menu-btn { display: inline-flex; }
  .il-header-phone { display: none !important; }
  .il-hero-word-clip { overflow: visible; }
}
@media (max-width: 900px) {
  .il-btn--header-buy { display: none; }
}
@media (max-width: 720px) {
  .il-btn--header-login { display: none; }
  .il-hero { padding: 118px 20px 64px; }
  .il-hero-title { font-size: clamp(2.1rem, 9.4vw, 2.7rem); }
  .il-hero-stats { gap: 18px; }
  .il-hero-stat-sep { display: none; }
  .il-hero-stat-val { font-size: 1.6rem; }
  .il-section { padding: 68px 0; }
  .il-section-inner { padding: 0 18px; }
  .il-section-head { margin-bottom: 38px; }
  .il-partner-banner { padding: 22px 16px; }
  .il-partner-title { font-size: clamp(1.4rem, 7vw, 1.85rem); margin: 12px 0 12px; }
  .il-deck { height: 400px; }
  .il-deck-card { width: calc(100% - 52px); height: calc(100% - 66px); padding: 22px 22px 16px; }
  .il-card-big { font-size: 2rem; }
  .il-statement { padding: 84px 0 70px; }
  .il-steps { grid-template-columns: 1fr; }
  .il-cards { grid-template-columns: 1fr; }
  .il-vitrine-grid { grid-template-columns: 1fr; }
  .il-sbp-mini { right: 0; bottom: -20px; }
  .il-preview-body { grid-template-columns: 1fr; }
  .il-preview-side { display: none; }
  .il-preview-kpis { grid-template-columns: 1fr 1fr; }
  .il-cta-panel { padding: 56px 22px; }
  .il-license-grid { grid-template-columns: 1fr; }
  .il-license-qr-card { flex-direction: column; text-align: center; align-items: center; }
  .il-license-qr-copy { align-items: center; }
  .il-license-qr-label { margin-top: 14px; }
  .il-footer-grid { grid-template-columns: 1fr; gap: 26px; }
  .il-footer-bottom { flex-direction: column; align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) {
  .il-marquee-track { animation: none; }
  .il-cursor-glow { display: none; }
}
`;
