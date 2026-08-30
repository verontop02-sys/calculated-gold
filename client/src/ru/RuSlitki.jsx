import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { CSS as IL_CSS, EASE, Magnetic, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuCtaPanel, RuFaq, RuFooter, RuHeader, RuHeroBg, RuKpis, RuLeadForm, RuMarquee, RuStatement, RuTiltCard,
  formatMoney, setDraftMeta, useAnimatedNumber, useGoldQuote, useRuLenis,
} from './RuShared.jsx';

const WHY = [
  { title: 'Точный вес и проба', text: 'Никаких скрытых потерь на замках, вставках и паразитных сплавах — весь заявленный вес это чистый металл заявленной пробы, 585, 750 или 900.' },
  { title: 'Слабировано как защита сделки', text: 'Слиток запечатан в капсулу с пробой, весом и серийным номером — по аналогии с грейдингом монет. Подлинность не нужно доказывать заново при каждой продаже.' },
  { title: 'Гарантированный выкуп Reaktivo', text: 'Купили у нас — можете продать обратно в любом отделении по прозрачному биржевому курсу, без поиска покупателя самостоятельно.' },
];

const COMPARE = [
  { label: 'Наценка при покупке', jewelry: '80–130% сверх металла', bar: '15–30% сверх металла' },
  { label: 'За что наценка', jewelry: 'Дизайн, бренд, работа мастера', bar: 'Подлинность, серия, слабирование' },
  { label: 'Проверка при сдаче', jewelry: 'Полная переоценка каждый раз', bar: 'Не нужна — подтверждено слабом' },
  { label: 'Обратный выкуп', jewelry: '~80–85% от стоимости металла', bar: '~92–95% от стоимости металла' },
  { label: 'Риск скрытой потери веса', jewelry: 'Да — замки, вставки, сплавы', bar: 'Нет — точный вес и проба' },
  { label: 'Вторичный рынок', jewelry: 'Отсутствует', bar: 'Есть — тематические коллекции' },
];

const FORMS = [
  { n: '01', title: 'Цепочка', text: 'Слиток-звено в плетении: украшение, которое остаётся инвестицией. Вес и проба зафиксированы на клейме.' },
  { n: '02', title: 'Подвеска', text: 'Классический мини-слиток на цепочку: строгая форма, клеймо и проба на лицевой стороне.' },
  { n: '03', title: 'Кулон', text: 'Слиток в оправе — ближе к ювелирному украшению, дальше от сейфа. Носится каждый день.' },
  { n: '04', title: 'Тематическая серия', text: 'Лимитированные коллекции с собственным дизайном — коллекционная ценность сверх стоимости металла.' },
];

const STEPS = [
  { n: '01', title: 'Заявка', text: 'Оставьте телефон — менеджер уточнит, что подбираем: проба, вес, форма, бюджет.' },
  { n: '02', title: 'Подбор и расчёт', text: 'Предложим варианты с точным весом и ценой, посчитанной от биржевого курса на день покупки.' },
  { n: '03', title: 'Оплата и оформление', text: 'Официальная продажа ювелирного изделия со слабированием, документами и чеком.' },
  { n: '04', title: 'Доставка или самовывоз', text: 'Доставим по всей стране или отдадим в отделении — как вам удобнее.' },
];

const FAQ = [
  { q: 'Чем слиток-украшение отличается от обычной ювелирки?', a: 'Вес и проба зафиксированы и запечатаны в капсулу — никаких потерь на замках, вставках и сплавах. Наценка при покупке 15–30% против 80–130% у обычного украшения, а при обратной продаже вы теряете в 2,5–3 раза меньше.' },
  { q: 'Что такое слабирование?', a: 'Слиток запечатывается в защищённую капсулу с указанием пробы, веса и серийного номера — как грейдинг монет. Это подтверждает подлинность и характеристики без повторной экспертизы при каждой сделке.' },
  { q: 'Можно ли продать слиток обратно?', a: 'Да. Reaktivo ежедневно выкупает золото по живому курсу: принесите слиток в любое отделение или вызовите курьера. Слабированный слиток проходит без переоценки — это быстрее и выгоднее.' },
  { q: 'Что за тематические коллекции?', a: 'Лимитированные серии слитков, объединённые темой или дизайном. У удачных коллекций есть коллекционная надбавка сверх стоимости металла — то, чего не может обычное украшение.' },
  { q: 'Как считается цена?', a: 'От биржевого курса золота на день покупки, пересчитанного на пробу и вес, плюс наценка 15–30% за работу и слабирование. Точный расчёт вы видите до оплаты — без скрытых наценок.' },
  { q: 'Это подходит как подарок?', a: 'Да, и лучше обычной ювелирки: помимо эстетической и подарочной ценности слиток сохраняет статус актива, привязанного к металлу, а не к витринной наценке.' },
];

const PROBAS = [585, 750, 900];
const WEIGHTS = [1, 2.5, 5, 10, 20];
const MARKUP = 1.22; // середина диапазона 15–30% сверх металла

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
        <span className="rl-calc-brand">СЛИТОК<i>·</i>REAKTIVO</span>
        <span className="rl-calc-live"><i />курс живой</span>
      </div>
      <span className="rl-calc-label">Проба слитка</span>
      <div className="rl-seg">
        {PROBAS.map((p) => (
          <button key={p} type="button" className={p === proba ? 'is-active' : ''} onClick={() => setProba(p)}>{p}</button>
        ))}
      </div>
      <span className="rl-calc-label" style={{ marginTop: 12 }}>Вес изделия</span>
      <div className="rl-seg">
        {WEIGHTS.map((v) => (
          <button key={v} type="button" className={v === w ? 'is-active' : ''} onClick={() => setW(v)}>
            {String(v).replace('.', ',')} г
          </button>
        ))}
      </div>
      <div className="rl-calc-mini">
        <div>Металл в изделии<b>{metalDisplay != null ? formatMoney(metalDisplay) : '· · ·'}</b></div>
        <div>Наценка<b>~22%</b></div>
      </div>
      <div className="rl-calc-out">
        <span className="rl-calc-out-label">Цена слитка сегодня</span>
        <span className="rl-calc-out-val">{priceDisplay != null ? formatMoney(priceDisplay) : '· · ·'}</span>
      </div>
      <p className="rl-calc-note">Слабировано: проба, вес и серийный номер зафиксированы в капсуле. Финальная цена зависит от формы — посчитаем в заявке.</p>
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

  useEffect(() => { setDraftMeta('Ювелирные слитки — Reaktivo (черновик)'); }, []);

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />
      <div className="rl-preview-flag">Черновик для просмотра · не окончательная версия</div>

      <RuHeader active="/ru/slitki/" lenisRef={lenisRef} ctaHref="#zayavka" ctaLabel="Выбрать слиток" />

      <main>
        <p className="rl-crumbs"><a href="/ru/">Reaktivo</a> · Ювелирные слитки</p>

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
                Точный вес, проба 585–900 и слабирование, которое защищает сделку при обратной продаже.
              </motion.p>
              <motion.div className="il-hero-cta" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.44, ease: EASE }}>
                <Magnetic>
                  <motion.a href="#zayavka" className="il-btn il-btn--primary il-btn--lg" whileTap={{ scale: 0.96 }}>
                    Выбрать слиток
                    <span className="il-btn-arrow" aria-hidden>→</span>
                  </motion.a>
                </Magnetic>
                <motion.a href="#formy" className="il-btn il-btn--outline il-btn--lg" whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}>
                  Формы и веса
                </motion.a>
              </motion.div>
            </div>
            <SlitokPriceCard quote={quote} />
          </div>
        </section>

        <RuMarquee items={[
          'Пробы 585 · 750 · 900', 'Слабировано и пронумеровано', 'Цена привязана к бирже', 'Доставка по всей стране',
          'Обратный выкуп по живому курсу', 'Тематические коллекции',
        ]} />

        <section className="il-section rl-kpis-section">
          <div className="il-section-inner">
            <RuKpis items={[
              { val: 'до 3×', label: 'меньше теряете при продаже, чем на украшении' },
              { val: '585–900', label: 'ювелирные пробы слитка' },
              { val: 'слабировано', label: 'капсула, проба, вес, серийный номер' },
              { val: 'выкуп', label: 'гарантирован в сети Reaktivo' },
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
                <span className="rl-compare-win">Слиток Reaktivo, 10 г</span>
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
              <div className="rl-rows">
                {FORMS.map((s, i) => (
                  <Reveal key={s.n} delay={i * 0.05} className="rl-row">
                    <span className="rl-row-n">{s.n}</span>
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

        <RuStatement text="Обычная ювелирка теряет больше половины цены на выходе из магазина. Слиток Reaktivo — не украшение и не банковский слиток, а свой формат хранения ценности." />

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
