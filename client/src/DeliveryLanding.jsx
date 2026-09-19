import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useScroll } from 'motion/react';
import { clientApi } from './api.js';
import { quotePerGram, quotePayout } from './calc.js';
import {
  CSS as IL_CSS,
  Magnetic,
  Reveal,
  staggerChild,
  staggerParent,
} from './InvestLanding.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import {
  RL_CSS,
  RuAtmosphere,
  RuCtaPanel,
  RuFaq,
  RuFullHero,
  RuGoldTicker,
  RuKpis,
  RuLeadForm,
  RuMarquee,
  RuSbpBadge,
  RuStatement,
  RuThemedImg,
  formatMoney,
  isRuPhone,
  useAnimatedNumber,
} from './ru/RuShared.jsx';
import { pickNextCourierSlot } from './ru/kurierSlots.js';
import { useToast } from './ToastContext.jsx';
import { ymReachGoal } from './yandexMetrika.js';

const PROBES = [585, 750, 999];
const WEIGHT_CHIPS = [5, 10, 20, 50];
const LOCK_MS = 15 * 60 * 1000;

const STEPS = [
  { n: '01', title: 'Заявка', text: 'Считаете сумму на сайте, фиксируете курс на 15 минут и вызываете курьера — без поездки в отделение.' },
  { n: '02', title: 'Курьер', text: 'Красная сумка едет к вам. Проверка пробы и веса — при вас, дома или в офисе.' },
  { n: '03', title: 'Проверка', text: 'Реактив и, если нужно, спектр. Вы видите тот же результат, что и эксперт.' },
  { n: '04', title: 'Деньги', text: 'Выплата сразу: наличные или СБП. Золото становится деньгами, не выходя из дома.' },
];

const TRACK = [
  { title: 'Принята', text: 'Заявка у координатора, курьер назначается.' },
  { title: 'Курьер выехал', text: 'Красная сумка уже в пути к вам.' },
  { title: 'На месте', text: 'Проба и вес определяются при вас.' },
  { title: 'Деньги у вас', text: 'Наличные или СБП — сразу после оценки.' },
];

const EVOLUTION = [
  { n: '01', title: 'Живой курс на первом экране', text: 'Цифра офиса тикает сразу в пробах 585, 750 и 999 — не «перезвоним и оценим».' },
  { n: '02', title: 'Фиксация на 15 минут', text: 'Нажали «вызвать» — сумму держим, пока вводите город, адрес и телефон.' },
  { n: '03', title: 'Выплата дома', text: 'Наличные или СБП при вас. Паспорт нужен по закону, не «для галочки».' },
];

const STORIES = [
  { k: '90 минут', t: 'Заявка утром — деньги в тот же визит', d: 'Без поездки в отделение: курьер приезжает, проверяет пробу при вас и платит сразу.' },
  { k: 'При вас', t: 'Проба на столе, не «в лаборатории»', d: 'Реактив и, если нужно, спектр. Вы видите тот же результат, что и эксперт.' },
  { k: 'Один курс', t: 'Сайт, курьер и офис считают одинаково', d: 'Зафиксировали сумму на сайте — это та выплата, которую привезёт курьер.' },
];

const COMPARE = [
  {
    title: 'Курьер домой',
    on: true,
    points: ['Никуда не едете', 'Курс тот же, что на сайте', 'Проверка и выплата при вас', 'Вызов бесплатный в зоне'],
  },
  {
    title: 'Отделение',
    on: false,
    points: ['Курс точно такой же', 'Можно прийти без записи', 'Подходит, если офис рядом', 'Те же лицензия и паспорт'],
  },
];

const FAQ = [
  { q: 'Курьер правда бесплатный?', a: 'Да. За выезд в зоне Москва и МО вы ничего не платите — ни за дорогу, ни «за оценку».' },
  { q: 'Это та сумма, которую я увижу дома?', a: 'Да, если проба и вес совпали с тем, что вы указали. Мы фиксируем курс на 15 минут. Точная выплата — после проверки при вас.' },
  { q: 'Что если клеймо стёрлось?', a: 'Проба определяется реактивом и, если нужно, спектром. Всё при вас. Из-за состояния изделия мы ничего не вычитаем.' },
  { q: 'Нужен ли паспорт?', a: 'Да — это требование закона к сделке скупки, а не проверка, откуда вещь. Без паспорта сделку оформить нельзя.' },
  { q: 'Что если я передумаю?', a: 'Продажа не обязательна. Можно отказаться на месте или перенести визит — это бесплатно.' },
  { q: 'А если я не в Москве?', a: 'Оставьте город в листе ожидания внизу страницы — так мы видим, куда везти доставку и агентов дальше.' },
];

const DESK_PATH = 'M48 132 C 150 36, 250 188, 340 96 S 500 28, 592 140';
const MOB_PATH = 'M40 18 C 18 70, 62 110, 40 150 S 18 210, 40 258';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function formatPerGram(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n)} ₽/г`;
}

function formatTimer(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function useLockCountdown(lockedUntil) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lockedUntil) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [lockedUntil]);
  if (!lockedUntil) return 0;
  return Math.max(0, lockedUntil - Date.now());
}

function useDeliveryQuote() {
  const [quote, setQuote] = useState(null);
  const [status, setStatus] = useState('loading');
  const quoteRef = useRef(null);

  const load = useCallback(async () => {
    if (!quoteRef.current) setStatus('loading');
    try {
      const q = await clientApi.buybackQuote('moex');
      if (q && Number(q.goldRubPerGram) > 0) {
        quoteRef.current = q;
        setQuote(q);
        setStatus('ready');
        return;
      }
      if (!quoteRef.current) setStatus('error');
    } catch {
      if (!quoteRef.current) setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  return { quote, status, reload: load };
}

function useHeaderScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return scrolled;
}

function Skel({ wide }) {
  return <span className={`dl2-skel${wide ? ' dl2-skel--wide' : ''}`} aria-hidden />;
}

function FieldError({ id, message }) {
  if (!message) return null;
  return <p className="il-lead-err" id={id} role="alert">{message}</p>;
}

function paintPath(pathEl, bagEl, progress, reduced) {
  if (!pathEl || !bagEl) return;
  const len = pathEl.getTotalLength();
  if (!Number.isFinite(len) || len <= 0) return;
  const raw = reduced ? 0.999 : Math.min(0.999, Math.max(0, progress));
  const t = reduced ? 0.999 : Math.max(0.02, raw);
  pathEl.style.strokeDasharray = String(len);
  pathEl.style.strokeDashoffset = reduced ? '0' : String(len * (1 - t));
  const p = pathEl.getPointAtLength(t * len);
  const tilt = reduced ? 0 : Math.sin(raw * Math.PI * 2) * 10;
  const scale = reduced ? 1 : 1 + Math.sin(raw * Math.PI) * 0.14;
  bagEl.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${tilt}) scale(${scale})`);
}

function PathStory() {
  const pinRef = useRef(null);
  const pathRef = useRef(null);
  const bagRef = useRef(null);
  const latestV = useRef(0);
  const rafRef = useRef(0);
  const [step, setStep] = useState(0);
  const [stops, setStops] = useState([]);
  const [reduced, setReduced] = useState(false);
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const { scrollYProgress } = useScroll({
    target: pinRef,
    offset: ['start 0.82', 'end 0.28'],
  });

  useEffect(() => {
    setReduced(prefersReducedMotion());
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const layoutPath = useCallback(() => {
    const path = pathRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    if (!Number.isFinite(len) || len <= 0) return;
    setStops([0.02, 0.34, 0.66, 0.98].map((t) => {
      const p = path.getPointAtLength(t * len);
      return { x: p.x, y: p.y };
    }));
    paintPath(path, bagRef.current, reduced ? 1 : latestV.current, reduced);
  }, [reduced]);

  useEffect(() => {
    layoutPath();
    const route = pathRef.current?.ownerSVGElement;
    if (!route || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => layoutPath());
    ro.observe(route);
    return () => ro.disconnect();
  }, [layoutPath, mobile]);

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    latestV.current = v;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const cur = latestV.current;
      const idx = cur < 0.22 ? 0 : cur < 0.48 ? 1 : cur < 0.74 ? 2 : 3;
      setStep((s) => (s === idx ? s : idx));
      if (!reduced) paintPath(pathRef.current, bagRef.current, cur, false);
    });
  });

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const copy = STEPS[reduced ? 3 : step];
  const d = mobile ? MOB_PATH : DESK_PATH;
  const viewBox = mobile ? '0 0 80 280' : '0 0 640 180';

  return (
    <section className={`dl2-path${reduced ? ' dl2-path--static' : ''}`} ref={pinRef} id="steps" aria-label="Путь красного R">
      <div className="dl2-path-sticky">
        <div className="dl2-path-inner">
          <div className="dl2-path-copy">
            <span className="il-pill">Путь красного R</span>
            <p className="dl2-path-idx mono-nums">{copy.n} / 04</p>
            <h2 className="dl2-path-title">{copy.title}</h2>
            <p className="dl2-path-text">{copy.text}</p>
            <a href="#order" className="il-btn il-btn--primary">Вызвать курьера</a>
          </div>

          <div className="dl2-route">
            <svg className="dl2-route-svg" viewBox={viewBox} fill="none" aria-hidden>
              <path className="dl2-route-ghost" d={d} strokeWidth={mobile ? 3 : 3.5} strokeDasharray="6 9" strokeLinecap="round" />
              <path ref={pathRef} className="dl2-route-draw" d={d} strokeWidth={mobile ? 3.6 : 4.2} strokeLinecap="round" />
              {stops.map((p, i) => (
                <g key={STEPS[i].title}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={reduced || i <= step ? 8 : 5.5}
                    fill={reduced || i <= step ? 'var(--accent)' : 'var(--bg-panel-solid)'}
                    stroke="var(--text-strong)"
                    strokeWidth="1.6"
                  />
                  {!mobile && (
                    <text className={`dl2-stop-label${reduced || i <= step ? ' is-on' : ''}`} x={p.x} y={p.y + 26} textAnchor="middle" fontSize="12" fontWeight="700">{STEPS[i].title}</text>
                  )}
                </g>
              ))}
              <g ref={bagRef}>
                <circle r="22" fill="rgba(220,42,46,0.22)" />
                <image href="/logo-reaktivo-mark-128.png" x="-15" y="-15" width="30" height="30" />
              </g>
            </svg>
          </div>

          <ol className="dl2-progress" aria-label="Этапы доставки">
            {STEPS.map((s, i) => (
              <li key={s.title} className={reduced || i <= step ? 'is-on' : ''}>
                <i />
                <span>{s.title}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function DemoTracker({ freezeAt }) {
  const [idx, setIdx] = useState(freezeAt ?? 0);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (freezeAt != null) {
      setIdx(freezeAt);
      return undefined;
    }
    if (reduced) {
      setIdx(3);
      return undefined;
    }
    const id = setInterval(() => setIdx((n) => (n + 1) % TRACK.length), 2400);
    return () => clearInterval(id);
  }, [freezeAt, reduced]);

  return (
    <div className="dl2-track" aria-label="Демо-трекер заказа">
      {TRACK.map((s, i) => (
        <button
          key={s.title}
          type="button"
          className={`dl2-track-step${i <= idx ? ' is-on' : ''}${i === idx ? ' is-now' : ''}`}
          onClick={() => freezeAt == null && setIdx(i)}
        >
          <b>{String(i + 1).padStart(2, '0')}</b>
          <span>{s.title}</span>
          <em>{s.text}</em>
        </button>
      ))}
    </div>
  );
}

function moscowHour(d) {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(d);
  return Number(hour);
}

function DutyBar() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const onDuty = (() => {
    const h = moscowHour(now);
    return h >= 9 && h < 21;
  })();
  const time = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
  return (
    <div className="dl2-duty" role="status">
      <span className={`dl2-duty-dot${onDuty ? ' is-on' : ''}`} aria-hidden />
      <b>{onDuty ? 'Курьеры на линии' : 'Заявки принимаем — перезвоним утром'}</b>
      <span>Москва {time}</span>
      <span>Вызов 0 ₽</span>
      <span>Фиксация 15 мин</span>
    </div>
  );
}

function LiveProbes({ quote, grams, purity, onPick, lockedAmount, lockedPurity, status }) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(null);
  const spot = quote?.goldRubPerGram;
  const waiting = status === 'loading' && !quote;
  const failed = status === 'error' && !quote;

  useEffect(() => {
    if (spot == null) return;
    if (prev.current != null && prev.current !== spot) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      prev.current = spot;
      return () => clearTimeout(t);
    }
    prev.current = spot;
    return undefined;
  }, [spot]);

  return (
    <div className={`dl2-probes${flash ? ' is-flash' : ''}`}>
      {PROBES.map((p) => {
        const perG = quotePerGram(quote, p);
        const liveSum = quotePayout(quote, p, grams);
        const sum = lockedAmount != null && p === lockedPurity ? lockedAmount : liveSum;
        const on = p === purity;
        return (
          <button
            key={p}
            type="button"
            className={`dl2-probe${on ? ' is-on' : ''}`}
            onClick={() => onPick(p)}
            aria-pressed={on}
            disabled={lockedAmount != null}
          >
            <span className="dl2-probe-k">Проба {p}</span>
            <span className="dl2-probe-g mono-nums">
              {waiting ? <Skel /> : failed ? 'нет курса' : formatPerGram(perG) || '—'}
            </span>
            <span className="dl2-probe-s mono-nums">
              {waiting ? <Skel wide /> : sum != null ? formatMoney(sum) : '—'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function DeliveryLanding() {
  const toast = useToast();
  const scrolled = useHeaderScrolled();
  const { quote: liveQuote, status, reload } = useDeliveryQuote();
  const [gramsText, setGramsText] = useState('10');
  const [purity, setPurity] = useState(585);
  const [locked, setLocked] = useState(null);
  const [city, setCity] = useState('Москва');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const [fieldErr, setFieldErr] = useState({});
  const [sticky, setSticky] = useState(false);
  const left = useLockCountdown(locked?.until);

  const grams = useMemo(() => {
    const n = Number(String(gramsText).replace(',', '.'));
    return Number.isFinite(n) ? Math.min(5000, Math.max(0, n)) : 0;
  }, [gramsText]);

  useEffect(() => {
    document.title = 'Reaktivo.pro — золото это деньги, не выходя из дома';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      'content',
      'Скупка золота с выездом курьера. Живой курс, мгновенная оценка, выплата дома. Вызвать курьера Reaktivo.'
    );
  }, []);

  useEffect(() => {
    const target = document.getElementById('order');
    if (!target) return undefined;
    let formInView = true;
    const recompute = () => setSticky(!formInView && window.scrollY > 280);
    const io = new IntersectionObserver(([entry]) => {
      formInView = entry.isIntersecting;
      recompute();
    }, { rootMargin: '0px 0px -18% 0px' });
    io.observe(target);
    window.addEventListener('scroll', recompute, { passive: true });
    return () => { io.disconnect(); window.removeEventListener('scroll', recompute); };
  }, []);

  const lockedAlive = Boolean(locked && left > 0);
  const quote = lockedAlive ? locked.quote : liveQuote;
  const activePurity = lockedAlive ? locked.purity : purity;
  const activeGrams = lockedAlive ? locked.grams : grams;
  const payout = useMemo(() => quotePayout(quote, activePurity, activeGrams), [quote, activePurity, activeGrams]);
  const perG = useMemo(() => quotePerGram(quote, activePurity), [quote, activePurity]);
  const spot = Number(quote?.goldRubPerGram) || 0;
  const scrap = spot > 0 && activeGrams > 0 ? spot * (activePurity / 1000) * activeGrams : null;
  const shownAmount = lockedAlive ? locked.amount : payout;
  const waitingQuote = status === 'loading' && !liveQuote;
  const quoteFailed = status === 'error' && !liveQuote;
  const payoutDisplay = useAnimatedNumber(shownAmount);
  const scrapDisplay = useAnimatedNumber(scrap);
  const gapDisplay = useAnimatedNumber(scrap != null && shownAmount != null ? Math.max(0, scrap - shownAmount) : null);

  useEffect(() => {
    if (!locked) return undefined;
    if (left > 0) return undefined;
    setLocked(null);
    if (phase === 'idle') setError('15 минут истекли — курс обновился. Зафиксируйте сумму ещё раз.');
    return undefined;
  }, [locked, left, phase]);

  function lockAndOpen() {
    setError('');
    setFieldErr({});
    if (quoteFailed) {
      setError('Курс сейчас недоступен. Обновите страницу или позвоните: 8 800 555-18-48');
      return;
    }
    if (payout == null || payout <= 0) {
      setError(waitingQuote ? 'Курс ещё загружается — подождите секунду.' : 'Укажите вес изделия, чтобы посчитать выплату.');
      return;
    }
    setLocked({
      amount: Math.round(payout),
      purity,
      grams: Number(grams),
      perGram: perG,
      quote: liveQuote,
      until: Date.now() + LOCK_MS,
    });
    document.getElementById('order')?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (phase === 'sending') return;
    setError('');
    setFieldErr({});
    if (String(website || '').trim()) {
      setPhase('sent');
      return;
    }
    if (!lockedAlive) {
      setError('Сначала зафиксируйте сумму — курс держим 15 минут.');
      return;
    }
    const next = {};
    if (String(city || '').trim().length < 2) next.city = 'Напишите город, куда ехать курьеру';
    if (String(address || '').trim().length < 5) next.address = 'Нужен адрес: улица, дом, квартира';
    if (!isRuPhone(phone)) next.phone = 'Укажите номер телефона, без него мы не сможем связаться';
    if (Object.keys(next).length) {
      setFieldErr(next);
      setError('Проверьте поля заявки — без них курьер не выедет.');
      return;
    }

    const fields = {
      'Проба': String(locked.purity),
      'Вес, г': String(locked.grams),
      'Зафиксированная сумма': formatMoney(locked.amount),
      'Курс ₽/г': locked.perGram != null ? formatPerGram(locked.perGram) : '—',
      'Курс держим до': new Date(locked.until).toLocaleString('ru-RU'),
      'Источник': 'reaktivo.pro',
    };

    setPhase('sending');
    try {
      const slot = pickNextCourierSlot();
      let sent = false;
      if (slot) {
        try {
          await clientApi.courierOrder({
            name: 'Клиент доставки',
            phone: phone.trim(),
            city: city.trim(),
            address: address.trim(),
            date: slot.date,
            time: slot.time,
            website,
            fields,
          });
          sent = true;
        } catch {
          sent = false;
        }
      }
      if (!sent) {
        await clientApi.landingLead({
          source: 'delivery',
          name: 'Клиент доставки',
          phone: phone.trim(),
          website,
          fields: { ...fields, Город: city.trim(), Адрес: address.trim() },
        });
      }
      ymReachGoal('lead', { source: 'delivery' });
      setPhase('sent');
      toast('Заявка ушла. Курьер свяжется с вами.', 'success');
    } catch (err) {
      setPhase('idle');
      const msg = err?.message || 'Не получилось отправить. Позвоните: 8 800 555-18-48';
      setError(msg);
      toast(msg, 'error');
    }
  }

  const ctaLabel = phase === 'sending'
    ? 'Отправляем…'
    : lockedAlive
      ? 'Вызвать курьера'
      : quoteFailed
        ? 'Курс недоступен'
        : waitingQuote
          ? 'Загружаем курс…'
          : 'Вызвать курьера на эту сумму';

  const calcCard = (
    <div id="order" className="dl2-order">
      <div className="rl-calc-card dl2-calc">
        <div className="rl-calc-top">
          <span className="rl-calc-brand">REAKTIVO<i>·</i>PRO</span>
          {waitingQuote ? (
            <span className="il-card-live"><i />курс загружается</span>
          ) : quoteFailed ? (
            <button type="button" className="dl2-retry" onClick={reload}>Обновить курс</button>
          ) : (
            <span className="dl2-live-wrap">
              <span className="il-card-live il-card-live--ok mono-nums"><i />{formatPerGram(spot) || '—'}</span>
              <RuGoldTicker value={spot} change={liveQuote?.change} storeKey="dl-gold-rate" />
            </span>
          )}
        </div>

        <span className="rl-calc-label">Выберите пробу</span>
        <LiveProbes
          quote={quote}
          grams={activeGrams}
          purity={activePurity}
          onPick={setPurity}
          lockedAmount={lockedAlive ? locked.amount : null}
          lockedPurity={lockedAlive ? locked.purity : null}
          status={status}
        />

        <form onSubmit={lockedAlive ? onSubmit : (e) => { e.preventDefault(); lockAndOpen(); }}>
          <label className="il-lead-field dl2-weight-field">
            <span>Вес, г</span>
            <input
              inputMode="decimal"
              value={gramsText}
              onChange={(e) => setGramsText(e.target.value.replace(/[^\d.,]/g, ''))}
              disabled={lockedAlive}
              aria-label="Вес в граммах"
            />
          </label>
          <div className="dl2-chips">
            {WEIGHT_CHIPS.map((w) => (
              <button
                key={w}
                type="button"
                className={grams === w && String(gramsText).trim() !== '' ? 'is-on' : ''}
                disabled={lockedAlive}
                onClick={() => setGramsText(String(w))}
              >
                {w} г
              </button>
            ))}
          </div>

          <div className="rl-calc-out dl2-out">
            <span className="rl-calc-out-label">
              {lockedAlive ? 'Зафиксировали' : 'К выплате'} наличными или<RuSbpBadge />
            </span>
            <span className="rl-calc-out-val mono-nums">
              {waitingQuote ? <Skel wide /> : payoutDisplay != null ? formatMoney(payoutDisplay) : '—'}
            </span>
            {lockedAlive ? (
              <span className="dl2-timer" aria-live="polite">
                <b>{formatTimer(left)}</b>
                <span>курс держим 15 минут</span>
              </span>
            ) : (
              <span className="dl2-out-note">
                {quoteFailed ? 'Не удалось получить курс' : `Проба ${purity} · ${formatPerGram(perG) || '₽/г'}`}
              </span>
            )}
          </div>

          {lockedAlive && (
            <div className="dl2-lock-fields">
              <label className="il-lead-field">
                <span>Город</span>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  autoComplete="address-level2"
                  aria-invalid={Boolean(fieldErr.city)}
                  aria-describedby={fieldErr.city ? 'err-city' : undefined}
                />
                <FieldError id="err-city" message={fieldErr.city} />
              </label>
              <label className="il-lead-field">
                <span>Адрес</span>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Улица, дом, квартира"
                  autoComplete="street-address"
                  aria-invalid={Boolean(fieldErr.address)}
                  aria-describedby={fieldErr.address ? 'err-address' : undefined}
                />
                <FieldError id="err-address" message={fieldErr.address} />
              </label>
              <label className="il-lead-field">
                <span>Телефон</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7 9XX XXX-XX-XX"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-invalid={Boolean(fieldErr.phone)}
                  aria-describedby={fieldErr.phone ? 'err-phone' : undefined}
                />
                <FieldError id="err-phone" message={fieldErr.phone} />
              </label>
              <input className="dl2-hp" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden />
            </div>
          )}

          {error && <p className="il-lead-err" role="alert">{error}</p>}

          {phase === 'sent' ? (
            <div className="dl2-sent">
              <p className="il-lead-ok">Заявка ушла. Курьер свяжется с вами, чтобы подтвердить визит.</p>
              <DemoTracker freezeAt={0} />
            </div>
          ) : (
            <button type="submit" className="il-btn il-btn--primary rl-calc-cta" disabled={phase === 'sending' || waitingQuote}>
              {ctaLabel}
            </button>
          )}
          <p className="dl2-fine">
            Нажимая кнопку, вы соглашаетесь с <a href="/privacy">политикой персональных данных</a>. Для сделки нужен паспорт.
          </p>
        </form>
      </div>
    </div>
  );

  return (
    <div className="il-root rl-root dl2-root">
      <RuAtmosphere />

      <header className={`il-header${scrolled ? ' il-header--scrolled' : ''}`}>
        <div className="il-header-inner">
          <a href="/" className="il-logo" aria-label="Reaktivo.pro">
            <img className="il-logo-mark" src="/logo-reaktivo-mark.svg" alt="" width="40" height="40" />
            <span className="il-logo-text">REAKTIVO<span>.PRO</span></span>
          </a>
          <div className="il-header-actions">
            <a href="tel:+78005551848" className="il-header-phone" title="8 800 555-18-48" aria-label="Позвонить: 8 800 555-18-48">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z" />
              </svg>
            </a>
            <ThemeToggle />
            <Magnetic>
              <a href="#order" className="il-btn il-btn--primary il-btn--header-buy">
                <span className="dl2-cta-full">Вызвать курьера</span>
                <span className="dl2-cta-short">Курьер</span>
              </a>
            </Magnetic>
          </div>
        </div>
      </header>

      <main>
        <RuFullHero
          imgDark="/ru/courier.jpg"
          imgLight="/ru/courier-light.jpg"
          imgPos="50% 36%"
          kicker="Скупка золота с выездом курьера · Москва и МО"
          title={<>Золото — это деньги, <br />не выходя <span className="il-accent-text">из дома</span>.</>}
          sub="Живой курс офиса, оценка за секунду, курьер приедет и оплатит сразу — сумма та же, что вы зафиксировали на сайте."
          primary={{ href: '#order', label: 'Вызвать курьера' }}
          secondary={{ href: '#steps', label: 'Как это работает' }}
          aside={calcCard}
        />

        <RuMarquee items={[
          'Курс офиса на первом экране',
          'Оценка за секунду',
          'Фиксация 15 минут',
          'Курьер бесплатно',
          'Проба при вас',
          'Наличные или СБП',
          'Москва и МО',
        ]} />

        <DutyBar />

        <section className="il-section rl-kpis-section">
          <div className="il-section-inner">
            <RuKpis items={[
              { val: '15 мин', label: 'держим курс после расчёта', icon: 'clock', imgDark: '/ru/kpi-time-dark.jpg', imgLight: '/ru/kpi-time-light.jpg' },
              { val: '0 ₽', label: 'вызов курьера — без доплаты', icon: 'check', imgDark: '/ru/kpi-zerofee-dark.jpg', imgLight: '/ru/kpi-zerofee-light.jpg' },
              { val: '45 мин', label: 'курьер приезжает в зоне', icon: 'clock', imgDark: '/ru/kpi-parcel-dark.jpg', imgLight: '/ru/kpi-parcel-light.jpg' },
              { val: 'паспорт', label: 'нужен по закону, не «для галочки»', icon: 'shield', imgDark: '/ru/kpi-shield-dark.jpg', imgLight: '/ru/kpi-shield-light.jpg' },
            ]} />
          </div>
        </section>

        <PathStory />

        <section className="il-section il-section--alt" id="calc">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Прозрачный расчёт</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Биржа, выплата, разница —<br /><span className="il-accent-text">без «мутной» скупки</span></h2></Reveal>
            </div>
            <motion.div className="il-cards" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
              <motion.div className="il-card" variants={staggerChild}>
                <span className="il-card-label">Биржевой лом</span>
                <div className="il-card-big mono-nums">{waitingQuote ? <Skel wide /> : scrapDisplay != null ? formatMoney(scrapDisplay) : '—'}</div>
                <p className="il-card-text">Стоимость чистого золота по текущему биржевому курсу, без вычетов.</p>
              </motion.div>
              <motion.div className="il-card" variants={staggerChild}>
                <span className="il-card-label">Ваша выплата</span>
                <div className="il-card-big mono-nums">{waitingQuote ? <Skel wide /> : payoutDisplay != null ? formatMoney(payoutDisplay) : '—'}</div>
                <p className="il-card-text">Сумма, которую вы получите от курьера — наличными или через СБП.</p>
              </motion.div>
              <motion.div className="il-card" variants={staggerChild}>
                <span className="il-card-label">Разница</span>
                <div className="il-card-big mono-nums">
                  {waitingQuote ? <Skel wide /> : gapDisplay != null ? formatMoney(gapDisplay) : '—'}
                </div>
                <p className="il-card-text">Официальная наценка офиса — видна сразу, без скрытых удержаний.</p>
              </motion.div>
            </motion.div>
            <Reveal delay={0.2} className="dl2-calc-note">
              <p className="il-p">
                Выплата считается по официальному курсу выкупа офиса, не «от потолка». Точная сумма — после проверки пробы и веса курьером.
              </p>
              <Magnetic>
                <a href="#order" className="il-btn il-btn--primary">Продать золото</a>
              </Magnetic>
            </Reveal>
          </div>
        </section>

        <section className="il-section" id="courier">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Кто ваш курьер</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Красная сумка, бейдж и проверка <span className="il-accent-text">при вас</span></h2></Reveal>
            </div>
            <div className="dl2-courier">
              <div className="dl2-courier-photo">
                <RuThemedImg dark="/ru/courier.jpg" light="/ru/courier-light.jpg" alt="Курьер Reaktivo с красной сумкой" />
              </div>
              <div className="dl2-courier-card">
                <span className="il-card-label">Курьер доставки</span>
                <h3>Александр</h3>
                <p>Выезд по Москве и МО. Проба и вес — на месте, выплата сразу. У курьера бейдж с QR и красная сумка Reaktivo.</p>
                <div className="dl2-courier-meta">
                  <span>★ 5.0</span>
                  <span>Паспорт обязателен</span>
                  <span>Наличные / СБП</span>
                </div>
                <div className="dl2-courier-qr">
                  <a href="https://reaktivo.ru/kurier/" target="_blank" rel="noopener noreferrer" aria-label="Открыть страницу курьера на Reaktivo.ru">
                    <img src="/yandex-review-qr.png" alt="" width="92" height="92" />
                  </a>
                  <div>
                    <b>Отзывы и страница курьера</b>
                    <p>QR ведёт на сервис доставки. После заявки курьер подтвердит визит звонком.</p>
                  </div>
                </div>
                <div className="dl2-courier-actions">
                  <a href="#order" className="il-btn il-btn--primary">Вызвать курьера</a>
                  <a href="https://t.me/Reaktivoai" className="il-btn il-btn--outline" target="_blank" rel="noopener noreferrer">Написать в Telegram</a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="il-section il-section--alt" id="track">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Трекер заказа</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Принята → выехал → на месте → <span className="il-accent-text">деньги у вас</span></h2></Reveal>
              <Reveal delay={0.12}><p className="il-p">Демо статуса. Настоящий трекер подключим к заказу следующим этапом — нажмите карточку, чтобы посмотреть шаг.</p></Reveal>
            </div>
            <DemoTracker />
          </div>
        </section>

        <section className="il-section" id="stories">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Как это выглядит</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Три сцены без поездки <span className="il-accent-text">в отделение</span></h2></Reveal>
            </div>
            <motion.div className="il-cards" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
              {STORIES.map((s) => (
                <motion.div className="il-card" key={s.t} variants={staggerChild}>
                  <span className="il-card-label">{s.k}</span>
                  <h3 className="il-card-title">{s.t}</h3>
                  <p className="il-card-text">{s.d}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="il-section il-section--alt" id="log">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Эволюция доставки</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Что уже работает <span className="il-accent-text">на этой странице</span></h2></Reveal>
            </div>
            <div className="dl2-log">
              {EVOLUTION.map((row) => (
                <article className="dl2-log-row" key={row.n}>
                  <b className="mono-nums">{row.n}</b>
                  <div>
                    <h3>{row.title}</h3>
                    <p>{row.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="il-section" id="faq">
          <div className="il-section-inner">
            <div className="dl2-split">
              <div>
                <span className="il-pill">Дома или в отделении</span>
                <h2 className="il-h2">Курс один. Разница — <span className="il-accent-text">куда ехать</span></h2>
                <div className="dl2-compare">
                  {COMPARE.map((c) => (
                    <article className={`dl2-compare-card${c.on ? ' is-on' : ''}`} key={c.title}>
                      <h3>{c.title}</h3>
                      <ul>
                        {c.points.map((p) => <li key={p}>{p}</li>)}
                      </ul>
                    </article>
                  ))}
                </div>
              </div>
              <div>
                <span className="il-pill">Вопросы</span>
                <h2 className="il-h2">Коротко <span className="il-accent-text">по делу</span></h2>
                <RuFaq items={FAQ} />
              </div>
            </div>
          </div>
        </section>

        <RuStatement text="Золото — это деньги, не выходя из дома. Курс, который вы зафиксировали, — это курс, который приедет курьер." />

        <section className="il-section" id="docs">
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

        <section className="il-section il-section--cta" id="waitlist">
          <div className="il-section-inner">
            <div className="dl2-forms">
              <Reveal>
                <RuCtaPanel>
                  <h2 className="il-h2">Нет курьера в вашем городе?</h2>
                  <p>Оставьте город и телефон — так мы видим, куда везти доставку и запускать агентов. Москва и МО — вызывайте курьера сразу.</p>
                  <RuLeadForm
                    source="waitlist"
                    title="Хочу Reaktivo в моём городе"
                    note="Имя, телефон и город. Это лист ожидания, не заявка на выезд."
                    cta="Записать город"
                    successNote="Город записан. Когда откроем доставку — свяжемся."
                    fields={[{ key: 'city', label: 'Город', placeholder: 'Ваш город', required: true, full: true }]}
                  />
                </RuCtaPanel>
              </Reveal>
              <Reveal delay={0.08}>
                <div className="dl2-ref" id="referral">
                  <span className="il-pill">Реферальная программа</span>
                  <h2 className="il-h2">Приведите знакомого</h2>
                  <p>Оба получите повышенный курс на следующую сделку. Оставьте контакт — перезвоним с условиями, без автосписаний.</p>
                  <RuLeadForm
                    source="referral"
                    title="Хочу привести знакомого"
                    note="Имя и телефон. Если есть контакт друга — укажите, это ускорит разговор."
                    cta="Оставить контакт"
                    successNote="Записали. Перезвоним и расскажем, как засчитать рекомендацию."
                    fields={[{ key: 'friend', label: 'Контакт знакомого', placeholder: 'Имя или телефон друга — необязательно', full: true }]}
                  />
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <footer className="il-footer">
        <div className="il-section-inner">
          <div className="il-footer-grid">
            <div className="il-footer-brand">
              <a href="/" className="il-logo il-logo--footer">
                <img className="il-logo-mark" src="/logo-reaktivo-mark.svg" alt="" width="44" height="44" />
                <span className="il-logo-text">REAKTIVO</span>
              </a>
              <p>Промо доставки. Курьерский выкуп золота по биржевому курсу — без поездки в отделение.</p>
            </div>
            <div className="il-footer-col">
              <span className="il-footer-col-title">На этой странице</span>
              <a href="#order" className="il-nav-link">Вызвать курьера</a>
              <a href="#steps" className="il-nav-link">Путь красного R</a>
              <a href="#faq" className="il-nav-link">Вопросы</a>
              <a href="#docs" className="il-nav-link">Документы</a>
            </div>
            <div className="il-footer-col">
              <span className="il-footer-col-title">Основной сайт</span>
              <a href="https://reaktivo.ru" className="il-nav-link">Reaktivo.ru</a>
              <a href="https://reaktivo.ru/kurier/" className="il-nav-link">Курьер на Reaktivo.ru</a>
              <a href="/invest" className="il-nav-link">Витрина изделий</a>
              <a href="/pro" className="il-nav-link">Сотрудникам</a>
            </div>
            <div className="il-footer-col">
              <span className="il-footer-col-title">Контакты</span>
              <a href="tel:+78005551848" className="il-nav-link">8 800 555-18-48</a>
              <a href="https://t.me/Reaktivoai" className="il-nav-link" target="_blank" rel="noopener noreferrer">Telegram</a>
              <a href="mailto:team@reaktivo.ru" className="il-nav-link">team@reaktivo.ru</a>
              <a href="/privacy" className="il-nav-link">Персональные данные</a>
            </div>
          </div>
          <div className="il-footer-bottom">
            <span>© 2026 Reaktivo</span>
            <a href="/privacy" className="il-footer-privacy">Политика персональных данных</a>
          </div>
        </div>
      </footer>

      {sticky && (
        <a href="#order" className="dl2-sticky">Вызвать курьера</a>
      )}

      <style>{IL_CSS}</style>
      <style>{RL_CSS}</style>
      <style>{DL2_CSS}</style>
    </div>
  );
}

const DL2_CSS = `
.dl2-root { --font-display: 'Geometria', system-ui, sans-serif; }
.dl2-root .il-section { padding: 48px 0; }
.dl2-root .il-section-head { margin-bottom: 24px; }
.dl2-root .rl-kpis-section { padding: 24px 0 4px; }
.dl2-root .rl-statement { padding: 40px 0 32px; }
.dl2-root .il-section--cta { padding: 32px 0 48px; }
.dl2-root .il-header-actions { align-items: center; }
.mono-nums { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }
.dl2-order { display: flex; width: 100%; height: 100%; }
.dl2-calc form { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
.dl2-probes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
.dl2-probe {
  display: flex; flex-direction: column; gap: 6px; min-height: 92px;
  padding: 12px 10px; border-radius: 14px;
  border: 1px solid var(--stroke); background: var(--bg);
  color: inherit; text-align: left; cursor: pointer; font: inherit;
  transition: border-color 0.2s, background 0.2s;
}
.dl2-probe:disabled { cursor: default; }
.dl2-probe.is-on { border-color: var(--accent); background: var(--accent-soft); }
.dl2-probes.is-flash .dl2-probe-g { color: var(--accent); }
.dl2-probe-k { font-size: 0.68rem; color: var(--text-dim); letter-spacing: 0.06em; text-transform: uppercase; }
.dl2-probe-g { font-size: 0.78rem; font-weight: 700; color: var(--text-muted); min-height: 1.2em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dl2-probe-s { font-size: 0.98rem; font-weight: 800; color: var(--text-strong); min-height: 1.25em; letter-spacing: -0.03em; line-height: 1.15; }
.dl2-weight-field input { font-size: 1.1rem; font-weight: 700; }
.dl2-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.dl2-chips button {
  min-height: 34px; padding: 0 12px; border-radius: 999px;
  border: 1px solid var(--stroke); background: transparent; color: var(--text-muted);
  font: inherit; font-size: 0.86rem; font-weight: 600; cursor: pointer;
}
.dl2-chips button.is-on { border-color: var(--accent); color: var(--text-strong); background: var(--accent-soft); }
.dl2-chips button:disabled { opacity: 0.5; cursor: default; }
.dl2-out .rl-calc-out-label { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dl2-out-note { display: block; margin-top: 6px; font-size: 0.8rem; color: var(--text-dim); }
.dl2-timer { display: flex; align-items: baseline; gap: 10px; margin-top: 8px; font-size: 0.82rem; color: var(--text-dim); }
.dl2-timer b {
  font-size: 1.02rem; color: var(--text-strong);
  padding: 4px 11px; border-radius: 999px; background: var(--accent-soft);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  font-variant-numeric: tabular-nums; letter-spacing: 0.04em;
}
.dl2-lock-fields { display: flex; flex-direction: column; gap: 12px; padding-top: 4px; border-top: 1px dashed var(--stroke); }
.dl2-retry {
  appearance: none; border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); background: transparent;
  color: var(--accent); border-radius: 999px; min-height: 30px; padding: 0 12px; font: inherit; font-size: 0.78rem; font-weight: 700; cursor: pointer;
}
.dl2-skel {
  display: inline-block; height: 0.9em; width: 7.2ch; border-radius: 6px; vertical-align: middle;
  background: linear-gradient(90deg, var(--stroke-soft), var(--stroke), var(--stroke-soft));
  background-size: 200% 100%; animation: dl2Shimmer 1.2s ease infinite;
}
.dl2-skel--wide { width: 9.5ch; }
@keyframes dl2Shimmer { 50% { background-position: -120% 0; } }
.dl2-hp { position: absolute; left: -9999px; height: 0; width: 0; opacity: 0; pointer-events: none; }
.dl2-fine { margin: 0; color: var(--text-dim); font-size: 0.75rem; line-height: 1.45; }
.dl2-fine a { color: var(--text-strong); }
.dl2-calc-note { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; margin-top: 24px; padding-top: 22px; border-top: 1px solid var(--stroke-soft); }
.dl2-calc-note .il-p { max-width: 46ch; }
.dl2-sticky {
  position: fixed; left: 12px; right: 12px; bottom: max(12px, env(safe-area-inset-bottom));
  z-index: 60; display: flex; align-items: center; justify-content: center;
  min-height: 52px; border-radius: 16px;
  background: var(--accent-grad); color: #fff; font-weight: 800; text-decoration: none;
  box-shadow: 0 16px 40px -14px color-mix(in srgb, var(--accent) 55%, transparent);
}
.dl2-cta-short { display: none; }
.dl2-live-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.dl2-sent { display: flex; flex-direction: column; gap: 14px; }
.dl2-duty {
  display: flex; flex-wrap: wrap; justify-content: center; align-items: center;
  gap: 8px 18px; padding: 12px 16px;
  border-bottom: 1px solid var(--stroke-soft);
  font-size: 0.8rem; color: var(--text-muted);
  background: color-mix(in srgb, var(--bg-panel-solid) 72%, transparent);
}
.dl2-duty b { color: var(--text-strong); font-weight: 800; }
.dl2-duty-dot {
  width: 8px; height: 8px; border-radius: 99px; background: var(--text-dim); flex-shrink: 0;
}
.dl2-duty-dot.is-on { background: #3dff8a; box-shadow: 0 0 10px rgba(61, 255, 138, 0.5); }
.dl2-path { position: relative; padding: 36px 0 24px; }
.dl2-path--static { height: auto; }
.dl2-path-sticky {
  position: relative; top: auto;
  min-height: 0;
  display: flex; align-items: center;
  padding: 0;
  background:
    radial-gradient(900px 280px at 70% 20%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 58%);
}
.dl2-path--static .dl2-path-sticky { position: relative; top: auto; min-height: 0; }
.dl2-path-inner {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  display: grid; gap: 18px;
}
.dl2-path-copy .il-pill { margin-bottom: 14px; }
.dl2-path-idx { margin: 0 0 8px; color: var(--text-dim); font-size: 0.78rem; letter-spacing: 0.12em; font-weight: 700; }
.dl2-path-title { margin: 0 0 10px; font-size: clamp(2rem, 6vw, 3.4rem); letter-spacing: -0.04em; font-weight: 800; min-height: 1.15em; }
.dl2-path-text { margin: 0 0 18px; max-width: 34rem; color: var(--text-muted); line-height: 1.55; min-height: 3.2em; }
.dl2-route { display: flex; justify-content: center; min-width: 0; }
.dl2-route-svg { width: 100%; height: 220px; overflow: visible; display: block; }
.dl2-route-ghost { stroke: var(--stroke); fill: none; }
.dl2-route-draw { stroke: var(--accent); fill: none; }
.dl2-stop-label { fill: var(--text-dim); }
.dl2-stop-label.is-on { fill: var(--text-strong); }
.dl2-progress {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px;
  list-style: none; margin: 0; padding: 0;
}
.dl2-progress li { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.dl2-progress li i { display: block; height: 4px; border-radius: 99px; background: var(--stroke); }
.dl2-progress li span { font-size: 0.72rem; color: var(--text-dim); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dl2-progress li.is-on i { background: var(--accent); }
.dl2-progress li.is-on span { color: var(--text-strong); }
.dl2-track {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px;
}
.dl2-track-step {
  display: flex; flex-direction: column; gap: 6px; min-height: 0;
  padding: 14px 14px 16px; border-radius: 18px; text-align: left;
  border: 1px solid var(--stroke); background: var(--bg-panel-solid);
  color: inherit; font: inherit; cursor: pointer;
}
.dl2-track-step b { font-size: 0.72rem; letter-spacing: 0.08em; color: var(--text-dim); }
.dl2-track-step span { font-weight: 800; color: var(--text-strong); }
.dl2-track-step em { font-style: normal; font-size: 0.82rem; line-height: 1.45; color: var(--text-muted); }
.dl2-track-step.is-on { border-color: color-mix(in srgb, var(--accent) 45%, var(--stroke)); }
.dl2-track-step.is-now { background: var(--accent-soft); }
.dl2-track-step.is-now em { color: var(--text-strong); }
.dl2-log { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.dl2-log-row {
  display: grid; gap: 8px;
  padding: 18px 18px 20px; border-radius: 18px;
  border: 1px solid var(--stroke); background: var(--bg-panel-solid);
}
.dl2-log-row b { font-size: 0.78rem; color: var(--accent); letter-spacing: 0.1em; }
.dl2-log-row h3 { margin: 0; font-size: 1.05rem; letter-spacing: -0.03em; line-height: 1.3; }
.dl2-log-row p { margin: 0; color: var(--text-muted); font-size: 0.9rem; line-height: 1.5; }
.dl2-split { display: grid; gap: 32px; }
.dl2-split .il-h2 { font-size: clamp(1.45rem, 3vw, 2.05rem); margin: 10px 0 18px; text-align: left; }
.dl2-compare { display: grid; gap: 10px; }
.dl2-compare-card {
  padding: 16px 18px; border-radius: 18px;
  border: 1px solid var(--stroke); background: var(--bg-panel-solid);
}
.dl2-compare-card.is-on {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--stroke));
  background: var(--accent-soft);
}
.dl2-compare-card h3 { margin: 0 0 10px; font-size: 1.05rem; }
.dl2-compare-card ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.dl2-compare-card li { position: relative; padding-left: 1.15em; color: var(--text-muted); font-size: 0.9rem; line-height: 1.4; }
.dl2-compare-card li::before { content: '→'; position: absolute; left: 0; color: var(--accent); font-weight: 800; }
.dl2-forms { display: grid; gap: 16px; align-items: stretch; }
.dl2-forms > * { min-width: 0; display: flex; }
.dl2-forms .il-cta-panel,
.dl2-forms .dl2-ref { flex: 1; width: 100%; }
.dl2-forms .il-cta-panel { padding: 28px 24px; }
.dl2-ref {
  padding: 28px 24px; border-radius: 28px;
  border: 1px solid var(--stroke); background: var(--bg-panel-solid);
}
.dl2-ref .il-h2 { font-size: clamp(1.45rem, 3vw, 2.1rem); margin: 10px 0 10px; text-align: left; }
.dl2-ref > p { margin: 0 0 16px; color: var(--text-muted); line-height: 1.5; }
.dl2-courier {
  display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr); gap: 22px; align-items: stretch;
}
.dl2-courier-photo, .dl2-courier-card {
  border-radius: 24px; overflow: hidden; border: 1px solid var(--stroke);
  background: var(--bg-panel-solid);
}
.dl2-courier-photo img { display: block; width: 100%; height: 100%; min-height: 280px; max-height: 420px; object-fit: cover; object-position: 50% 30%; }
.dl2-courier-card { padding: 24px 22px; display: flex; flex-direction: column; gap: 12px; }
.dl2-courier-card h3 { margin: 0; font-size: 1.8rem; letter-spacing: -0.03em; }
.dl2-courier-card > p { margin: 0; color: var(--text-muted); line-height: 1.55; }
.dl2-courier-meta { display: flex; flex-wrap: wrap; gap: 8px; }
.dl2-courier-meta span {
  font-size: 0.78rem; font-weight: 700; padding: 6px 10px; border-radius: 999px;
  background: var(--accent-soft); color: var(--text-strong);
}
.dl2-courier-qr { display: flex; gap: 14px; align-items: center; padding: 8px 0; }
.dl2-courier-qr img { width: 84px; height: 84px; border-radius: 12px; background: #fff; }
.dl2-courier-qr b { display: block; margin-bottom: 4px; }
.dl2-courier-qr p { margin: 0; font-size: 0.84rem; color: var(--text-muted); line-height: 1.45; }
.dl2-courier-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: auto; }
.dl2-root .il-header-phone { display: flex !important; }
.dl2-root .il-btn--header-buy { display: inline-flex !important; }
.dl2-root .il-header:not(.il-header--scrolled) .theme-toggle-track {
  background: rgba(255,255,255,0.16);
  border-color: rgba(255,255,255,0.28);
}
.dl2-root .il-header:not(.il-header--scrolled) .il-header-phone {
  color: #fff;
  border-color: rgba(255,255,255,0.28);
  background: rgba(0,0,0,0.18);
}
:root[data-theme='light'] .dl2-root .il-header:not(.il-header--scrolled) .theme-toggle-track {
  background: rgba(255,255,255,0.78);
  border-color: rgba(13,14,15,0.18);
}
:root[data-theme='light'] .dl2-root .il-header:not(.il-header--scrolled) .il-header-phone {
  color: #161310;
  border-color: rgba(13,14,15,0.18);
  background: rgba(255,255,255,0.55);
}
@media (min-width: 768px) {
  .dl2-sticky { display: none; }
}
@media (min-width: 900px) {
  .dl2-path-inner { grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr); align-items: center; }
  .dl2-progress { grid-column: 1 / -1; }
  .dl2-route-svg { height: 240px; }
  .dl2-split { grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr); align-items: start; }
  .dl2-forms { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: stretch; }
}
@media (max-width: 900px) {
  .dl2-root .il-header-inner { gap: 10px; padding: 12px 16px; }
  .dl2-root .il-logo-text { font-size: 1.05rem; }
  .dl2-courier { grid-template-columns: 1fr; }
  .dl2-courier-photo img { min-height: 220px; max-height: 320px; }
  .dl2-track { grid-template-columns: 1fr 1fr; }
  .dl2-log { grid-template-columns: 1fr; }
  .dl2-route-svg { height: 260px; max-width: 140px; margin: 0 auto; }
}
@media (max-width: 520px) {
  .dl2-cta-full { display: none; }
  .dl2-cta-short { display: inline; }
  .dl2-root .il-btn--header-buy { padding: 9px 12px; font-size: 0.8rem; }
  .dl2-probe { min-height: 84px; padding: 10px 8px; }
  .dl2-probe-s { font-size: 0.86rem; }
  .dl2-probe-g { font-size: 0.72rem; }
  .dl2-track { grid-template-columns: 1fr; }
  .dl2-root .il-section { padding: 36px 0; }
  .dl2-path { padding: 28px 0 16px; }
}
@media (max-width: 360px) {
  .dl2-root .il-header-phone { display: none !important; }
}
@media (prefers-reduced-motion: reduce) {
  .dl2-skel { animation: none; }
}
`;
