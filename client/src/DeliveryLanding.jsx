import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { clientApi } from './api.js';
import { quotePerGram, quotePayout } from './calc.js';
import {
  CSS as IL_CSS,
  Magnetic,
  Reveal,
  staggerChild,
  staggerParent,
} from './InvestLanding.jsx';
import {
  RL_CSS,
  RuAtmosphere,
  RuFullHero,
  RuSbpBadge,
  formatMoney,
  isRuPhone,
} from './ru/RuShared.jsx';
import { pickNextCourierSlot } from './ru/kurierSlots.js';
import { useToast } from './ToastContext.jsx';
import { ymReachGoal } from './yandexMetrika.js';

const PROBES = [585, 750, 999];
const WEIGHT_CHIPS = [5, 10, 20, 50];
const LOCK_MS = 15 * 60 * 1000;

const STEPS = [
  { n: '01', title: 'Заявка', text: 'Считаете сумму на сайте, фиксируете курс на 15 минут и вызываете курьера — без поездки в отделение.' },
  { n: '02', title: 'Курьер', text: 'Приезжает к вам домой или в офис в удобное время. Проверка пробы и веса — при вас.' },
  { n: '03', title: 'Проверка', text: 'Реактив и, если нужно, спектральный анализ. Вы видите тот же результат, что и эксперт.' },
  { n: '04', title: 'Деньги', text: 'Выплата сразу: наличные или СБП. Золото становится деньгами, не выходя из дома.' },
];

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
    const html = document.documentElement;
    const prevTheme = html.getAttribute('data-theme');
    html.setAttribute('data-theme', 'dark');
    return () => {
      if (prevTheme) html.setAttribute('data-theme', prevTheme);
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
            <span className="il-card-live il-card-live--ok mono-nums"><i />{formatPerGram(spot) || '—'}</span>
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
              {waitingQuote ? <Skel wide /> : shownAmount != null ? formatMoney(shownAmount) : '—'}
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
            <p className="il-lead-ok">Заявка ушла. Курьер свяжется с вами, чтобы подтвердить визит.</p>
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

        <section className="il-section" id="steps">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Как это работает</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Путь золота от заявки до денег</h2></Reveal>
            </div>
            <motion.div className="il-steps" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-10% 0px' }}>
              {STEPS.map((s, i) => (
                <motion.div className="il-step" key={s.n} variants={staggerChild}>
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

        <section className="il-section il-section--alt" id="calc">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Прозрачный расчёт</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Биржа, выплата, разница —<br /><span className="il-accent-text">без «мутной» скупки</span></h2></Reveal>
            </div>
            <motion.div className="il-cards" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
              <motion.div className="il-card" variants={staggerChild}>
                <span className="il-card-label">Биржевой лом</span>
                <div className="il-card-big mono-nums">{waitingQuote ? <Skel wide /> : scrap != null ? formatMoney(scrap) : '—'}</div>
                <p className="il-card-text">Стоимость чистого золота по текущему биржевому курсу, без вычетов.</p>
              </motion.div>
              <motion.div className="il-card" variants={staggerChild}>
                <span className="il-card-label">Ваша выплата</span>
                <div className="il-card-big mono-nums">{waitingQuote ? <Skel wide /> : shownAmount != null ? formatMoney(shownAmount) : '—'}</div>
                <p className="il-card-text">Сумма, которую вы получите от курьера — наличными или через СБП.</p>
              </motion.div>
              <motion.div className="il-card" variants={staggerChild}>
                <span className="il-card-label">Разница</span>
                <div className="il-card-big mono-nums">
                  {waitingQuote ? <Skel wide /> : scrap != null && shownAmount != null ? formatMoney(Math.max(0, scrap - shownAmount)) : '—'}
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
              <a href="#steps" className="il-nav-link">Как это работает</a>
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
.dl2-calc-note { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; margin-top: 32px; padding-top: 28px; border-top: 1px solid var(--stroke-soft); }
.dl2-calc-note .il-p { max-width: 46ch; }
.dl2-sticky {
  position: fixed; left: 12px; right: 12px; bottom: max(12px, env(safe-area-inset-bottom));
  z-index: 60; display: flex; align-items: center; justify-content: center;
  min-height: 52px; border-radius: 16px;
  background: var(--accent-grad); color: #fff; font-weight: 800; text-decoration: none;
  box-shadow: 0 16px 40px -14px color-mix(in srgb, var(--accent) 55%, transparent);
}
.dl2-cta-short { display: none; }
.dl2-root .il-header-phone { display: flex !important; }
.dl2-root .il-btn--header-buy { display: inline-flex !important; }
@media (min-width: 768px) {
  .dl2-sticky { display: none; }
}
@media (max-width: 900px) {
  .dl2-root .il-header-inner { gap: 10px; padding: 12px 16px; }
  .dl2-root .il-logo-text { font-size: 1.05rem; }
}
@media (max-width: 520px) {
  .dl2-cta-full { display: none; }
  .dl2-cta-short { display: inline; }
  .dl2-root .il-btn--header-buy { padding: 9px 12px; font-size: 0.8rem; }
  .dl2-probe { min-height: 84px; padding: 10px 8px; }
  .dl2-probe-s { font-size: 0.86rem; }
  .dl2-probe-g { font-size: 0.72rem; }
}
@media (max-width: 360px) {
  .dl2-root .il-header-phone { display: none !important; }
}
`;
