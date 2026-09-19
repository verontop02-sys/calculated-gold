import { useEffect, useMemo, useRef, useState } from 'react';
import { useMotionValueEvent, useScroll } from 'motion/react';
import { clientApi } from './api.js';
import { quotePerGram, quotePayout } from './calc.js';
import { formatMoney, isRuPhone, useGoldQuote } from './ru/RuShared.jsx';
import { pickNextCourierSlot } from './ru/kurierSlots.js';
import { ruHref } from './ru/ruSite.js';
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

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function formatPerGram(n) {
  if (n == null || !Number.isFinite(n)) return '· · ·';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n)} ₽/г`;
}

function formatTimer(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function useLockCountdown(lockedUntil) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!lockedUntil) {
      setLeft(0);
      return undefined;
    }
    const tick = () => setLeft(Math.max(0, lockedUntil - Date.now()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [lockedUntil]);
  return left;
}

function PathStory() {
  const pinRef = useRef(null);
  const deskPathRef = useRef(null);
  const mobPathRef = useRef(null);
  const bagRef = useRef(null);
  const [step, setStep] = useState(0);
  const [reduced, setReduced] = useState(false);
  const { scrollYProgress } = useScroll({
    target: pinRef,
    offset: ['start start', 'end end'],
  });

  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);

  useEffect(() => {
    const paths = [deskPathRef.current, mobPathRef.current].filter(Boolean);
    for (const path of paths) {
      const len = path.getTotalLength();
      path.style.strokeDasharray = String(len);
      path.style.strokeDashoffset = reduced ? '0' : String(len);
    }
  }, [reduced]);

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    if (reduced) return;
    const idx = v < 0.22 ? 0 : v < 0.48 ? 1 : v < 0.74 ? 2 : 3;
    setStep(idx);
    const mobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
    const path = mobile ? mobPathRef.current : deskPathRef.current;
    const bag = bagRef.current;
    if (!path || !bag) return;
    const len = path.getTotalLength();
    path.style.strokeDashoffset = String(len * (1 - v));
    const p = path.getPointAtLength(Math.min(0.999, Math.max(0, v)) * len);
    const svg = path.ownerSVGElement;
    const box = svg?.viewBox?.baseVal;
    if (!box) return;
    bag.style.left = `${(p.x / box.width) * 100}%`;
    bag.style.top = `${(p.y / box.height) * 100}%`;
    const tilt = Math.sin(v * Math.PI * 2) * 16;
    const scale = 1.05 + 0.18 * Math.sin(v * Math.PI);
    bag.style.transform = `translate(-50%, -50%) rotate(${tilt}deg) scale(${scale})`;
  });

  const copy = STEPS[reduced ? 3 : step];

  return (
    <section className={`dl-path${reduced ? ' dl-path--static' : ''}`} ref={pinRef} aria-label="Путь красного R">
      <div className="dl-path-sticky">
        <p className="dl-kicker">Как это работает</p>
        <h2 className="dl-path-title">{copy.title}</h2>
        <p className="dl-path-text">{copy.text}</p>

        <div className="dl-route" aria-hidden={false}>
          <svg className="dl-route-svg dl-route-svg--desk" viewBox="0 0 1000 360" fill="none" aria-hidden>
            <path d="M80 210 C 220 70, 320 310, 500 190 S 760 70, 920 200" stroke="rgba(255,255,255,0.12)" strokeWidth="3" strokeDasharray="7 10" />
            <path ref={deskPathRef} d="M80 210 C 220 70, 320 310, 500 190 S 760 70, 920 200" stroke="#ff2a2a" strokeWidth="4" strokeLinecap="round" />
            {[[80, 210], [500, 190], [760, 120], [920, 200]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={reduced || i <= step ? 9 : 6} fill={reduced || i <= step ? '#ff2a2a' : '#2a2b31'} stroke="#fff" strokeWidth="2" />
            ))}
          </svg>
          <svg className="dl-route-svg dl-route-svg--mob" viewBox="0 0 320 720" fill="none" aria-hidden>
            <path d="M160 48 C 48 160, 272 260, 160 360 S 48 540, 160 668" stroke="rgba(255,255,255,0.12)" strokeWidth="3" strokeDasharray="7 10" />
            <path ref={mobPathRef} d="M160 48 C 48 160, 272 260, 160 360 S 48 540, 160 668" stroke="#ff2a2a" strokeWidth="4" strokeLinecap="round" />
            {[[160, 48], [160, 360], [88, 520], [160, 668]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={reduced || i <= step ? 9 : 6} fill={reduced || i <= step ? '#ff2a2a' : '#2a2b31'} stroke="#fff" strokeWidth="2" />
            ))}
          </svg>
          <div ref={bagRef} className={`dl-bag${reduced ? ' dl-bag--end' : ''}`}>
            <img src="/logo-reaktivo-mark.svg" alt="" width="44" height="44" />
          </div>
        </div>

        <ol className="dl-progress" aria-label="Этапы доставки">
          {STEPS.map((s, i) => (
            <li key={s.title} className={reduced || i <= step ? 'is-on' : ''}>
              <span>{s.title}</span>
            </li>
          ))}
        </ol>
        <a href="#order" className="dl-btn dl-btn--ghost">Вызвать курьера</a>
      </div>
    </section>
  );
}

function LiveProbes({ quote, grams, purity, onPick }) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(null);
  const spot = quote?.goldRubPerGram;

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
        const sum = quotePayout(quote, p, grams);
        const on = p === purity;
        return (
          <button
            key={p}
            type="button"
            className={`dl-probe${on ? ' is-on' : ''}`}
            onClick={() => onPick(p)}
            aria-pressed={on}
          >
            <span className="dl-probe-k">{p}</span>
            <span className="dl-probe-g mono-nums">{formatPerGram(perG)}</span>
            <span className="dl-probe-s mono-nums">{sum != null ? formatMoney(sum) : '—'}</span>
          </button>
        );
      })}
    </div>
  );
}

export function DeliveryLanding() {
  const quote = useGoldQuote();
  const [grams, setGrams] = useState(10);
  const [purity, setPurity] = useState(585);
  const [locked, setLocked] = useState(null);
  const [city, setCity] = useState('Москва');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const [sticky, setSticky] = useState(false);
  const left = useLockCountdown(locked?.until);

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
    document.body.style.background = '#070708';
    return () => {
      if (prevTheme) html.setAttribute('data-theme', prevTheme);
      document.body.style.background = prevBg;
    };
  }, []);

  useEffect(() => {
    const target = document.getElementById('order');
    if (!target) return undefined;
    let formInView = true;
    const recompute = () => setSticky(!formInView && window.scrollY > 420);
    const io = new IntersectionObserver(([entry]) => {
      formInView = entry.isIntersecting;
      recompute();
    }, { rootMargin: '0px 0px -20% 0px' });
    io.observe(target);
    window.addEventListener('scroll', recompute, { passive: true });
    return () => { io.disconnect(); window.removeEventListener('scroll', recompute); };
  }, []);

  const payout = useMemo(() => quotePayout(quote, purity, grams), [quote, purity, grams]);
  const perG = useMemo(() => quotePerGram(quote, purity), [quote, purity]);
  const spot = Number(quote?.goldRubPerGram) || 0;
  const scrap = spot > 0 ? spot * (purity / 1000) * Number(grams) : null;
  const lockedAlive = Boolean(locked && left > 0);
  const shownAmount = lockedAlive ? locked.amount : payout;

  useEffect(() => {
    if (locked && left <= 0) {
      setLocked(null);
      if (phase === 'idle') setError('15 минут истекли — курс обновился. Зафиксируйте сумму ещё раз.');
    }
  }, [locked, left, phase]);

  function lockAndOpen() {
    setError('');
    if (payout == null || payout <= 0) {
      setError('Курс ещё загружается. Подождите секунду.');
      return;
    }
    setLocked({
      amount: Math.round(payout),
      purity,
      grams: Number(grams),
      perGram: perG,
      until: Date.now() + LOCK_MS,
    });
    document.getElementById('order')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (phase === 'sending') return;
    setError('');
    if (String(website || '').trim()) {
      setPhase('sent');
      return;
    }
    if (!lockedAlive) {
      setError('Сначала зафиксируйте сумму — курс держим 15 минут.');
      return;
    }
    if (String(city || '').trim().length < 2) {
      setError('Укажите город');
      return;
    }
    if (String(address || '').trim().length < 5) {
      setError('Укажите адрес для курьера');
      return;
    }
    if (!isRuPhone(phone)) {
      setError('Укажите номер телефона, без него мы не сможем связаться');
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
      if (slot) {
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
      } else {
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
    } catch (err) {
      setPhase('idle');
      setError(err?.message || 'Не получилось отправить. Позвоните: 8 800 555-18-48');
    }
  }

  return (
    <div className="dl">
      <header className="dl-head">
        <a href="/" className="dl-logo" aria-label="Reaktivo.pro">
          <img src="/logo-reaktivo-mark.svg" alt="" width="36" height="36" />
          <span>REAKTIVO<span>.PRO</span></span>
        </a>
        <a href="#order" className="dl-btn dl-btn--sm">Вызвать курьера</a>
      </header>

      <section className="dl-hero" id="order">
        <p className="dl-kicker">Доставка золота · скупка с выездом</p>
        <h1 className="dl-h1">Золото — это деньги,<br />не выходя из дома.</h1>
        <p className="dl-lead">
          Живой биржевой курс, оценка за секунду, курьер к вам. Один шаг — продать.
        </p>

        <div className="dl-live">
          <span className="dl-live-dot" aria-hidden />
          <span>Курс Мосбиржи обновляется</span>
          <b className="mono-nums">{spot > 0 ? formatPerGram(spot) : 'загрузка…'}</b>
        </div>

        <LiveProbes quote={quote} grams={grams} purity={purity} onPick={setPurity} />

        <form className="dl-card" onSubmit={lockedAlive ? onSubmit : (e) => { e.preventDefault(); lockAndOpen(); }}>
          <label className="dl-field">
            <span>Вес, г</span>
            <input
              inputMode="decimal"
              value={grams}
              onChange={(e) => {
                const n = Number(String(e.target.value).replace(',', '.'));
                setGrams(Number.isFinite(n) ? Math.min(5000, Math.max(0, n)) : 0);
              }}
              disabled={lockedAlive}
            />
          </label>
          <div className="dl-chips">
            {WEIGHT_CHIPS.map((w) => (
              <button key={w} type="button" className={Number(grams) === w ? 'is-on' : ''} disabled={lockedAlive} onClick={() => setGrams(w)}>
                {w} г
              </button>
            ))}
          </div>

          <div className="dl-sum">
            <span>{lockedAlive ? 'Зафиксировали' : 'К выплате'}</span>
            <strong className="mono-nums">{shownAmount != null ? formatMoney(shownAmount) : '—'}</strong>
            {lockedAlive ? (
              <em>Курс держим {formatTimer(left)}</em>
            ) : (
              <em>Проба {purity} · {formatPerGram(perG)}</em>
            )}
          </div>

          {lockedAlive && (
            <>
              <label className="dl-field">
                <span>Город</span>
                <input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
              </label>
              <label className="dl-field">
                <span>Адрес</span>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Улица, дом, квартира" autoComplete="street-address" />
              </label>
              <label className="dl-field">
                <span>Телефон</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 9XX XXX-XX-XX" inputMode="tel" autoComplete="tel" />
              </label>
              <input className="dl-hp" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden />
            </>
          )}

          {error && <p className="dl-err">{error}</p>}

          {phase === 'sent' ? (
            <p className="dl-ok">Заявка ушла. Курьер свяжется с вами, чтобы подтвердить визит.</p>
          ) : (
            <button type="submit" className="dl-btn dl-btn--block" disabled={phase === 'sending'}>
              {phase === 'sending' ? 'Отправляем…' : lockedAlive ? 'Вызвать курьера' : 'Вызвать курьера на эту сумму'}
            </button>
          )}
          <p className="dl-fine">
            Нажимая кнопку, вы соглашаетесь с <a href="/privacy">политикой персональных данных</a>. Для сделки нужен паспорт.
          </p>
        </form>
      </section>

      <PathStory />

      <section className="dl-section" id="calc">
        <p className="dl-kicker">Прозрачный расчёт</p>
        <h2 className="dl-h2">Биржа, выплата, разница — без «мутной» скупки.</h2>
        <div className="dl-split">
          <div>
            <span>Биржевой лом</span>
            <b className="mono-nums">{scrap != null ? formatMoney(scrap) : '—'}</b>
          </div>
          <div>
            <span>Ваша выплата</span>
            <b className="mono-nums">{shownAmount != null ? formatMoney(shownAmount) : '—'}</b>
          </div>
          <div>
            <span>Разница</span>
            <b className="mono-nums">
              {scrap != null && shownAmount != null ? formatMoney(Math.max(0, scrap - shownAmount)) : '—'}
            </b>
          </div>
        </div>
        <p className="dl-note">
          Выплата считается по официальному курсу выкупа офиса, не «от потолка». Точная сумма — после проверки пробы и веса курьером.
        </p>
        <a href="#order" className="dl-btn">Продать золото</a>
      </section>

      <section className="dl-section dl-section--alt" id="docs">
        <p className="dl-kicker">Документы</p>
        <h2 className="dl-h2">Лицензия есть. Паспорт обязателен.</h2>
        <p className="dl-note">
          Работаем по лицензии на скупку драгоценных металлов. Каждая сделка — договор. Паспорт РФ нужен по закону, не «для галочки».
        </p>
        <div className="dl-docs">
          <a href="/docs/license-probpalata.pdf" target="_blank" rel="noopener noreferrer" className="dl-doc">
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
      </section>

      <footer className="dl-foot">
        <a href="/" className="dl-logo">
          <img src="/logo-reaktivo-mark.svg" alt="" width="32" height="32" />
          <span>REAKTIVO</span>
        </a>
        <p>Промо доставки. Основной сайт выкупа, отделения и кабинета — на Reaktivo.ru</p>
        <div className="dl-foot-links">
          <a href="https://reaktivo.ru">Reaktivo.ru</a>
          <a href={ruHref('kurier')}>Курьер на основном сайте</a>
          <a href="/invest">Витрина изделий</a>
          <a href="/pro?staff">Сотрудникам</a>
          <a href="tel:+78005551848">8 800 555-18-48</a>
          <a href="/privacy">Персональные данные</a>
        </div>
      </footer>

      {sticky && <a href="#order" className="dl-sticky">Вызвать курьера</a>}
      <style>{DL_CSS}</style>
    </div>
  );
}

const DL_CSS = `
.dl { --dl-bg:#070708; --dl-card:#121316; --dl-red:#ff2a2a; --dl-text:#f3f1ee; --dl-muted:#8d9099; --dl-line:rgba(255,255,255,.1); background:var(--dl-bg); color:var(--dl-text); font-family: Geometria, system-ui, sans-serif; min-height:100dvh; overflow-x:hidden; }
.dl * { box-sizing:border-box; }
.mono-nums { font-variant-numeric: tabular-nums; }
.dl-head { position:sticky; top:0; z-index:20; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 18px; background:rgba(7,7,8,.86); backdrop-filter:blur(12px); border-bottom:1px solid var(--dl-line); }
.dl-logo { display:flex; align-items:center; gap:10px; color:inherit; text-decoration:none; font-weight:800; letter-spacing:.08em; }
.dl-logo span span { color:var(--dl-red); }
.dl-btn { display:inline-flex; align-items:center; justify-content:center; min-height:48px; padding:0 18px; border-radius:14px; border:0; background:var(--dl-red); color:#fff; font:inherit; font-weight:700; text-decoration:none; cursor:pointer; }
.dl-btn:disabled { opacity:.55; }
.dl-btn--sm { min-height:40px; padding:0 14px; font-size:.9rem; }
.dl-btn--block { width:100%; min-height:52px; font-size:1.05rem; }
.dl-btn--ghost { background:transparent; border:1px solid var(--dl-line); color:var(--dl-text); }
.dl-hero { padding:36px 18px 48px; max-width:560px; margin:0 auto; }
.dl-kicker { margin:0 0 10px; color:var(--dl-red); font-size:.78rem; font-weight:700; letter-spacing:.14em; text-transform:uppercase; }
.dl-h1 { margin:0 0 12px; font-size:clamp(2rem, 9vw, 3.4rem); line-height:.95; letter-spacing:-.04em; }
.dl-h2 { margin:0 0 14px; font-size:clamp(1.5rem, 6vw, 2.2rem); line-height:1.1; }
.dl-lead { margin:0 0 22px; color:var(--dl-muted); font-size:1.05rem; line-height:1.45; }
.dl-live { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:14px; color:var(--dl-muted); font-size:.82rem; }
.dl-live b { color:var(--dl-text); }
.dl-live-dot { width:8px; height:8px; border-radius:50%; background:#3dff8a; box-shadow:0 0 0 4px rgba(61,255,138,.15); animation:dlPulse 1.6s ease infinite; }
@keyframes dlPulse { 50% { opacity:.45; } }
.dl-probes { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:14px; }
.dl-probe { display:flex; flex-direction:column; gap:4px; padding:12px 10px; border-radius:16px; border:1px solid var(--dl-line); background:var(--dl-card); color:inherit; text-align:left; cursor:pointer; font:inherit; }
.dl-probe.is-on { border-color:var(--dl-red); background:rgba(255,42,42,.1); }
.dl-probes.is-flash .dl-probe-g { color:var(--dl-red); }
.dl-probe-k { font-size:.72rem; color:var(--dl-muted); letter-spacing:.08em; }
.dl-probe-g { font-size:.82rem; font-weight:700; }
.dl-probe-s { font-size:.92rem; font-weight:800; }
.dl-card { display:flex; flex-direction:column; gap:10px; padding:18px; border-radius:22px; background:var(--dl-card); border:1px solid var(--dl-line); }
.dl-field { display:flex; flex-direction:column; gap:6px; }
.dl-field span { font-size:.75rem; color:var(--dl-muted); font-weight:600; }
.dl-field input { min-height:46px; padding:0 12px; border-radius:12px; border:1px solid var(--dl-line); background:#0c0d10; color:var(--dl-text); font:inherit; }
.dl-chips { display:flex; gap:8px; flex-wrap:wrap; }
.dl-chips button { min-height:36px; padding:0 12px; border-radius:999px; border:1px solid var(--dl-line); background:transparent; color:var(--dl-muted); font:inherit; cursor:pointer; }
.dl-chips button.is-on { border-color:var(--dl-red); color:#fff; }
.dl-sum { padding:14px 0 6px; }
.dl-sum span, .dl-sum em { display:block; color:var(--dl-muted); font-size:.8rem; font-style:normal; }
.dl-sum strong { display:block; font-size:2rem; letter-spacing:-.03em; }
.dl-err { margin:0; color:#ff6b6b; font-size:.88rem; font-weight:600; }
.dl-ok { margin:0; color:#8dffb4; font-weight:700; }
.dl-fine { margin:0; color:var(--dl-muted); font-size:.75rem; }
.dl-fine a { color:#fff; }
.dl-hp { position:absolute; left:-9999px; height:0; opacity:0; }
.dl-path { height:280vh; }
.dl-path-sticky { position:sticky; top:0; min-height:100dvh; padding:24px 18px 32px; display:flex; flex-direction:column; justify-content:center; gap:10px; background:radial-gradient(1200px 400px at 50% 20%, rgba(255,42,42,.18), transparent 55%), var(--dl-bg); }
.dl-path-title { margin:0; font-size:clamp(2.2rem, 10vw, 4rem); letter-spacing:-.04em; }
.dl-path-text { margin:0 0 8px; max-width:28rem; color:var(--dl-muted); }
.dl-route { position:relative; width:100%; margin:8px 0 12px; }
.dl-route-svg { width:100%; height:auto; display:block; }
.dl-route-svg--desk { display:none; }
.dl-route-svg--mob { display:block; }
.dl-bag { position:absolute; left:50%; top:8%; width:58px; height:58px; border-radius:18px; background:linear-gradient(160deg,#ff3b42,#9c0000); display:flex; align-items:center; justify-content:center; box-shadow:0 10px 30px rgba(255,0,0,.35); will-change:left,top,transform; }
.dl-bag img { width:34px; height:34px; }
.dl-path--static .dl-bag--end { left:50%; top:92%; transform:translate(-50%,-50%); }
.dl-progress { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; list-style:none; margin:0; padding:0; }
.dl-progress li { height:6px; border-radius:99px; background:#24252b; overflow:hidden; }
.dl-progress li span { display:block; margin-top:10px; font-size:.68rem; color:var(--dl-muted); }
.dl-progress li.is-on { background:var(--dl-red); }
.dl-progress li.is-on span { color:#fff; }
.dl-section { padding:56px 18px; max-width:720px; margin:0 auto; }
.dl-section--alt { background:#0c0d10; max-width:none; padding:56px 18px; }
.dl-section--alt > * { max-width:720px; margin-left:auto; margin-right:auto; }
.dl-split { display:grid; gap:10px; margin:18px 0; }
.dl-split div { padding:16px; border-radius:16px; background:var(--dl-card); border:1px solid var(--dl-line); display:flex; justify-content:space-between; gap:12px; }
.dl-split span { color:var(--dl-muted); }
.dl-note { color:var(--dl-muted); line-height:1.5; }
.dl-docs { display:grid; gap:10px; margin-top:18px; }
.dl-doc { display:flex; flex-direction:column; gap:4px; padding:16px; border-radius:16px; border:1px solid var(--dl-line); background:var(--dl-card); color:inherit; text-decoration:none; }
.dl-doc span { color:var(--dl-red); font-size:.72rem; letter-spacing:.12em; text-transform:uppercase; }
.dl-foot { padding:40px 18px 110px; border-top:1px solid var(--dl-line); display:flex; flex-direction:column; gap:12px; }
.dl-foot p { margin:0; color:var(--dl-muted); }
.dl-foot-links { display:flex; flex-wrap:wrap; gap:10px 16px; }
.dl-foot-links a { color:#fff; }
.dl-sticky { position:fixed; left:16px; right:16px; bottom:16px; z-index:30; display:flex; align-items:center; justify-content:center; min-height:52px; border-radius:16px; background:var(--dl-red); color:#fff; font-weight:800; text-decoration:none; box-shadow:0 12px 40px rgba(255,0,0,.35); }
@media (min-width:721px) {
  .dl-hero, .dl-section, .dl-section--alt > * { max-width:860px; }
  .dl-h1 { font-size:4.2rem; }
  .dl-split { grid-template-columns:repeat(3,1fr); }
  .dl-docs { grid-template-columns:repeat(3,1fr); }
  .dl-route-svg--desk { display:block; }
  .dl-route-svg--mob { display:none; }
  .dl-path { height:240vh; }
  .dl-sticky { display:none; }
  .dl-foot { padding-bottom:40px; }
}
@media (prefers-reduced-motion: reduce) {
  .dl-live-dot { animation:none; }
  .dl-bag { transition:none; }
}
`;
