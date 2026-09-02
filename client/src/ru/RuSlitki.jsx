import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { CSS as IL_CSS, EASE, Magnetic, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuCtaPanel, RuFaq, RuFooter, RuHeader, RuHeroBg, RuKpis, RuLeadForm, RuMarquee, RuStatement, RuTiltCard,
  formatMoney, setDraftMeta, useAnimatedNumber, useGoldQuote, useRuLenis,
} from './RuShared.jsx';

const WHY = [
  { title: 'Точный вес и проба', text: 'Никаких скрытых потерь на замках, вставках и примесях — весь заявленный вес составляет чистый металл выбранной пробы: 585, 750 или 900.' },
  { title: 'Слэбировано для защиты ценности', text: 'Слиток запечатан в слэб-капсулу с пробой, весом и сертификатом. Подлинность не нужно подтверждать заново при каждой продаже.' },
  { title: 'Гарантированный выкуп Reaktivo', text: 'Купили у нас — сможете продать обратно в любом отделении по прозрачному биржевому курсу, получив доход без необходимости самостоятельно искать покупателя.' },
];

const COMPARE = [
  { label: 'Наценка при покупке', jewelry: '80–130% сверх металла', bar: '15–30% сверх металла' },
  { label: 'За что наценка', jewelry: 'Дизайн, бренд, работа мастера', bar: 'Подлинность, проба, слэбирование' },
  { label: 'Проверка при сдаче', jewelry: 'Полная переоценка каждый раз', bar: 'Не нужна — подтверждено сертификатом и слэбом' },
  { label: 'Обратный выкуп', jewelry: 'Оценка только за металл, 45–50% от стоимости', bar: '~92–95% от стоимости металла' },
  { label: 'Риск скрытой потери веса', jewelry: 'Да — замки, вставки, сплавы', bar: 'Нет — точный вес и проба' },
  { label: 'Вторичный рынок', jewelry: 'Отсутствует', bar: 'Стоимость определяется биржей' },
];

const FORMS = [
  { n: '1', title: 'Цепочка', text: 'Слиток-звено в плетении: украшение, которое остаётся инвестицией. Вес и проба зафиксированы на клейме.' },
  { n: '2', title: 'Подвеска', text: 'Классический мини-слиток на цепочку: строгая форма, клеймо и проба на лицевой стороне.' },
  { n: '3', title: 'Кулон', text: 'Слиток в оправе — ближе к ювелирному украшению, дальше от сейфа. Носится каждый день.' },
  { n: '4', title: 'Тематическая серия', text: 'Лимитированные коллекции с собственным дизайном — коллекционная ценность сверх стоимости металла.' },
];

const STEPS = [
  { n: '01', title: 'Заявка', text: 'Выберите нужный вес, пробу и количество слитков.' },
  { n: '02', title: 'Подбор', text: 'Менеджер уточнит детали: нужный вес, формат и пробу. А также зафиксирует стоимость по курсу.' },
  { n: '03', title: 'Оплата и оформление', text: 'Произведите оплату любым удобным способом.' },
  { n: '04', title: 'Доставка и самовывоз', text: 'Доставим слиток и документы по всей стране или выдадим в отделении — как вам удобнее.' },
];

const FAQ = [
  { q: 'Чем слиток-украшение отличается от обычной ювелирки?', a: 'Вес и проба зафиксированы и запечатаны в капсулу — никаких потерь на замках, вставках и сплавах. Наценка при покупке 15–30% против 80–130% у обычного украшения, а при обратной продаже вы теряете в 2,5–3 раза меньше.' },
  { q: 'Что такое слэбирование?', a: 'Слиток запечатывается в защищённую капсулу с указанием пробы, веса и серийного номера — как грейдинг монет. Это подтверждает подлинность и характеристики без повторной экспертизы при каждой сделке.' },
  { q: 'Можно ли продать слиток обратно?', a: 'Да. Reaktivo ежедневно выкупает золото по живому курсу: принесите слиток в любое отделение или вызовите курьера. Слэбированный слиток проходит без переоценки — это быстрее и выгоднее.' },
  { q: 'Что за тематические коллекции?', a: 'Лимитированные серии слитков, объединённые темой или дизайном. У удачных коллекций есть коллекционная надбавка сверх стоимости металла — то, чего не может обычное украшение.' },
  { q: 'Как считается цена?', a: 'От биржевого курса золота на день покупки, пересчитанного на пробу и вес, плюс наценка 15–30% за работу и слэбирование. Точный расчёт вы видите до оплаты — без скрытых наценок.' },
  { q: 'Это подходит как подарок?', a: 'Да, и лучше обычного ювелирного изделия: помимо эстетической и подарочной ценности слиток сохраняет статус актива, привязанного к металлу, а не к витринной наценке.' },
];

const PROBAS = [585, 750, 900];
const WEIGHTS = [5, 10, 25, 50, 100];
const MARKUP = 1.22; // середина диапазона 15–30% сверх металла

/** Живая динамика курса вместо статичной надписи «курс живой»: копим последние тики цены
 *  и красим бары/подпись в зелёный при росте, в красный при снижении — так видно, что курс
 *  настоящий и меняется, а не просто декларация. */
function useRateHistory(value, size = 8) {
  const [points, setPoints] = useState([]);
  const prevRef = useRef(null);
  useEffect(() => {
    if (value == null) return;
    if (prevRef.current == null) {
      prevRef.current = value;
      setPoints([{ v: value, dir: 0 }]);
      return;
    }
    if (value === prevRef.current) return;
    const dir = value > prevRef.current ? 1 : -1;
    prevRef.current = value;
    setPoints((p) => [...p, { v: value, dir }].slice(-size));
  }, [value, size]);
  return points;
}

function RuGoldTicker({ value }) {
  const size = 8;
  const points = useRateHistory(value, size);
  const last = points[points.length - 1];
  const dir = last?.dir ?? 0;

  // Пока не накопилось хотя бы одно реальное изменение курса — показываем нейтральный
  // пульсирующий индикатор, чтобы не рисовать «пустой» бар-график до первых тиков.
  if (points.length < 2) {
    return (
      <span className="rl-rate rl-rate--flat">
        <i className="rl-rate-dot" aria-hidden />
        курс живой
      </span>
    );
  }

  const deltas = points.map((p, i) => Math.abs(p.v - (points[i - 1]?.v ?? p.v)));
  const max = Math.max(1, ...deltas);
  const label = dir === 1 ? 'растёт' : dir === -1 ? 'снижается' : 'живой';

  return (
    <span className={`rl-rate rl-rate--${dir === 1 ? 'up' : dir === -1 ? 'down' : 'flat'}`}>
      <span className="rl-rate-bars" aria-hidden>
        {Array.from({ length: size }).map((_, i) => {
          const p = points[i];
          const delta = p ? Math.abs(p.v - (points[i - 1]?.v ?? p.v)) : 0;
          const h = p ? 34 + Math.min(66, (delta / max) * 66) : 26;
          const cls = !p || p.dir === 0 ? '' : p.dir === 1 ? 'is-up' : 'is-down';
          return <i key={i} className={cls} style={{ height: `${h}%` }} />;
        })}
      </span>
      <i className="rl-rate-dot" aria-hidden />
      курс {label}
    </span>
  );
}

function SlitokPriceCard({ quote }) {
  const [proba, setProba] = useState(750);
  const [w, setW] = useState(5);
  const perGram = quote?.goldRubPerGram || null;
  const metal = perGram ? perGram * (proba / 1000) * w : null;
  const price = metal != null ? metal * MARKUP : null;
  const metalDisplay = useAnimatedNumber(metal);
  const priceDisplay = useAnimatedNumber(price);

  return (
    <motion.div className="rl-calc-card rl-calc-card--wide" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3, ease: EASE }}>
      <div className="rl-calc-top">
        <span className="rl-calc-brand">СЛИТОК</span>
        <RuGoldTicker value={perGram} />
      </div>
      <span className="rl-calc-label">Проба слитка</span>
      <div className="rl-seg">
        {PROBAS.map((p) => (
          <button key={p} type="button" className={p === proba ? 'is-active' : ''} onClick={() => setProba(p)}>{p}</button>
        ))}
      </div>
      <span className="rl-calc-label" style={{ marginTop: 12 }}>Вес слитка</span>
      <div className="rl-seg">
        {WEIGHTS.map((v) => (
          <button key={v} type="button" className={v === w ? 'is-active' : ''} onClick={() => setW(v)}>
            {String(v).replace('.', ',')} г
          </button>
        ))}
      </div>
      <div className="rl-calc-mini">
        <div>Золото в изделии<b>{metalDisplay != null ? formatMoney(metalDisplay) : '· · ·'}</b></div>
        <div>Наценка<b>~22%</b></div>
      </div>
      <p className="rl-calc-note rl-calc-note--breakdown">В наценку входит: изготовление, слэбирование, сертификация пробы, сертификат подлинности.</p>
      <div className="rl-calc-out">
        <span className="rl-calc-out-label">Цена слитка сегодня</span>
        <span className="rl-calc-out-val">{priceDisplay != null ? formatMoney(priceDisplay) : '· · ·'}</span>
        <span className="rl-calc-buyback">Доступен обратный выкуп — по курсу, на дату продажи изделия</span>
      </div>
      <p className="rl-calc-note">Слэбировано: проба, вес и сертификат зафиксированы в капсуле. Финальная цена зависит от формы — посчитаем в заявке.</p>
      <a href="#zayavka" className="rl-btn rl-btn--primary rl-calc-cta">Подобрать под бюджет</a>
    </motion.div>
  );
}

function SlitokForm() {
  return (
    <RuLeadForm
      source="slitki"
      title="Подобрать слиток"
      note="Оставьте телефон — предложим пробу, форму и вес под ваш бюджет, с точной ценой от биржи."
      phonePlaceholder="+7 (900) 000-00-00"
      phoneTel
      successNote="Менеджер свяжется с вами и предложит варианты под ваш бюджет."
      fields={[
        { key: 'budget', label: 'Бюджет или вес', placeholder: 'Бюджет или желаемый вес (не обязательно)', full: true },
      ]}
    />
  );
}

export function RuSlitki() {
  const quote = useGoldQuote();
  const lenisRef = useRuLenis();
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });

  useEffect(() => { setDraftMeta('Купить слиток — Reaktivo (черновик)'); }, []);

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />
      <div className="rl-preview-flag">Черновик для просмотра · не окончательная версия</div>

      <RuHeader active="/ru/slitki/" lenisRef={lenisRef} ctaHref="#zayavka" ctaLabel="Выбрать слиток" />

      <main>
        <p className="rl-crumbs"><a href="/ru/">Reaktivo</a> · Купить</p>

        <section className="il-hero" style={{ paddingTop: '48px' }} ref={heroRef}>
          <RuHeroBg heroRef={heroRef} />
          <div className="il-hero-inner">
            <div className="il-hero-copy">
              <motion.span className="il-badge" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
                <i className="il-badge-dot" /> Новый формат хранения ценности
              </motion.span>
              <motion.h1 className="il-hero-title rl-hero-title" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1, ease: EASE }}>
                Слиток, который<br />можно <span className="il-accent-text">носить</span>
              </motion.h1>
              <motion.p className="il-hero-sub" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.32, ease: EASE }}>
                Не украшение, которое дешевеет в момент покупки, и не банковский слиток с высоким порогом входа.
                Точный вес, проба на выбор 585 · 750 · 900 и слэбирование, которое защищает сделку при обратной продаже.
              </motion.p>
              <motion.div className="il-hero-cta" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.44, ease: EASE }}>
                <Magnetic>
                  <motion.a href="#zayavka" className="il-btn il-btn--primary il-btn--lg" whileTap={{ scale: 0.96 }}>
                    Выбрать слиток
                    <span className="il-btn-arrow" aria-hidden>→</span>
                  </motion.a>
                </Magnetic>
                <motion.a href="#formy" className="il-btn il-btn--outline il-btn--lg" whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}>
                  Подробнее
                </motion.a>
              </motion.div>
            </div>
            <SlitokPriceCard quote={quote} />
          </div>
        </section>

        <RuMarquee items={[
          'Пробы 585 · 750 · 900', 'Слэбировано и пронумеровано', 'Цена привязана к бирже', 'Доставка по всей стране',
          'Обратный выкуп по курсу биржи', 'Тематические коллекции',
        ]} />

        <section className="il-section rl-kpis-section">
          <div className="il-section-inner">
            <RuKpis items={[
              { val: '3×', label: 'выгоднее при продаже, чем обычные украшения', icon: 'coins', imgDark: '/ru/kpi-multiplier-dark.jpg', imgLight: '/ru/kpi-multiplier-light.jpg' },
              { val: '585 · 750 · 900', label: 'ювелирные пробы слитка', icon: 'gem', imgDark: '/ru/kpi-hallmark-dark.jpg', imgLight: '/ru/kpi-hallmark-light.jpg' },
              { val: 'Слэбировано', label: 'капсула: слэб, проба, вес, сертификат', icon: 'shield', imgDark: '/ru/kpi-shield-dark.jpg', imgLight: '/ru/kpi-shield-light.jpg' },
              { val: 'Обратный выкуп', label: 'гарантирован Reaktivo', icon: 'check', imgDark: '/ru/kpi-check-dark.jpg', imgLight: '/ru/kpi-check-light.jpg' },
            ]} />
          </div>
        </section>

        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Почему это интереснее ювелирки</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Золото, которое остаётся <span className="il-accent-text">деньгами</span></h2></Reveal>
            </div>
            <motion.div className="il-cards" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
              {WHY.map((a) => (
                <motion.div className="il-card" key={a.title} variants={staggerChild} whileHover={{ y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
                  <h3 className="il-card-title">{a.title}</h3>
                  <p className="il-card-text">{a.text}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="il-section" id="sravnenie">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Пример на 10 г, проба 750</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Украшение против слитка Reaktivo</h2></Reveal>
              <Reveal delay={0.14}><p className="il-section-lead">При условной стоимости чистого металла 11 000 ₽/г металл в изделии стоит 82 500 ₽ — дальше судьба этих денег расходится.</p></Reveal>
            </div>
            <Reveal delay={0.1} className="rl-compare">
              <div className="rl-compare-row rl-compare-head">
                <span />
                <span>Украшение 750, 10 г</span>
                <span className="rl-compare-win">Слиток Reaktivo, 750, 10 г</span>
              </div>
              {COMPARE.map((r) => (
                <div className="rl-compare-row" key={r.label}>
                  <span className="rl-compare-label">{r.label}</span>
                  <span>{r.jewelry}</span>
                  <span className="rl-compare-win">{r.bar}</span>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        <section className="il-section" id="formy">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Форматы</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Одна идея — четыре формы</h2></Reveal>
            </div>
            <div className="rl-media-split rl-media-split--fill">
              <div className="rl-rows rl-rows--forms">
                {FORMS.map((s, i) => (
                  <Reveal key={s.n} delay={i * 0.05} className="rl-row rl-row--forms">
                    <span className="rl-row-n rl-row-n--lg">{s.n}</span>
                    <div><h4>{s.title}</h4><p>{s.text}</p></div>
                  </Reveal>
                ))}
              </div>
              <RuTiltCard className="rl-media-split-visual">
                <img src="/ru/slitok.jpg" alt="Слиток-подвеска на золотой цепочке" loading="lazy" decoding="async" />
              </RuTiltCard>
            </div>
          </div>
        </section>

        <RuStatement text="Обычные украшения теряют более половины стоимости сразу после покупки. Ювелирный слиток Reaktivo — новый формат сохранения и увеличения ценности." />

        <section className="il-section il-section--alt">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Как купить</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Четыре шага до слитка</h2></Reveal>
            </div>
            <div className="rl-rows">
              {STEPS.map((s, i) => (
                <Reveal key={s.n} delay={i * 0.05} className="rl-row">
                  <span className="rl-row-n">{s.n}</span>
                  <div><h4>{s.title}</h4><p>{s.text}</p></div>
                </Reveal>
              ))}
            </div>
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

        <section className="il-section il-section--cta" id="zayavka">
          <div className="il-section-inner il-section-inner--narrow">
            <Reveal>
              <RuCtaPanel>
                <SlitokForm />
              </RuCtaPanel>
            </Reveal>
          </div>
        </section>
      </main>

      <RuFooter />

      <style>{IL_CSS}</style>
      <style>{RL_CSS}</style>
    </div>
  );
}
