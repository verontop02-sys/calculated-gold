import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';
import { CSS as IL_CSS, EASE, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuFaq, RuFooter, RuFullHero, RuGoldTicker, RuHeader, RuKpis, RuMarquee, RuSbpBadge, RuThemedImg, RuTiltCard,
  GramsSlider, formatMoney, isLeadName, isRuPhone, setDraftMeta, useAnimatedNumber, useGoldQuote, useRuLenis,
} from './RuShared.jsx';
import { clientApi } from '../api.js';
import { ymReachGoal } from '../yandexMetrika.js';
import {
  KURIER_WEEKDAYS, formatKurierTimeLabel, getAvailableDays, getCalendarGrid, getMaxTimeStrForDay,
  getMinTimeStrForDay, getQuickTimes, isKurierDayAllowed, isKurierTimeAllowed,
} from './kurierSlots.js';

const STEPS = [
  { n: '01', title: 'Считаете сумму', text: 'Укажите пробу и вес в калькуляторе — увидите точную сумму, которую получите.' },
  { n: '02', title: 'Выбираете время', text: 'Дата, точное время и адрес — форма ниже. Ничего не нужно уточнять по телефону заранее.' },
  { n: '03', title: 'Мы звоним для подтверждения', text: 'За 1–2 часа до визита оператор позвонит, чтобы подтвердить время и адрес.' },
  { n: '04', title: 'Курьер приезжает', text: 'Проверка пробы и веса при вас, оплата сразу — наличными или переводом.' },
];

const BOOK_CITIES = [
  { id: 'Москва', name: 'Москва', hint: 'Курьеры каждый день' },
  { id: 'Санкт-Петербург', name: 'Санкт-Петербург', hint: 'Курьеры каждый день' },
  { id: 'Калининград', name: 'Калининград', hint: 'Курьеры каждый день' },
  { id: 'other', name: 'Другой город', hint: 'Уточним ближайшую дату' },
];

const COMPARE = [
  {
    title: 'Вызов курьера',
    highlight: true,
    points: ['Не нужно никуда ехать', 'Вы сами выбираете дату и точное время', 'Бесплатно в зоне обслуживания', 'Проверка и оплата дома или в офисе'],
  },
  {
    title: 'Визит в отделение',
    points: ['Курс точно такой же', 'Не нужно ждать назначенного окна', 'Подходит, если рядом есть отделение Reaktivo', 'Можно прийти без записи'],
  },
  {
    title: 'Заявка «перезвоним»',
    points: ['Оператор перезванивает и согласует время', 'Чуть дольше: ждёте звонка, а не выбираете сами', 'Подходит, если неудобно заполнять форму', 'Курс всё равно фиксируется на момент визита'],
  },
];

const FAQ = [
  { q: 'Почему сумма именно такая, а не «оценка на глаз»?', a: 'Формула открытая: биржевой курс чистого золота × вес × проба / 1000 × 90%. Курьер на сумму не влияет — вызов бесплатный. Точная выплата фиксируется после проверки пробы при вас, но логика та же, что на сайте.' },
  { q: 'Что если я укажу «другой город»?', a: 'Мы свяжемся с вами, чтобы уточнить ближайшую дату, когда сможем приехать, либо предложим отделение или альтернативный способ сдать золото.' },
  { q: 'Можно ли поменять время после записи?', a: 'Да — оператор позвонит за 1–2 часа до визита для подтверждения, в этот момент можно перенести время.' },
  { q: 'Как определяется проба, если клеймо стёрлось?', a: 'Пробирным реактивом и, при необходимости, спектральным анализом. Всё делается при вас — вы видите тот же результат, что и эксперт.' },
  { q: 'Нужны ли документы?', a: 'Нужен паспорт — это требование закона к самой сделке приёма металла, а не проверка происхождения вещи.' },
  { q: 'Что если я передумаю?', a: 'Продажа не является обязательной: вы всегда можете отказаться или перенести визит — это бесплатно.' },
];

function formatFineGrams(g) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(g);
}
function formatRate(n) {
  if (n == null || !Number.isFinite(Number(n))) return '· · ·';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(n))} ₽/г`;
}

function KurierCalcCard({ quote, pulseKey }) {
  const [proba, setProba] = useState(585);
  const [grams, setGrams] = useState(12);
  const [pulse, setPulse] = useState(false);
  const perGram = quote?.goldRubPerGram || null;
  const fineGrams = grams * (proba / 1000);
  const scrapRub = perGram ? perGram * fineGrams : null;
  const sum = scrapRub != null ? scrapRub * 0.9 : null;
  const pawnRub = scrapRub != null ? scrapRub * 0.5 : null;
  const extraRub = sum != null && pawnRub != null ? sum - pawnRub : null;
  const sumDisplay = useAnimatedNumber(sum);

  useEffect(() => {
    if (!pulseKey) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 900);
    return () => clearTimeout(t);
  }, [pulseKey]);

  return (
    <motion.div className={`rl-calc-card rl-calc-card--wide${pulse ? ' rl-calc-card--pulse' : ''}`} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}>
      <div className="rl-calc-top">
        <span className="rl-calc-brand">РАСЧЁТ<i>·</i>КУРЬЕР</span>
        <RuGoldTicker value={perGram} />
      </div>
      <span className="rl-calc-label">Проба изделия</span>
      <div className="rl-seg">
        {[375, 585, 750, 999].map((p) => (
          <button key={p} type="button" className={p === proba ? 'is-active' : ''} onClick={() => setProba(p)}>{p}</button>
        ))}
      </div>
      <GramsSlider value={grams} onChange={setGrams} max={1000} allowType typeMax={5000} />

      <div className="rl-calc-foot">
        <div className="rl-calc-bill" aria-label="Из чего складывается сумма">
          <div className="rl-calc-bill-row">
            <span>Биржа, золото 999°<small>Мосбиржа, живой курс</small></span>
            <b>{perGram != null ? formatRate(perGram) : '· · ·'}</b>
          </div>
          <div className="rl-calc-bill-row">
            <span>Чистого золота<small>{grams} г × {proba} / 1000</small></span>
            <b>{formatFineGrams(fineGrams)} г</b>
          </div>
          <div className="rl-calc-bill-row">
            <span>Полная стоимость по бирже</span>
            <b>{scrapRub != null ? formatMoney(scrapRub) : '· · ·'}</b>
          </div>
          <div className="rl-calc-bill-row">
            <span>Ваша доля</span>
            <b>90%</b>
          </div>
          <div className="rl-calc-bill-row">
            <span>Курьер</span>
            <b>0 ₽</b>
          </div>
        </div>
        <div className="rl-calc-out">
          <span className="rl-calc-out-label">К выплате наличными или переводом<RuSbpBadge /></span>
          <span className="rl-calc-out-val">{sumDisplay != null ? formatMoney(sumDisplay) : '· · ·'}</span>
          {perGram != null && (
            <span className="rl-calc-out-eq">{formatRate(perGram).replace(' ₽/г', '')} × {formatFineGrams(fineGrams)} г × 90%</span>
          )}
        </div>
        {pawnRub != null && extraRub != null && extraRub > 0 && (
          <p className="rl-calc-vs">
            В ломбарде за это же — около <strong>{formatMoney(pawnRub)}</strong>
            {' '}(≈ 50% от биржи). Разница <strong>{formatMoney(extraRub)}</strong>.
          </p>
        )}
        <p className="rl-calc-note">После проверки пробы при вас сумма пересчитывается по той же формуле — не «на глаз».</p>
      </div>
    </motion.div>
  );
}

/** Обновляем «текущее время» раз в минуту — доступность дня/слота зависит от часа. */
function useNowMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const CITY_NAMES = ['Москва', 'Санкт-Петербург', 'Калининград'];
const BOOK_STEPS = [
  { n: '1', title: 'Город', hint: 'куда едем' },
  { n: '2', title: 'Когда', hint: 'дата и время' },
  { n: '3', title: 'Адрес', hint: 'и телефон' },
];

function monthCaption(days) {
  if (!days.length) return '';
  const a = days[0].date;
  const b = days[days.length - 1].date;
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${months[a.getMonth()]}`;
  return `${a.getDate()} ${months[a.getMonth()].slice(0, 3)} — ${b.getDate()} ${months[b.getMonth()]}`;
}

function KurierBookingForm() {
  const now = useNowMinute();
  const days = useMemo(() => getAvailableDays(now), [now]);
  const cal = useMemo(() => getCalendarGrid(days), [days]);

  const [step, setStep] = useState(1);
  const [phase, setPhase] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [cityOther, setCityOther] = useState('');
  const [address, setAddress] = useState('');
  const [day, setDay] = useState(days[0]?.iso || '');
  const [time, setTime] = useState('');
  const [website, setWebsite] = useState('');

  const quickTimes = useMemo(() => getQuickTimes(day, now), [day, now]);
  const minTime = useMemo(() => getMinTimeStrForDay(day, now), [day, now]);
  const maxTime = getMaxTimeStrForDay();
  const isOtherCity = city === 'other';
  const cityLabel = isOtherCity ? cityOther.trim() : city;
  const dayLabel = days.find((d) => d.iso === day)?.label || '';

  useEffect(() => {
    if (!days.some((d) => d.iso === day)) setDay(days[0]?.iso || '');
  }, [days, day]);
  useEffect(() => {
    if (time && !isKurierTimeAllowed(day, time, now)) setTime('');
  }, [day, now]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickCity(id) {
    setCity(id);
    setError('');
    if (id !== 'other') setStep(2);
  }

  function pickTime(t) {
    setTime(t);
    setError('');
    setStep(3);
  }

  function goStep(n) {
    if (n === 2 && !cityLabel) {
      setError('Сначала выберите город');
      return;
    }
    if (n === 3 && (!isKurierDayAllowed(day, now) || !isKurierTimeAllowed(day, time, now))) {
      setError('Выберите дату и время');
      return;
    }
    setError('');
    setStep(n);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (phase === 'sending') return;
    setError('');

    if (String(website || '').trim()) {
      setPhase('sent');
      return;
    }
    if (!cityLabel || cityLabel.length < 2) {
      setStep(1);
      return setError('Укажите город');
    }
    if (!isKurierDayAllowed(day, now) || !isKurierTimeAllowed(day, time, now)) {
      setStep(2);
      return setError('Выберите дату и время визита');
    }
    if (address.trim().length < 5) return setError('Укажите адрес для курьера');
    if (!isLeadName(name)) return setError('Укажите имя');
    if (!isRuPhone(phone)) return setError('Укажите номер телефона, без него мы не сможем связаться');

    setPhase('sending');
    try {
      await clientApi.courierOrder({
        name: name.trim(),
        phone: phone.trim(),
        city: cityLabel,
        address: address.trim(),
        date: day,
        time,
        website,
      });
      ymReachGoal('lead', { source: 'kurier' });
      setPhase('sent');
    } catch (err) {
      setPhase('idle');
      setError(err?.message || 'Не получилось отправить. Попробуйте ещё раз или позвоните: 8 800 555-18-48');
    }
  }

  if (phase === 'sent') {
    return (
      <div className="rl-book" role="status">
        <div className="rl-sent">
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
          <h3>Курьер записан</h3>
          <p className="rl-form-note">
            {dayLabel}, {formatKurierTimeLabel(time)}. Мы позвоним за 1–2 часа до визита, чтобы подтвердить адрес и время.
          </p>
          <ul className="rl-kurier-summary">
            {cityLabel && <li><span>Город</span><b>{cityLabel}</b></li>}
            {address && <li><span>Адрес</span><b>{address}</b></li>}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <form className="rl-book" onSubmit={onSubmit}>
      <div className="rl-book-head">
        <div>
          <h3>Вызвать курьера</h3>
          <p>Три шага: город, удобное время, адрес. Подтвердим звонком заранее.</p>
        </div>
      </div>

      <div className="rl-book-progress" role="tablist" aria-label="Шаги записи">
        {BOOK_STEPS.map((s, i) => {
          const n = i + 1;
          const done = n < step;
          const on = n === step;
          return (
            <button
              key={s.n}
              type="button"
              role="tab"
              aria-selected={on}
              className={on ? 'is-on' : done ? 'is-done' : ''}
              disabled={n > step && !city}
              onClick={() => goStep(n)}
            >
              <i>{done ? '✓' : s.n}</i>
              <span>
                <b>{s.title}</b>
                <em>{s.hint}</em>
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="city" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: EASE }}>
            <div className="rl-book-cities">
              {BOOK_CITIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`rl-book-city${city === c.id ? ' is-active' : ''}`}
                  onClick={() => pickCity(c.id)}
                >
                  <b>{c.name}</b>
                  <em>{c.hint}</em>
                </button>
              ))}
            </div>
            {isOtherCity && (
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                <input className="rl-input" placeholder="Укажите ваш город" maxLength={120} value={cityOther} onChange={(e) => setCityOther(e.target.value)} />
                <p className="rl-book-note">Курьеры закреплены за Москвой, Санкт-Петербургом и Калининградом — для другого города уточним ближайшую дату.</p>
              </div>
            )}
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="when" className="rl-book-when" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: EASE }}>
            <div>
              <span className="rl-book-cal-label">{monthCaption(days)}</span>
              <div className="rl-book-week" aria-hidden>
                {KURIER_WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
              </div>
              <div className="rl-book-cal" role="listbox" aria-label="Дата визита">
                {cal.map((cell, i) => {
                  if (!cell) return <span key={`e-${i}`} className="rl-book-day is-empty" />;
                  const hint = cell.label === 'Сегодня' || cell.label === 'Завтра' ? cell.label : '';
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      role="option"
                      aria-selected={day === cell.iso}
                      className={`rl-book-day${day === cell.iso ? ' is-active' : ''}`}
                      onClick={() => { setDay(cell.iso); setError(''); }}
                    >
                      <b>{cell.date.getDate()}</b>
                      {hint ? <i>{hint}</i> : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <span className="rl-book-slots-label">Время приезда · {dayLabel.toLowerCase()}</span>
              {quickTimes.length > 0 ? (
                <>
                  <div className="rl-book-slots">
                    {quickTimes.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`rl-book-slot${time === t ? ' is-active' : ''}`}
                        onClick={() => pickTime(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="rl-book-time-custom">
                    <span>Своё время</span>
                    <input
                      type="time"
                      className="rl-input"
                      min={minTime || undefined}
                      max={maxTime}
                      step={300}
                      value={time}
                      onChange={(e) => { setTime(e.target.value); setError(''); }}
                    />
                  </div>
                  <p className="rl-book-note">Курьеры работают с {minTime} до {maxTime} — можно указать любую минуту.</p>
                </>
              ) : (
                <p className="rl-book-note">На эту дату времени уже нет — выберите другой день.</p>
              )}
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="where" className="rl-book-contacts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: EASE }}>
            <div className="rl-book-recap">
              <button type="button" onClick={() => setStep(1)}>{cityLabel || 'Город'}</button>
              <button type="button" onClick={() => setStep(2)}>{dayLabel} · {formatKurierTimeLabel(time)}</button>
            </div>
            <textarea className="rl-input" style={{ gridColumn: '1 / -1' }} placeholder="Адрес: улица, дом, квартира, этаж, домофон" rows={3} maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} />
            <input className="rl-input" name="name" placeholder="Ваше имя" maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="rl-input" name="phone" placeholder="+7 (900) 000-00-00" maxLength={120} inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <p className="rl-book-note">За 1–2 часа до визита позвоним, чтобы подтвердить время. Продажа не обязательна — можно отказаться на месте.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <input className="rl-hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} />

      <div className="rl-book-nav">
        {step > 1 && (
          <button type="button" className="il-btn il-btn--ghost il-btn--lg" onClick={() => { setError(''); setStep(step - 1); }}>
            Назад
          </button>
        )}
        {step === 1 && isOtherCity && (
          <motion.button type="button" className="il-btn il-btn--primary il-btn--lg" whileTap={{ scale: 0.97 }} onClick={() => goStep(2)}>
            Далее
          </motion.button>
        )}
        {step === 2 && (
          <motion.button type="button" className="il-btn il-btn--primary il-btn--lg" whileTap={{ scale: 0.97 }} onClick={() => goStep(3)}>
            Далее
          </motion.button>
        )}
        {step === 3 && (
          <motion.button type="submit" className="il-btn il-btn--primary il-btn--lg" disabled={phase === 'sending'} whileTap={{ scale: 0.97 }}>
            {phase === 'sending' ? (<><span className="rl-btn-spin" aria-hidden /> Отправляем…</>) : 'Записать курьера'}
          </motion.button>
        )}
      </div>
      <AnimatePresence>
        {error && (
          <motion.p className="rl-form-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}

export function RuKurier() {
  const quote = useGoldQuote();
  const lenisRef = useRuLenis();
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });
  const [calcPulse, setCalcPulse] = useState(0);

  const goToCalc = (e) => {
    e.preventDefault();
    document.querySelector('#calc')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setCalcPulse((n) => n + 1);
  };

  useEffect(() => { setDraftMeta('Вызвать курьера — Reaktivo'); }, []);

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />

      <RuHeader active="kurier" lenisRef={lenisRef} ctaHref="#zapis" ctaLabel="Вызвать курьера" />

      <main>
        <RuFullHero
          imgDark="/ru/courier.jpg"
          imgLight="/ru/courier-light.jpg"
          imgPos="50% 40%"
          kicker="Вызов курьера"
          title={<>Назначьте время <br /><span className="il-accent-text">сами</span> — мы приедем</>}
          sub="Выберите дату и любое удобное время, укажите адрес — курьер приедет с проверкой пробы при вас и оплатой сразу. Бесплатно в Москве, Санкт-Петербурге и Калининграде."
          primary={{ href: '#calc', label: 'Рассчитать стоимость', onClick: goToCalc }}
          secondary={{ href: '#zapis', label: 'Записаться на визит' }}
          aside={<div id="calc"><KurierCalcCard quote={quote} pulseKey={calcPulse} /></div>}
        />

        <RuMarquee items={[
          'Курьер бесплатно', 'Вы выбираете время', 'Проверка при вас', 'Деньги сразу',
          'Подтверждаем звонком', 'Договор в приложении', 'Без комиссий', 'Курс как в отделении',
        ]} />

        <section className="il-section rl-kpis-section">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Доверие и безопасность</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Почему это безопасно</h2></Reveal>
            </div>
            <RuKpis items={[
              { val: '0 ₽', label: 'вызов курьера — без скрытых доплат', icon: 'zerofee', imgDark: '/ru/kpi-zerofee-dark.jpg', imgLight: '/ru/kpi-zerofee-light.jpg' },
              { val: 'При вас', label: 'проба и вес проверяются на глазах у клиента', icon: 'shield', imgDark: '/ru/kpi-shield-dark.jpg', imgLight: '/ru/kpi-shield-light.jpg' },
              { val: 'до 90%', label: 'от биржевой стоимости — курс фиксирован заранее', icon: 'percent', imgDark: '/ru/kpi-percent-dark.jpg', imgLight: '/ru/kpi-percent-light.jpg' },
              { val: 'Любое', label: 'время приезда — вы указываете его сами, а не диапазон', icon: 'time', imgDark: '/ru/kpi-time-dark.jpg', imgLight: '/ru/kpi-time-light.jpg' },
            ]} />
          </div>
        </section>

        <section className="il-section il-section--alt" id="zapis">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Запись</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Назначьте визит за полминуты</h2></Reveal>
            </div>
            <Reveal>
              <KurierBookingForm />
            </Reveal>
          </div>
        </section>

        <section className="il-section">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Процесс</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Как проходит запись</h2></Reveal>
            </div>
            <div className="rl-media-split rl-media-split--fill">
              <div className="rl-rows">
                {STEPS.map((s, i) => (
                  <Reveal key={s.n} delay={i * 0.05} className="rl-row">
                    <span className="rl-row-n">{s.n}</span>
                    <div><h4>{s.title}</h4><p>{s.text}</p></div>
                  </Reveal>
                ))}
              </div>
              <RuTiltCard className="rl-media-split-visual">
                <RuThemedImg dark="/ru/courier.jpg" light="/ru/courier-light.jpg" alt="Курьер Reaktivo проверяет изделие у клиента дома" />
              </RuTiltCard>
            </div>
          </div>
        </section>

        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Сравнение</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Курьер, отделение или заявка «перезвоним»</h2></Reveal>
            </div>
            <motion.div className="il-cards" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
              {COMPARE.map((c) => (
                <motion.div className={`il-card${c.highlight ? ' rl-card--accent' : ''}`} key={c.title} variants={staggerChild} whileHover={{ y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
                  <h3 className="il-card-title">{c.title}</h3>
                  <ul style={{ margin: '10px 0 0', paddingLeft: 18, display: 'grid', gap: 6 }}>
                    {c.points.map((p) => (
                      <li key={p} className="il-card-text" style={{ margin: 0 }}>{p}</li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="il-section" id="faq">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Вопросы</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Отвечаем честно</h2></Reveal>
            </div>
            <RuFaq items={FAQ} />
          </div>
        </section>
      </main>

      <RuFooter lenisRef={lenisRef} />

      <style>{IL_CSS}</style>
      <style>{RL_CSS}</style>
    </div>
  );
}
