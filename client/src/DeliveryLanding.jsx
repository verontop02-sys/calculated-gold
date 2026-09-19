import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMotionValueEvent, useScroll } from 'motion/react';
import { clientApi } from './api.js';
import { quotePerGram, quotePayout } from './calc.js';
import { formatMoney, isRuPhone } from './ru/RuShared.jsx';
import { pickNextCourierSlot } from './ru/kurierSlots.js';
import { useToast } from './ToastContext.jsx';
import { ymReachGoal } from './yandexMetrika.js';

const PROBES = [585, 750, 999];
const WEIGHT_CHIPS = [5, 10, 20, 50];
const LOCK_MS = 15 * 60 * 1000;
const STEPS = [
  { title: 'Заявка', text: 'Считаете сумму на сайте и вызываете курьера — без поездки в отделение.' },
  { title: 'Курьер', text: 'Красная сумка едет к вам. Проверка пробы и веса — при вас, дома или в офисе.' },
  { title: 'Проверка', text: 'Реактив и, если нужно, спектр. Вы видите тот же результат, что и эксперт.' },
  { title: 'Деньги', text: 'Выплата сразу: наличные или СБП. Золото становится деньгами, не выходя из дома.' },
];

const DESK_PATH = 'M40 118 C 150 36, 230 176, 320 96 S 500 32, 600 122';
const MOB_PATH = 'M60 16 C 16 64, 104 96, 60 128 S 16 192, 60 224';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isMobileMq() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
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

function paintPath(pathEl, bagEl, progress, reduced) {
  if (!pathEl || !bagEl) return;
  const len = pathEl.getTotalLength();
  if (!Number.isFinite(len) || len <= 0) return;
  const raw = reduced ? 0.999 : Math.min(0.999, Math.max(0, progress));
  const t = reduced ? 0.999 : Math.max(0.02, raw);
  pathEl.style.strokeDasharray = String(len);
  pathEl.style.strokeDashoffset = reduced ? '0' : String(len * (1 - t));
  const p = pathEl.getPointAtLength(t * len);
  const tilt = reduced ? 0 : Math.sin(raw * Math.PI * 2) * 8;
  bagEl.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${tilt})`);
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
  const [mobile, setMobile] = useState(isMobileMq);
  const { scrollYProgress } = useScroll({
    target: pinRef,
    offset: ['start 72px', 'end end'],
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
    setStops([0, 1 / 3, 2 / 3, 0.999].map((t) => {
      const p = path.getPointAtLength(t * len);
      return { x: p.x, y: p.y };
    }));
    paintPath(path, bagRef.current, reduced ? 1 : latestV.current, reduced);
  }, [reduced]);

  useEffect(() => {
    layoutPath();
    const route = bagRef.current?.parentElement;
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
  const viewBox = mobile ? '0 0 120 240' : '0 0 640 200';

  return (
    <section className={`dl-path${reduced ? ' dl-path--static' : ''}`} ref={pinRef} aria-label="Путь красного R">
        <div className="dl-path-sticky">
        <div className="dl-wrap dl-path-inner">
        <div className="dl-path-copy">
          <p className="dl-kicker">Как это работает</p>
          <h2 className="dl-path-title">{copy.title}</h2>
          <p className="dl-path-text">{copy.text}</p>
        </div>

        <div className="dl-route">
          <svg className="dl-route-svg" viewBox={viewBox} fill="none" aria-hidden>
            <path d={d} stroke="rgba(255,255,255,0.14)" strokeWidth={mobile ? 3 : 3.5} strokeDasharray="6 9" strokeLinecap="round" />
            <path ref={pathRef} d={d} stroke="#dc2a2e" strokeWidth={mobile ? 3.5 : 4} strokeLinecap="round" />
            {stops.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={reduced || i <= step ? 7 : 5}
                fill={reduced || i <= step ? '#dc2a2e' : '#1a1b1f'}
                stroke="#f3f1ee"
                strokeWidth="1.5"
              />
            ))}
            <g ref={bagRef}>
              <circle r="20" fill="rgba(220,42,46,0.2)" />
              <image href="/logo-reaktivo-mark-128.png" x="-15" y="-15" width="30" height="30" />
            </g>
          </svg>
        </div>

        <ol className="dl-progress" aria-label="Этапы доставки">
          {STEPS.map((s, i) => (
            <li key={s.title} className={reduced || i <= step ? 'is-on' : ''}>
              <i />
              <span>{s.title}</span>
            </li>
          ))}
        </ol>
        <a href="#order" className="dl-btn dl-btn--ghost">Вызвать курьера</a>
        </div>
        </div>
    </section>
  );
}

function Skel({ wide }) {
  return <span className={`dl-skel${wide ? ' dl-skel--wide' : ''}`} aria-hidden />;
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
    <div className={`dl-probes${flash ? ' is-flash' : ''}`}>
      {PROBES.map((p) => {
        const perG = quotePerGram(quote, p);
        const liveSum = quotePayout(quote, p, grams);
        const sum = lockedAmount != null && p === lockedPurity ? lockedAmount : liveSum;
        const on = p === purity;
        return (
          <button
            key={p}
            type="button"
            className={`dl-probe${on ? ' is-on' : ''}`}
            onClick={() => onPick(p)}
            aria-pressed={on}
            disabled={lockedAmount != null}
          >
            <span className="dl-probe-k">Проба {p}</span>
            <span className="dl-probe-g mono-nums">
              {waiting ? <Skel /> : failed ? 'нет курса' : formatPerGram(perG) || '—'}
            </span>
            <span className="dl-probe-s mono-nums">
              {waiting ? <Skel wide /> : sum != null ? formatMoney(sum) : '—'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FieldError({ id, message }) {
  if (!message) return null;
  return <p className="dl-field-err" id={id} role="alert">{message}</p>;
}

export function DeliveryLanding() {
  const toast = useToast();
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
    const html = document.documentElement;
    const prevTheme = html.getAttribute('data-theme');
    html.setAttribute('data-theme', 'dark');
    const prevBg = document.body.style.background;
    const prevImg = document.body.style.backgroundImage;
    document.body.style.background = '#070708';
    document.body.style.backgroundImage = 'none';
    html.style.background = '#070708';
    return () => {
      if (prevTheme) html.setAttribute('data-theme', prevTheme);
      document.body.style.background = prevBg;
      document.body.style.backgroundImage = prevImg;
      html.style.background = '';
    };
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

  return (
    <div className="dl">
      <header className="dl-head">
        <a href="/" className="dl-logo" aria-label="Reaktivo.pro">
          <img src="/logo-reaktivo-mark.svg" alt="" width="32" height="32" />
          <span>REAKTIVO<span>.PRO</span></span>
        </a>
        <div className="dl-head-actions">
          <a href="tel:+78005551848" className="dl-phone">8 800 555-18-48</a>
          <a href="#order" className="dl-btn dl-btn--sm">
            <span className="dl-cta-full">Вызвать курьера</span>
            <span className="dl-cta-short">Курьер</span>
          </a>
        </div>
      </header>

      <section className="dl-hero">
        <div className="dl-hero-copy">
          <p className="dl-kicker">Скупка с выездом · Москва и МО</p>
          <h1 className="dl-h1">
            Золото — это деньги,
            <span>не выходя из дома.</span>
          </h1>
          <p className="dl-lead">
            Живой курс офиса, оценка за секунду, курьер к вам. Один шаг — продать.
          </p>
        </div>

        <div className="dl-hero-stage" id="order">
          <div className={`dl-live${quoteFailed ? ' dl-live--err' : ''}`} aria-live="polite">
            {waitingQuote ? (
              <>
                <span className="dl-live-dot dl-live-dot--wait" aria-hidden />
                <span>Загружаем курс Мосбиржи</span>
                <Skel />
              </>
            ) : quoteFailed ? (
              <>
                <span>Курс сейчас недоступен</span>
                <button type="button" className="dl-live-retry" onClick={reload}>Обновить</button>
              </>
            ) : (
              <>
                <span className="dl-live-dot" aria-hidden />
                <span>Курс Мосбиржи</span>
                <b className="mono-nums">{formatPerGram(spot) || '—'}</b>
              </>
            )}
          </div>

          <LiveProbes
            quote={quote}
            grams={activeGrams}
            purity={activePurity}
            onPick={setPurity}
            lockedAmount={lockedAlive ? locked.amount : null}
            lockedPurity={lockedAlive ? locked.purity : null}
            status={status}
          />

          <form className="dl-card" onSubmit={lockedAlive ? onSubmit : (e) => { e.preventDefault(); lockAndOpen(); }}>
            <label className="dl-field">
              <span>Вес, г</span>
              <input
                inputMode="decimal"
                value={gramsText}
                onChange={(e) => setGramsText(e.target.value.replace(/[^\d.,]/g, ''))}
                disabled={lockedAlive}
                aria-label="Вес в граммах"
              />
            </label>
            <div className="dl-chips">
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

            <div className={`dl-sum${lockedAlive ? ' is-locked' : ''}`}>
              <span>{lockedAlive ? 'Зафиксировали' : 'К выплате'}</span>
              <strong className="mono-nums">
                {waitingQuote ? <Skel wide /> : shownAmount != null ? formatMoney(shownAmount) : '—'}
              </strong>
              {lockedAlive ? (
                <em className="dl-timer" aria-live="polite">
                  <b>{formatTimer(left)}</b>
                  <span>курс держим 15 минут</span>
                </em>
              ) : (
                <em>{quoteFailed ? 'Не удалось получить курс' : `Проба ${purity} · ${formatPerGram(perG) || '₽/г'}`}</em>
              )}
            </div>

            {lockedAlive && (
              <div className="dl-lock-fields">
                <label className="dl-field">
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
                <label className="dl-field">
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
                <label className="dl-field">
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
                <input className="dl-hp" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden />
              </div>
            )}

            {error && <p className="dl-err" role="alert">{error}</p>}

            {phase === 'sent' ? (
              <p className="dl-ok">Заявка ушла. Курьер свяжется с вами, чтобы подтвердить визит.</p>
            ) : (
              <button type="submit" className="dl-btn dl-btn--block" disabled={phase === 'sending' || waitingQuote}>
                {ctaLabel}
              </button>
            )}
            <p className="dl-fine">
              Нажимая кнопку, вы соглашаетесь с <a href="/privacy">политикой персональных данных</a>. Для сделки нужен паспорт.
            </p>
          </form>
        </div>
      </section>

      <PathStory />

      <section className="dl-section" id="calc">
        <p className="dl-kicker">Прозрачный расчёт</p>
        <h2 className="dl-h2">Биржа, выплата, разница — без «мутной» скупки.</h2>
        <div className="dl-split">
          <div>
            <span>Биржевой лом</span>
            <b className="mono-nums">{waitingQuote ? <Skel wide /> : scrap != null ? formatMoney(scrap) : '—'}</b>
          </div>
          <div className="is-pay">
            <span>Ваша выплата</span>
            <b className="mono-nums">{waitingQuote ? <Skel wide /> : shownAmount != null ? formatMoney(shownAmount) : '—'}</b>
          </div>
          <div>
            <span>Разница</span>
            <b className="mono-nums">
              {waitingQuote ? <Skel wide /> : scrap != null && shownAmount != null ? formatMoney(Math.max(0, scrap - shownAmount)) : '—'}
            </b>
          </div>
        </div>
        <p className="dl-note">
          Выплата считается по официальному курсу выкупа офиса, не «от потолка». Точная сумма — после проверки пробы и веса курьером.
        </p>
        <a href="#order" className="dl-btn">Продать золото</a>
      </section>

      <section className="dl-section dl-section--alt" id="docs">
        <div className="dl-wrap">
          <p className="dl-kicker">Документы</p>
          <h2 className="dl-h2">Лицензия есть. Паспорт обязателен.</h2>
          <p className="dl-note">
            Работаем по лицензии на скупку драгоценных металлов. Каждая сделка — договор. Паспорт РФ нужен по закону, не «для галочки».
          </p>
          <div className="dl-docs">
            <a href="/docs/license-probpalata.pdf" target="_blank" rel="noopener noreferrer" className="dl-doc">
              <img src="/docs/license-preview.jpg" alt="" width="72" height="96" />
              <span>Лицензия</span>
              <b>Л023-00119-77/04343605</b>
              <em>Пробирная палата · PDF</em>
            </a>
            <a href="/docs/giis-dmdk-registration.pdf" target="_blank" rel="noopener noreferrer" className="dl-doc">
              <span>ГИИС ДМДК</span>
              <b>ЮЛ7701041176</b>
              <em>Спецучёт · PDF</em>
            </a>
            <a
              href="https://knd.gov.ru/registry-entry?registryType=purchasePreciousMetals&id=698c2ad78212522cdf5de5c6"
              target="_blank"
              rel="noopener noreferrer"
              className="dl-doc"
            >
              <span>Реестр</span>
              <b>knd.gov.ru</b>
              <em>Проверить лицензию</em>
            </a>
          </div>
        </div>
      </section>

      <footer className="dl-foot">
        <div className="dl-foot-top">
          <a href="/" className="dl-logo">
            <img src="/logo-reaktivo-mark.svg" alt="" width="28" height="28" />
            <span>REAKTIVO</span>
          </a>
          <a href="tel:+78005551848" className="dl-foot-phone">8 800 555-18-48</a>
        </div>
        <p>Промо доставки. Выкуп, отделения и кабинет — на основном сайте.</p>
        <div className="dl-foot-links">
          <a href="https://reaktivo.ru">Reaktivo.ru</a>
          <a href="https://reaktivo.ru/kurier/">Курьер на Reaktivo.ru</a>
          <a href="/invest">Витрина изделий</a>
          <a href="/pro">Сотрудникам</a>
          <a href="/privacy">Персональные данные</a>
        </div>
      </footer>

      {sticky && <a href="#order" className="dl-sticky">Вызвать курьера</a>}
      <style>{DL_CSS}</style>
    </div>
  );
}

const DL_CSS = `
.dl {
  --dl-bg:#070708;
  --dl-elev:#101114;
  --dl-card:#16171c;
  --dl-red:#dc2a2e;
  --dl-red-2:#c81e22;
  --dl-text:#f4f2ef;
  --dl-muted:#9a9da6;
  --dl-line:rgba(255,255,255,.08);
  --dl-r:20px;
  --dl-r-sm:12px;
  background:var(--dl-bg);
  color:var(--dl-text);
  font-family: Geometria, system-ui, sans-serif;
  min-height:100dvh;
  overflow-x:clip;
  -webkit-font-smoothing:antialiased;
}
.dl *, .dl *::before, .dl *::after { box-sizing:border-box; }
.mono-nums { font-variant-numeric: tabular-nums; font-feature-settings:'tnum' 1; }
.dl-head {
  position:sticky; top:0; z-index:20;
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:10px 16px; padding-top:max(10px, env(safe-area-inset-top));
  background:rgba(7,7,8,.88); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
  border-bottom:1px solid var(--dl-line);
}
.dl-logo { display:flex; align-items:center; gap:10px; color:inherit; text-decoration:none; font-weight:800; letter-spacing:.1em; font-size:.82rem; }
.dl-logo img { border-radius:8px; display:block; }
.dl-logo span span { color:var(--dl-red); }
.dl-head-actions { display:flex; align-items:center; gap:10px; }
.dl-phone { color:var(--dl-muted); text-decoration:none; font-size:.82rem; font-weight:600; white-space:nowrap; }
.dl-btn {
  display:inline-flex; align-items:center; justify-content:center;
  min-height:48px; padding:0 18px; border-radius:14px; border:0;
  background:linear-gradient(180deg, #e23a3e 0%, var(--dl-red-2) 100%);
  color:#fff; font:inherit; font-weight:700; text-decoration:none; cursor:pointer;
  box-shadow:0 10px 24px rgba(200,30,34,.28);
  touch-action:manipulation;
}
.dl-btn:disabled { opacity:.5; box-shadow:none; cursor:not-allowed; }
.dl-btn--sm { min-height:40px; padding:0 14px; font-size:.86rem; border-radius:12px; white-space:nowrap; }
.dl-cta-short { display:none; }
.dl-btn--block { width:100%; min-height:52px; font-size:1.02rem; }
.dl-btn--ghost { background:transparent; border:1px solid var(--dl-line); color:var(--dl-text); box-shadow:none; align-self:flex-start; }
.dl-hero {
  display:grid; gap:28px;
  padding:28px 16px 40px;
  max-width:1120px; margin:0 auto;
}
.dl-kicker { margin:0 0 10px; color:var(--dl-red); font-size:.72rem; font-weight:700; letter-spacing:.16em; text-transform:uppercase; }
.dl-h1 { margin:0 0 14px; font-size:clamp(2.05rem, 8.4vw, 3.55rem); line-height:.98; letter-spacing:-.045em; font-weight:800; color:var(--dl-text); }
.dl-h1 span { display:block; color:#fff; }
.dl-h2 { margin:0 0 12px; font-size:clamp(1.45rem, 5.4vw, 2.05rem); line-height:1.12; letter-spacing:-.03em; color:var(--dl-text); font-weight:800; }
.dl-lead { margin:0; color:var(--dl-muted); font-size:1.02rem; line-height:1.5; max-width:36rem; }
.dl-hero-stage { min-width:0; }
.dl-live {
  display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  min-height:36px; margin-bottom:12px;
  color:var(--dl-muted); font-size:.8rem;
}
.dl-live b { color:var(--dl-text); min-width:7.5ch; }
.dl-live--err { color:#ff8b8b; }
.dl-live-retry {
  appearance:none; border:1px solid rgba(255,139,139,.35); background:transparent;
  color:#fff; border-radius:999px; min-height:32px; padding:0 12px; font:inherit; cursor:pointer;
}
.dl-live-dot { width:8px; height:8px; border-radius:50%; background:#3dff8a; box-shadow:0 0 0 4px rgba(61,255,138,.14); animation:dlPulse 1.6s ease infinite; flex-shrink:0; }
.dl-live-dot--wait { background:#8d9099; box-shadow:none; animation:none; }
@keyframes dlPulse { 50% { opacity:.4; } }
.dl-skel {
  display:inline-block; height:0.9em; width:7.2ch; border-radius:6px; vertical-align:middle;
  background:linear-gradient(90deg, rgba(255,255,255,.06), rgba(255,255,255,.14), rgba(255,255,255,.06));
  background-size:200% 100%; animation:dlShimmer 1.2s ease infinite;
}
.dl-skel--wide { width:9.5ch; }
@keyframes dlShimmer { 50% { background-position:-120% 0; } }
.dl-probes { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-bottom:12px; }
.dl-probe {
  display:flex; flex-direction:column; gap:6px; min-height:96px;
  padding:12px 10px; border-radius:16px;
  border:1px solid var(--dl-line); background:var(--dl-card);
  color:inherit; text-align:left; cursor:pointer; font:inherit;
}
.dl-probe:disabled { cursor:default; }
.dl-probe.is-on { border-color:var(--dl-red); background:rgba(220,42,46,.12); box-shadow:inset 0 0 0 1px var(--dl-red); }
.dl-probes.is-flash .dl-probe-g { color:var(--dl-red); }
.dl-probe-k { font-size:.68rem; color:var(--dl-muted); letter-spacing:.06em; text-transform:uppercase; }
.dl-probe-g { font-size:.78rem; font-weight:700; min-height:1.2em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dl-probe-s { font-size:.98rem; font-weight:800; min-height:1.25em; letter-spacing:-.02em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dl-card {
  display:flex; flex-direction:column; gap:12px;
  padding:18px; border-radius:var(--dl-r);
  background:var(--dl-card);
  border:1px solid var(--dl-line);
  box-shadow:0 24px 60px rgba(0,0,0,.35);
}
.dl-field { display:flex; flex-direction:column; gap:6px; }
.dl-field span { font-size:.72rem; color:var(--dl-muted); font-weight:600; letter-spacing:.04em; text-transform:uppercase; }
.dl-field input {
  min-height:48px; padding:0 12px; border-radius:var(--dl-r-sm);
  border:1px solid var(--dl-line); background:#0c0d10; color:var(--dl-text);
  font:inherit; font-size:16px; width:100%;
}
.dl-field input:focus { outline:2px solid rgba(220,42,46,.45); outline-offset:1px; }
.dl-field input[aria-invalid='true'] { border-color:#ff6b6b; }
.dl-field-err { margin:0; color:#ff8b8b; font-size:.78rem; font-weight:600; }
.dl-chips { display:flex; gap:8px; flex-wrap:wrap; }
.dl-chips button {
  min-height:36px; padding:0 12px; border-radius:999px;
  border:1px solid var(--dl-line); background:transparent; color:var(--dl-muted);
  font:inherit; cursor:pointer; touch-action:manipulation;
}
.dl-chips button.is-on { border-color:var(--dl-red); color:#fff; background:rgba(220,42,46,.16); }
.dl-sum { padding:8px 0 2px; min-height:5.6rem; }
.dl-sum span, .dl-sum > em { display:block; color:var(--dl-muted); font-size:.8rem; font-style:normal; }
.dl-sum strong { display:block; font-size:clamp(1.7rem, 7vw, 2.15rem); letter-spacing:-.04em; line-height:1.1; min-height:1.15em; }
.dl-sum.is-locked strong { color:#fff; }
.dl-timer { display:flex !important; align-items:baseline; gap:10px; margin-top:8px; }
.dl-timer b {
  font-style:normal; font-size:1.05rem; color:#fff;
  padding:4px 10px; border-radius:999px; background:rgba(220,42,46,.18);
  border:1px solid rgba(220,42,46,.4); letter-spacing:.06em;
}
.dl-lock-fields { display:flex; flex-direction:column; gap:12px; padding-top:4px; border-top:1px solid var(--dl-line); }
.dl-err { margin:0; color:#ff6b6b; font-size:.88rem; font-weight:600; }
.dl-ok { margin:0; color:#8dffb4; font-weight:700; }
.dl-fine { margin:0; color:var(--dl-muted); font-size:.75rem; line-height:1.45; }
.dl-fine a { color:#fff; }
.dl-hp { position:absolute; left:-9999px; height:0; width:0; opacity:0; pointer-events:none; }
.dl-path { height:170vh; background:var(--dl-bg); }
.dl-path--static { height:auto; }
.dl-path-sticky {
  position:sticky; top:56px;
  min-height:calc(100dvh - 56px);
  padding:20px 16px 28px;
  display:flex; flex-direction:column; justify-content:center;
  background:
    radial-gradient(900px 280px at 50% 0%, rgba(200,30,34,.16), transparent 58%),
    var(--dl-bg);
}
.dl-path-inner { width:100%; display:flex; flex-direction:column; gap:14px; }
.dl-path--static .dl-path-sticky { position:relative; top:auto; min-height:0; }
.dl-path-title { margin:0; font-size:clamp(1.8rem, 8vw, 3.1rem); letter-spacing:-.04em; font-weight:800; color:#fff; min-height:1.15em; }
.dl-path-text { margin:0; max-width:32rem; color:var(--dl-muted); line-height:1.5; min-height:3em; }
.dl-route { position:relative; width:100%; display:flex; justify-content:center; }
.dl-route-svg { height:220px; width:auto; max-width:100%; display:block; overflow:visible; }
.dl-progress {
  display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px;
  list-style:none; margin:0; padding:0;
}
.dl-progress li { display:flex; flex-direction:column; gap:8px; min-width:0; }
.dl-progress li i { display:block; height:4px; border-radius:99px; background:#24252b; }
.dl-progress li span { font-size:.72rem; color:var(--dl-muted); line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dl-progress li.is-on i { background:var(--dl-red); }
.dl-progress li.is-on span { color:#fff; }
.dl-section { padding:48px 16px; max-width:860px; margin:0 auto; }
.dl-section--alt { background:var(--dl-elev); max-width:none; padding:48px 16px; }
.dl-wrap { max-width:860px; margin:0 auto; }
.dl-split { display:grid; gap:8px; margin:18px 0; }
.dl-split div {
  padding:16px 16px 14px; border-radius:16px;
  background:var(--dl-card); border:1px solid var(--dl-line);
  display:flex; justify-content:space-between; align-items:baseline; gap:12px;
}
.dl-split span { color:var(--dl-muted); font-size:.82rem; }
.dl-split b { font-size:1.15rem; letter-spacing:-.02em; min-height:1.2em; }
.dl-split .is-pay { border-color:rgba(220,42,46,.35); }
.dl-split .is-pay b { color:#fff; }
.dl-note { color:var(--dl-muted); line-height:1.55; margin:0 0 18px; }
.dl-docs { display:grid; gap:10px; margin-top:18px; }
.dl-doc {
  display:flex; flex-direction:column; gap:4px; padding:16px;
  border-radius:16px; border:1px solid var(--dl-line); background:var(--dl-card);
  color:inherit; text-decoration:none; min-width:0; min-height:148px;
}
.dl-doc img { width:56px; height:74px; object-fit:cover; border-radius:8px; margin-bottom:8px; background:#0c0d10; }
.dl-doc:not(:has(img))::before {
  content:'PDF';
  display:inline-flex; align-items:center; justify-content:center;
  width:44px; height:44px; margin-bottom:10px; border-radius:10px;
  background:rgba(220,42,46,.12); color:var(--dl-red);
  font-size:.72rem; font-weight:800; letter-spacing:.08em;
}
.dl-doc span { color:var(--dl-red); font-size:.68rem; letter-spacing:.12em; text-transform:uppercase; }
.dl-doc b { font-size:.95rem; overflow-wrap:anywhere; }
.dl-doc em { color:var(--dl-muted); font-style:normal; font-size:.8rem; }
.dl-foot {
  padding:36px 16px calc(108px + env(safe-area-inset-bottom));
  border-top:1px solid var(--dl-line);
  display:flex; flex-direction:column; gap:12px;
  max-width:1120px; margin:0 auto;
}
.dl-foot-top { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.dl-foot-phone { color:#fff; text-decoration:none; font-weight:700; }
.dl-foot p { margin:0; color:var(--dl-muted); max-width:36rem; line-height:1.5; }
.dl-foot-links { display:flex; flex-wrap:wrap; gap:10px 16px; }
.dl-foot-links a { color:#fff; text-decoration:none; border-bottom:1px solid rgba(255,255,255,.2); }
.dl-sticky {
  position:fixed; left:12px; right:12px; bottom:max(12px, env(safe-area-inset-bottom));
  z-index:30; display:flex; align-items:center; justify-content:center;
  min-height:52px; border-radius:16px;
  background:linear-gradient(180deg, #e23a3e 0%, var(--dl-red-2) 100%);
  color:#fff; font-weight:800; text-decoration:none;
  box-shadow:0 12px 40px rgba(200,30,34,.4);
}
@media (max-width:520px) {
  .dl-phone { display:none; }
}
@media (max-width:379px) {
  .dl-probe { padding:10px 8px; min-height:90px; }
  .dl-probe-s { font-size:.82rem; }
  .dl-progress li span { font-size:.64rem; }
  .dl-cta-full { display:none; }
  .dl-cta-short { display:inline; }
}
@media (min-width:768px) {
  .dl-hero { padding:40px 24px 56px; }
  .dl-split { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .dl-split div { flex-direction:column; align-items:flex-start; gap:8px; min-height:96px; }
  .dl-docs { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .dl-path { height:150vh; }
  .dl-route-svg { height:210px; width:100%; }
  .dl-sticky { display:none; }
  .dl-foot { padding:40px 24px 48px; }
  .dl-section, .dl-section--alt { padding:64px 24px; }
}
@media (min-width:960px) {
  .dl-hero { grid-template-columns:minmax(0,1fr) minmax(360px, 440px); align-items:center; gap:56px; padding:52px 24px 72px; }
  .dl-h1 { font-size:clamp(2.8rem, 4.6vw, 4rem); }
}
@media (prefers-reduced-motion: reduce) {
  .dl-live-dot, .dl-skel { animation:none; }
}
`;
