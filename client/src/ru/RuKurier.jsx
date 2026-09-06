import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CSS as IL_CSS, EASE, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuFaq, RuFooter, RuFullHero, RuGoldTicker, RuHeader, RuKpis, RuMarquee, RuSbpBadge, RuThemedImg, RuTiltCard,
  GramsSlider, formatMoney, isLeadName, isRuPhone, setDraftMeta, useGoldQuote, useRuLenis,
} from './RuShared.jsx';
import { clientApi } from '../api.js';
import { ymReachGoal } from '../yandexMetrika.js';
import {
  formatKurierTimeLabel, getAvailableDays,
  getQuickTimes, isKurierDayAllowed, isKurierTimeAllowed,
} from './kurierSlots.js';

const STEPS = [
  { n: '01', title: 'Считаете сумму', text: 'Укажите пробу и вес в калькуляторе — увидите точную сумму, которую получите.' },
  { n: '02', title: 'Выбираете время', text: 'Дата, точное время и адрес — форма ниже. Ничего не нужно уточнять по телефону заранее.' },
  { n: '03', title: 'Мы звоним для подтверждения', text: 'За 1 час до визита курьер позвонит вам, чтобы подтвердить время и адрес.' },
  { n: '04', title: 'Курьер приезжает', text: 'Проверка пробы и веса при вас, оплата сразу — наличными или переводом.' },
];

/**
 * На мобильном хедер прячет CTA за гамбургер — без постоянно видимой кнопки
 * запись ощущается неудобной (нужно листать назад к форме). Плавающая кнопка
 * внизу экрана — стандартный паттерн доставок/маркетплейсов; прячем её, пока
 * сама форма (#order) в кадре, чтобы не дублировать «Оформить заявку».
 */
function KurierStickyCta() {
  const [visible, setVisible] = useState(false);
  const formInViewRef = useRef(false);

  useEffect(() => {
    const target = document.getElementById('order');
    if (!target) return undefined;
    const recompute = () => setVisible(!formInViewRef.current && window.scrollY > 480);
    const io = new IntersectionObserver(
      ([entry]) => { formInViewRef.current = entry.isIntersecting; recompute(); },
      { rootMargin: '0px 0px -10% 0px' }
    );
    io.observe(target);
    window.addEventListener('scroll', recompute, { passive: true });
    return () => { io.disconnect(); window.removeEventListener('scroll', recompute); };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="rl-sticky-cta"
          initial={{ y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 90, opacity: 0 }}
          transition={{ duration: 0.25, ease: EASE }}
        >
          <a href="#order" className="il-btn il-btn--primary il-btn--lg">Вызвать курьера бесплатно</a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

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
  { q: 'Можно ли поменять время после записи?', a: 'Да — курьер позвонит за 1 час до визита для подтверждения, в этот момент можно перенести время.' },
  { q: 'Как определяется проба, если клеймо стёрлось?', a: 'Пробирным реактивом и, при необходимости, спектральным анализом. Всё делается при вас — вы видите тот же результат, что и эксперт.' },
  { q: 'Нужны ли документы?', a: 'Нужен паспорт — это требование закона к самой сделке приёма металла, а не проверка происхождения вещи.' },
  { q: 'Что если я передумаю?', a: 'Продажа не является обязательной: вы всегда можете отказаться или перенести визит — это бесплатно.' },
];

function roundTo100(n) {
  return Math.round(n / 100) * 100;
}

/** Сжимаем фото в браузере перед отправкой — с телефона это 3–10 МБ HEIC/JPEG,
 * а нам достаточно превью для оператора, не оригинал в полном разрешении. */
function resizeImageFile(file, maxDim = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve({ base64: canvas.toDataURL('image/jpeg', quality), mimeType: 'image/jpeg' });
      };
      // HEIC/HEIF с iPhone canvas часто не читает — тогда шлём файл как есть.
      img.onerror = () => {
        const mimeType = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
        resolve({ base64: dataUrl, mimeType });
      };
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

const WEIGHT_BUCKETS = [
  { label: 'до 5 г', value: 3 },
  { label: '5–15 г', value: 10 },
  { label: '15–30 г', value: 20 },
  { label: '30+ г', value: 40 },
];

const PROBA_OPTIONS = [375, 500, 585, 750, 999];

/** Обновляем «текущее время» раз в минуту — доступность дня/слота зависит от часа. */
function useNowMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function pinDivIcon() {
  return L.divIcon({
    className: 'rl-loc-pin',
    html: `<div style="display:flex;flex-direction:column;align-items:center;">
      <div style="width:30px;height:30px;background:linear-gradient(135deg,#ff3b42,#b4141c);border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,0.35);">
        <div style="width:9px;height:9px;background:#fff;border-radius:50%;transform:rotate(45deg);"></div>
      </div>
    </div>`,
    iconSize: [30, 42],
    iconAnchor: [15, 40],
  });
}

/**
 * Место визита — один блок, без шагов: поля город/адрес видны сразу, кнопка
 * геолокации их просто подставляет (та же идея, что и «Индекс золота» в
 * админке — GPS → обратное геокодирование → точка на карте, которую можно
 * перетащить, если геокодер ошибся). Перетаскивание маркера ВСЕГДА
 * перезаписывает адрес — это явное «поправь точку», а не случайный ввод.
 */
function KurierLocationField({ city, setCity, address, setAddress, lat, lng, setCoords }) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  async function reverseGeocode(la, lo) {
    // Геокодируем прямо из браузера клиента (как в «Индекс золота» в админке):
    // у сервера общий IP на весь трафик, и Nominatim/Photon его иногда режут по
    // лимитам, а с адреса живого посетителя запрос проходит нормально.
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${lo}&accept-language=ru`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'ru' } });
      if (!res.ok) throw new Error('nominatim failed');
      const gd = await res.json();
      const addr = gd?.address || {};
      const geoCity = addr.city || addr.town || addr.village || addr.county || addr.municipality || '';
      const street = [addr.road || addr.pedestrian || addr.footway || '', addr.house_number || '']
        .map((s) => String(s).trim())
        .filter(Boolean)
        .join(', ');
      if (geoCity) setCity(geoCity);
      if (street) setAddress(street);
      return;
    } catch { /* пробуем через наш сервер ниже */ }

    try {
      const geo = await clientApi.reverseGeocode({ lat: la, lng: lo });
      if (geo?.city) setCity(geo.city);
      if (geo?.street) setAddress(geo.street);
    } catch {
      // Координаты уже есть — просто не смогли расшифровать адрес, клиент допишет сам.
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      setError('Геолокация не поддерживается этим браузером — укажите адрес вручную');
      return;
    }
    setError('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = pos.coords.latitude;
        const lo = pos.coords.longitude;
        setCoords(la, lo);
        setLocating(false);
        reverseGeocode(la, lo);
      },
      () => {
        setError('Не удалось определить местоположение — укажите адрес вручную');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }

  // Карта появляется, когда есть координаты; маркер можно перетащить, если геокодер ошибся.
  useEffect(() => {
    if (lat == null || lng == null || !mapElRef.current) return undefined;
    if (!mapRef.current) {
      const m = L.map(mapElRef.current, { attributionControl: false, zoomControl: false }).setView([lat, lng], 16);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
      const marker = L.marker([lat, lng], { icon: pinDivIcon(), draggable: true }).addTo(m);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        setCoords(p.lat, p.lng);
        reverseGeocode(p.lat, p.lng);
      });
      mapRef.current = m;
      markerRef.current = marker;
    } else {
      mapRef.current.setView([lat, lng], mapRef.current.getZoom() || 16);
      markerRef.current.setLatLng([lat, lng]);
    }
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [lat != null, lng != null]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rl-loc">
      <button type="button" className="rl-loc-geo-btn" onClick={locate} disabled={locating}>
        {locating ? (
          <><span className="rl-btn-spin" aria-hidden /> Определяем…</>
        ) : (
          <><span className="rl-loc-geo-pin" aria-hidden>📍</span>Определить моё местоположение</>
        )}
      </button>
      {error && <p className="rl-form-error" style={{ margin: '8px 0 0' }}>{error}</p>}
      {lat != null && lng != null && <div ref={mapElRef} className="rl-loc-map" />}
      <div className="rl-loc-fields">
        <input className="rl-input" placeholder="Город" maxLength={120} value={city} onChange={(e) => setCity(e.target.value)} />
        <textarea className="rl-input" placeholder="Адрес: улица, дом, квартира, этаж, домофон" rows={2} maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
    </div>
  );
}

/**
 * Необязательное фото изделия: клиент часто не знает точный вес, а фото с
 * телефона даёт оператору понять объём и тип украшения/лома до выезда
 * курьера. Сжимаем на клиенте, грузим сразу (не ждём отправки формы), в
 * заявке остаётся только готовая ссылка.
 */
function KurierPhotoField({ photoUrl, setPhotoUrl }) {
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState('idle'); // idle | uploading | done | error
  const [error, setError] = useState('');

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError('');
    setStatus('uploading');
    try {
      const { base64, mimeType } = await resizeImageFile(file);
      setPreview(base64);
      const out = await clientApi.courierPhotoUpload({ base64, mimeType });
      setPhotoUrl(out.photoUrl || '');
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err?.message || 'Не удалось загрузить фото — попробуйте ещё раз');
    }
  }

  function removePhoto() {
    setPreview('');
    setPhotoUrl('');
    setStatus('idle');
    setError('');
  }

  return (
    <div className="rl-photo-field">
      {!preview ? (
        <label className={`rl-photo-cta${status === 'uploading' ? ' is-busy' : ''}`}>
          <input
            className="rl-photo-input"
            type="file"
            accept="image/*,image/heic,image/heif,.heic,.heif"
            onChange={onPick}
            disabled={status === 'uploading'}
          />
          {status === 'uploading' ? (<><span className="rl-btn-spin" aria-hidden /> Загружаем…</>) : '📷 Прикрепить фото изделия'}
        </label>
      ) : (
        <div className="rl-photo-preview">
          <img src={preview} alt="Фото изделия" />
          <div>
            <span>{status === 'uploading' ? 'Загружаем…' : status === 'done' ? 'Фото прикреплено' : 'Не загрузилось'}</span>
            <button type="button" onClick={removePhoto}>Убрать</button>
          </div>
        </div>
      )}
      <p className="rl-photo-hint">Необязательно — поможет точнее понять вес и объём.</p>
      {error && <p className="rl-form-error" style={{ margin: '4px 0 0' }}>{error}</p>}
    </div>
  );
}

/**
 * Единый блок: расчёт суммы и запись курьера — без разрыва на калькулятор и
 * отдельную форму с шагами. Всё видно сразу, скроллом сверху вниз.
 */
function KurierOrderCard({ quote, pulseKey }) {
  const now = useNowMinute();
  const days = useMemo(
    () => getAvailableDays(now).filter((d) => getQuickTimes(d.iso, now).length > 0),
    [now]
  );

  const [pulse, setPulse] = useState(false);
  const [proba, setProba] = useState(585);
  const [grams, setGrams] = useState(12);

  const [phase, setPhase] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [day, setDay] = useState(days[0]?.iso || '');
  const [time, setTime] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  const perGram = quote?.goldRubPerGram || null;
  const isUnknownProba = proba === 'unknown';
  let priceLow = null;
  let priceHigh = null;
  if (perGram != null) {
    if (isUnknownProba) {
      priceLow = perGram * (grams * 0.375) * 0.9;
      priceHigh = perGram * (grams * 0.999) * 0.9;
    } else {
      const center = perGram * (grams * (proba / 1000)) * 0.9;
      priceLow = center * 0.97;
      priceHigh = center * 1.03;
    }
  }

  useEffect(() => {
    if (!pulseKey) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 900);
    return () => clearTimeout(t);
  }, [pulseKey]);

  const quickTimes = useMemo(() => getQuickTimes(day, now), [day, now]);
  const cityLabel = city.trim();
  const dayLabel = days.find((d) => d.iso === day)?.label || '';

  useEffect(() => {
    if (!days.some((d) => d.iso === day)) setDay(days[0]?.iso || '');
  }, [days, day]);
  useEffect(() => {
    if (time && !isKurierTimeAllowed(day, time, now)) setTime('');
  }, [day, now]); // eslint-disable-line react-hooks/exhaustive-deps

  function setCoords(la, lo) {
    setLat(la);
    setLng(lo);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (phase === 'sending') return;
    setError('');

    if (String(website || '').trim()) {
      setPhase('sent');
      return;
    }
    if (!cityLabel || cityLabel.length < 2) return setError('Укажите город');
    if (address.trim().length < 5) return setError('Укажите адрес для курьера');
    if (!isKurierDayAllowed(day, now) || !isKurierTimeAllowed(day, time, now)) {
      return setError('Выберите дату и время визита');
    }
    if (!isLeadName(name)) return setError('Укажите имя');
    if (!isRuPhone(phone)) return setError('Укажите номер телефона, без него мы не сможем связаться');
    if (!consent) return setError('Нужно согласие на обработку персональных данных');

    setPhase('sending');
    try {
      await clientApi.courierOrder({
        name: name.trim(),
        phone: phone.trim(),
        city: cityLabel,
        address: address.trim(),
        lat,
        lng,
        date: day,
        time,
        website,
        fields: {
          'Проба (заявка)': isUnknownProba ? 'не знает' : String(proba),
          'Вес, г': String(grams),
          ...(photoUrl ? { 'Фото изделия': photoUrl } : {}),
        },
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
      <div className="rl-calc-card rl-calc-card--wide rl-order-card rl-order-sent" role="status">
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
            {dayLabel}, {formatKurierTimeLabel(time)}. За 1 час до визита курьер позвонит вам, чтобы подтвердить адрес и время.
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
    <motion.form
      className={`rl-calc-card rl-calc-card--wide rl-order-card${pulse ? ' rl-calc-card--pulse' : ''}`}
      onSubmit={onSubmit}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: EASE }}
    >
      <div className="rl-order-col rl-order-col--calc">
        <div className="rl-order-divider"><span>Расчёт</span></div>

        <div className="rl-calc-top">
          <span className="rl-calc-brand">СЛИТОК, УКРАШЕНИЕ ИЛИ ЛОМ</span>
          <RuGoldTicker value={perGram} change={quote?.change} />
        </div>

        <GramsSlider value={grams} onChange={setGrams} max={1000} allowType typeMax={5000} />
        <div className="rl-weight-quick">
          {WEIGHT_BUCKETS.map((b) => (
            <button key={b.label} type="button" className={grams === b.value ? 'is-active' : ''} onClick={() => setGrams(b.value)}>{b.label}</button>
          ))}
        </div>

        <span className="rl-calc-label">Проба</span>
        <div className="rl-seg rl-seg--wrap">
          {PROBA_OPTIONS.map((p) => (
            <button key={p} type="button" className={p === proba ? 'is-active' : ''} onClick={() => setProba(p)}>{p}</button>
          ))}
          <button type="button" className={isUnknownProba ? 'is-active' : ''} onClick={() => setProba('unknown')}>не знаю</button>
        </div>

        <KurierPhotoField photoUrl={photoUrl} setPhotoUrl={setPhotoUrl} />

        <div className="rl-price-range">
          <span className="rl-price-range-val">
            {priceLow != null && priceHigh != null ? `≈ ${formatMoney(roundTo100(priceLow))} – ${formatMoney(roundTo100(priceHigh))}` : '· · ·'}
          </span>
          <p>Точная сумма — после оценки веса и пробы курьером на месте. Курьер бесплатный<RuSbpBadge /></p>
        </div>
      </div>

      <div className="rl-order-col rl-order-col--book">
        <div className="rl-order-divider"><span>Бронирование</span></div>

        <span className="rl-calc-label">Куда приехать</span>
        <KurierLocationField
          city={city}
          setCity={setCity}
          address={address}
          setAddress={setAddress}
          lat={lat}
          lng={lng}
          setCoords={setCoords}
        />

        <div className="rl-book-when">
          <label className="rl-book-select">
            <span>Дата</span>
            <select
              className="rl-input"
              aria-label="Дата визита"
              value={day}
              onChange={(e) => { setDay(e.target.value); setError(''); }}
            >
              {days.map((d) => (
                <option key={d.iso} value={d.iso}>{d.label}</option>
              ))}
            </select>
          </label>
          <label className="rl-book-select">
            <span>Время</span>
            {quickTimes.length > 0 ? (
              <select
                className="rl-input"
                aria-label="Время приезда"
                value={time}
                onChange={(e) => { setTime(e.target.value); setError(''); }}
              >
                <option value="">Выберите время</option>
                {quickTimes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            ) : (
              <p className="rl-book-note">На эту дату времени уже нет — выберите другой день.</p>
            )}
          </label>
        </div>

        <span className="rl-calc-label">Контакты</span>
        <div className="rl-book-contacts">
          <input className="rl-input" name="name" placeholder="Ваше имя" maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="rl-input" name="phone" placeholder="+7 (900) 000-00-00" maxLength={120} inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <input className="rl-hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} />

        <label className="rl-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Согласен на <a href="/privacy" target="_blank" rel="noreferrer">обработку персональных данных</a> для оформления заявки</span>
        </label>

        <motion.button type="submit" className="il-btn il-btn--primary il-btn--lg" style={{ width: '100%' }} disabled={phase === 'sending'} whileTap={{ scale: 0.97 }}>
          {phase === 'sending' ? (<><span className="rl-btn-spin" aria-hidden /> Отправляем…</>) : 'Забронировать'}
        </motion.button>
        <p className="rl-book-note rl-order-hint">За 1 час до визита курьер позвонит вам, чтобы подтвердить время.</p>

        <AnimatePresence>
          {error && (
            <motion.p className="rl-form-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.form>
  );
}

export function RuKurier() {
  const quote = useGoldQuote();
  const lenisRef = useRuLenis();
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });
  const [calcPulse, setCalcPulse] = useState(0);

  const goToOrder = (e) => {
    e.preventDefault();
    document.querySelector('#order')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setCalcPulse((n) => n + 1);
  };

  useEffect(() => { setDraftMeta('Вызвать курьера — Reaktivo'); }, []);

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />

      <RuHeader active="kurier" lenisRef={lenisRef} ctaHref="#order" ctaLabel="Вызвать курьера" />

      <main>
        <RuFullHero
          imgDark="/ru/courier.jpg"
          imgLight="/ru/courier-light.jpg"
          imgPos="50% 40%"
          kicker="Вызов курьера"
          title={<>Продать золото —<br />это просто <span className="il-accent-text">выбрать время</span></>}
          sub="Вы сами выбираете день и время, а за 1 час до визита мы позвоним, чтобы подтвердить выезд."
          primary={{ href: '#order', label: 'Оформить заявку', onClick: goToOrder }}
          secondary={{ href: '#protsess', label: 'Как это работает' }}
        />

        {/* Карточка расчёта+записи — отдельным блоком под хиро, а не сбоку: там она
            попадала в scroll-fade хиро-обёртки (тускнела при скролле формы) и была
            зажата в узкую колонку. Ниже она получает свою ширину и не гаснет. */}
        <section className="il-section rl-order-section" id="order">
          <div className="il-section-inner">
            <Reveal className="rl-order-wrap"><KurierOrderCard quote={quote} pulseKey={calcPulse} /></Reveal>
          </div>
        </section>

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

        <section className="il-section" id="protsess">
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
      <KurierStickyCta />

      <style>{IL_CSS}</style>
      <style>{RL_CSS}</style>
      <style>{KURIER_CSS}</style>
    </div>
  );
}

const KURIER_CSS = `
/* Фиксированный хедер (72–80px) иначе перекрывает заголовок при переходе по якорю. */
#order, #protsess, #faq { scroll-margin-top: 96px; }

/* Карточка «расчёт + запись» — отдельный блок под хиро, не в боковой колонке:
   там она попадала в scroll-fade хиро (тускнела при скролле формы) и была
   зажата в узкую колонку. */
.rl-order-section .il-section-inner { display: block; }
.rl-order-wrap { width: 100%; }
.rl-calc-card.rl-order-card {
  max-width: none; width: 100%;
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px 56px; align-items: stretch;
  padding: 36px 40px 32px;
}
.rl-order-col { min-width: 0; }
.rl-order-col--book {
  padding-left: 40px;
  border-left: 1px solid var(--stroke);
}
.rl-calc-card.rl-order-card.rl-order-sent {
  display: block; max-width: 560px; margin: 0 auto; padding: 36px 32px;
}

@media (max-width: 960px) {
  .rl-calc-card.rl-order-card {
    display: flex; flex-direction: column; gap: 0;
    max-width: 640px; margin: 0 auto; padding: 26px;
  }
  .rl-order-col--book { padding-left: 0; border-left: 0; }
}

/* На мобильном карточка идёт во всю ширину экрана, без «рамки» — без полей
   секции, скруглений и бордера, как нативный полноэкранный блок, а не форма
   в карточке. */
@media (max-width: 720px) {
  .rl-order-section { padding: 40px 0; }
  .rl-order-section .il-section-inner { max-width: none; padding: 0; }
  .rl-calc-card.rl-order-card {
    max-width: none; width: 100%; border-radius: 0; border: 0;
    box-shadow: none; padding: 24px 18px;
  }
}

.rl-order-card .rl-calc-label { display: block; margin-top: 20px; margin-bottom: 0; }
.rl-order-card .rl-seg--wrap { flex-wrap: wrap; }
.rl-order-card .rl-seg--wrap button { flex: 1 1 auto; min-width: 54px; }

.rl-weight-quick { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.rl-weight-quick button {
  padding: 7px 12px; border-radius: 99px; font-size: 0.78rem; font-weight: 600; font-family: inherit;
  color: var(--text-dim); background: var(--stroke-soft); border: 1px solid transparent; cursor: pointer; transition: 0.2s;
}
.rl-weight-quick button.is-active { background: var(--accent-soft); color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }

.rl-price-range {
  margin-top: 18px; padding: 16px 18px; border-radius: 16px;
  background: var(--stroke-soft); text-align: left;
}
.rl-price-range-val { display: block; font-size: clamp(1.3rem, 2.6vw, 1.6rem); font-weight: 800; letter-spacing: -0.01em; color: #fff; font-variant-numeric: tabular-nums; }
:root[data-theme='light'] .rl-price-range-val { color: var(--text-strong); }
.rl-price-range p { margin: 6px 0 0; font-size: 0.78rem; color: var(--text-dim); line-height: 1.4; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }

.rl-photo-field { margin-top: 14px; }
.rl-photo-cta {
  position: relative; overflow: hidden; box-sizing: border-box;
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px 16px; border-radius: 12px; font: inherit; font-size: 0.86rem; font-weight: 700;
  color: var(--text-dim); background: transparent; border: 1px dashed var(--stroke); cursor: pointer; transition: 0.2s;
}
.rl-photo-cta:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--stroke)); color: var(--text-strong); }
.rl-photo-cta.is-busy { opacity: 0.7; cursor: wait; }
.rl-photo-input {
  position: absolute; inset: 0; width: 100%; height: 100%;
  opacity: 0; cursor: pointer; font-size: 32px; /* iOS иначе сжимает hit-area */
  border: 0; margin: 0; padding: 0;
}
.rl-photo-cta.is-busy .rl-photo-input { pointer-events: none; }
.rl-photo-preview { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 12px; border: 1px solid var(--stroke); background: var(--stroke-soft); }
.rl-photo-preview img { width: 56px; height: 56px; border-radius: 10px; object-fit: cover; flex-shrink: 0; }
.rl-photo-preview div { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.rl-photo-preview span { font-size: 0.8rem; font-weight: 600; color: var(--text-strong); }
.rl-photo-preview button { font: inherit; font-size: 0.76rem; font-weight: 700; color: var(--accent); background: none; border: none; padding: 0; cursor: pointer; text-decoration: underline; }
.rl-photo-hint { margin: 8px 0 0; font-size: 0.82rem; line-height: 1.45; color: var(--text-dim); white-space: nowrap; }

.rl-order-divider { display: flex; align-items: center; gap: 10px; margin: 26px 0 4px; }
.rl-order-col--calc > .rl-order-divider:first-child { margin-top: 0; }
.rl-order-divider::before,
.rl-order-divider::after { content: ''; flex: 1; height: 1px; background: var(--stroke); }
.rl-order-divider span { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); white-space: nowrap; }
@media (min-width: 961px) {
  .rl-order-col .rl-order-divider { margin: 2px 0 8px; }
  .rl-order-col .rl-order-divider::before,
  .rl-order-col .rl-order-divider::after { display: none; }
  .rl-order-card .rl-book-when { grid-template-columns: 1fr 1fr; gap: 12px; }
  .rl-order-col--book > .rl-calc-label:first-of-type { margin-top: 8px; }
  .rl-order-col--calc { display: flex; flex-direction: column; }
  .rl-order-col--calc .rl-price-range { margin-top: auto; }
}

.rl-order-card .rl-input { font-size: 0.95rem; }
.rl-order-card textarea.rl-input { min-height: 76px; resize: vertical; }
.rl-order-card .rl-form-error { margin: 10px 0 0; color: var(--accent); font-weight: 700; font-size: 0.88rem; }
.rl-order-sent .rl-sent { text-align: center; padding: 6px 0; display: grid; justify-items: center; gap: 8px; }
.rl-order-sent .rl-sent h3 { margin: 0; }

.rl-order-card .rl-loc { margin-top: 12px; }
.rl-loc-geo-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px 16px; border-radius: 12px; font: inherit; font-size: 0.88rem; font-weight: 700;
  color: #fff; background: var(--accent-soft); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  cursor: pointer; transition: 0.2s;
}
/* Светлая тема: белый на бледно-красном плохо читается — тёмный текст, булавка остаётся красной. */
:root[data-theme='light'] .rl-loc-geo-btn { color: var(--text-strong); }
.rl-loc-geo-pin { flex-shrink: 0; line-height: 1; filter: none; }
.rl-loc-geo-btn:hover { transform: translateY(-1px); }
.rl-loc-geo-btn:disabled { opacity: 0.7; cursor: wait; }
.rl-order-card .rl-loc-fields { display: grid; gap: 10px; margin-top: 10px; }
.rl-order-card .rl-book-when {
  margin-top: 14px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: start;
}
.rl-book-select { display: grid; gap: 6px; min-width: 0; }
.rl-book-select > span {
  font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--text-dim);
}
.rl-book-select select.rl-input {
  appearance: none; -webkit-appearance: none;
  width: 100%; cursor: pointer;
  background-color: var(--bg-panel-solid);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='%238a8f96' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' d='M1.5 1.5 6 6l4.5-4.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  background-size: 12px 8px;
  padding-right: 36px;
}

.rl-consent { display: flex; align-items: flex-start; gap: 10px; margin: 16px 0; cursor: pointer; }
.rl-consent input[type=checkbox] { margin-top: 2px; width: 16px; height: 16px; accent-color: var(--accent); flex-shrink: 0; cursor: pointer; }
.rl-consent span { font-size: 0.76rem; color: var(--text-dim); line-height: 1.4; }
.rl-consent a { color: var(--text-strong); text-decoration: underline; }
.rl-order-card .rl-order-hint { margin: 16px 0 0; line-height: 1.45; }

.rl-sticky-cta { display: none; }
@media (max-width: 900px) {
  .rl-sticky-cta {
    display: block; position: fixed; left: 0; right: 0; bottom: 0; z-index: 45;
    padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
    background: linear-gradient(to top, var(--bg-deep) 55%, transparent);
    pointer-events: none;
  }
  .rl-sticky-cta .il-btn {
    pointer-events: auto; width: 100%; justify-content: center;
    box-shadow: 0 -8px 28px -6px rgba(0, 0, 0, 0.45);
  }
}
`;
