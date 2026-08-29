import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'motion/react';
import { CSS as IL_CSS, EASE, Magnetic, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuFaq, RuFooter, RuHeader, RuHeroBg, RuKpis, RuMarquee, RuPhotoCard, RuSbpBadge, RuStatement, RuTiltCard,
  GramsSlider, formatMoney, officeHallPhoto, setDraftMeta, useAnimatedNumber, useGoldQuote, useRuLenis,
} from './RuShared.jsx';

const DIRECTIONS = [
  {
    tag: 'Выкуп золота', title: 'Продать золото', href: '/ru/prodat/', live: true,
    text: 'Оценка по бирже, оплата сразу — в отделениях или с курьером.',
  },
  {
    tag: 'Регионы', title: 'Работа', href: '/ru/agenty/', live: true,
    text: 'Обучение, набор для проверки золота, и доступ в приложение — зарабатывайте в своём городе и регионе.',
  },
  {
    tag: 'Интернет-магазин', title: 'Ювелирные слитки', href: '/ru/slitki/', live: true,
    text: 'Слиток-украшение: цепочка, подвеска, кулон. Официально ювелирное изделие, доставка по всей стране.',
  },
  {
    tag: 'Reaktivo Resale', title: 'Проверенные украшения', href: '/ru/resale/', live: true,
    text: 'Брендовые изделия из выкупа после экспертизы и чистки — мировые бренды по выгодной цене в Telegram.',
  },
  {
    tag: 'Франшиза', title: 'Открыть отделение', href: '/ru/franshiza/', live: true,
    text: 'Запуск под ключ или экспресс-переход для действующих скупок и ломбардов: бренд, операционная система, процессы и поддержка.',
  },
  {
    tag: 'B2B', title: 'Партнёрам', href: '/ru/partneram/', live: true,
    text: 'Ювелиры, ломбарды и дилеры получают специальный курс на продажу и покупку, приоритетную логистику и совместные программы.',
  },
];

const STEPS = [
  { n: '01', title: 'Считаете сами', text: 'Укажите пробу и вес в калькуляторе. Ваш результат — точная сумма, которую вы получите, а не раздутая оценка.' },
  { n: '02', title: 'Оформляете заявку', text: 'Укажите адрес и удобное время. Или приезжайте в отделение — курс будет тот же самый.' },
  { n: '03', title: 'Проверка при вас', text: 'Проба и вес определяются на ваших глазах. Никаких комиссий и вычетов из-за состояния изделия.' },
  { n: '04', title: 'Деньги и документы', text: 'Наличные на месте или перевод. Договор — в приложении, без бумажной волокиты.' },
];

const ADVANTAGES = [
  { title: 'Курс с двух бирж', text: 'Собственная программа берёт котировки Москвы и Лондона и пересчитывает цену грамма каждые три секунды.' },
  { title: 'Наценка видна', text: 'Клиент получает до 90% биржевой стоимости. Мы показываем, из чего складывается остаток, а не прячем его.' },
  { title: 'Одна цена для всех', text: 'Единственное, что влияет на курс выкупа, — это биржа. Один и тот же курс на сайте, в отделениях и у курьера.' },
];

const FAQ = [
  { q: 'Почему цена выше, чем в ломбарде?', a: 'Ломбарды закладывают риск невыкупа и расходы на хранение. При залоге вы получаете не более 50% стоимости изделия, а затем вынуждены выкупать его обратно. Мы платим сразу до 90% и не зарабатываем на клиенте за счёт разницы.' },
  { q: 'Что если клеймо стёрлось?', a: 'Проба определяется пробирным реактивом и, при необходимости, спектральным анализом — всё при вас. Мы не вычитаем никаких комиссий из-за состояния изделий.' },
  { q: 'Что если я не соглашусь с оценкой?', a: 'Продажа не является обязательной: вы всегда можете отказаться или передумать — это бесплатно.' },
  { q: 'Нужны ли документы на изделие?', a: 'Нет, достаточно паспорта — это требование закона к самой сделке, а не проверка происхождения вещи.' },
];

function LiveCalcCard({ quote }) {
  const [proba, setProba] = useState(585);
  const [grams, setGrams] = useState(12);
  const perGram = quote?.goldRubPerGram || null;
  const sum = perGram ? perGram * (proba / 1000) * grams * 0.9 : null;
  const sumDisplay = useAnimatedNumber(sum);

  return (
    <motion.div className="rl-calc-card" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.5, ease: EASE }}>
      <div className="rl-calc-top">
        <span className="rl-calc-brand">REAKTIVO<i>·</i>RU</span>
        <span className="rl-calc-live"><i />live</span>
      </div>
      <span className="rl-calc-label">Сколько вы получаете</span>
      <div className="rl-seg">
        {[375, 585, 750, 999].map((p) => (
          <button key={p} type="button" className={p === proba ? 'is-active' : ''} onClick={() => setProba(p)}>{p}</button>
        ))}
      </div>
      <GramsSlider value={grams} onChange={setGrams} max={500} />
      <div className="rl-calc-out">
        <span className="rl-calc-out-label">Вы получите наличными или переводом<RuSbpBadge /></span>
        <span className="rl-calc-out-val">{sumDisplay != null ? formatMoney(sumDisplay) : '· · ·'}</span>
      </div>
      <a href="/ru/prodat/" className="rl-btn rl-btn--primary rl-calc-cta">Точный расчёт и вызов курьера</a>
    </motion.div>
  );
}

export function RuHome() {
  const quote = useGoldQuote();
  const lenisRef = useRuLenis();
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });
  // Прогресс скролла именно внутри hero (а не абсолютные пиксели) — на мобильной
  // вёрстке блоки уходят в столбец и hero становится выше, фиксированный диапазон
  // в пикселях гасил калькулятор ещё до того, как его успевали открутить.
  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroFade = useTransform(heroProgress, [0, 0.9], [1, 0]);

  useEffect(() => { setDraftMeta('Reaktivo — выкуп золота без ломбардной логики (черновик)'); }, []);

  const goTo = (e, selector) => {
    e.preventDefault();
    if (lenisRef.current) lenisRef.current.scrollTo(selector, { offset: -84, duration: 1.5 });
    else document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth' });
  };

  const rate = quote?.goldRubPerGram ? Math.round(quote.goldRubPerGram * 0.585) : null;

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />
      <div className="rl-preview-flag">Черновик для просмотра · не окончательная версия</div>

      <RuHeader active="home" lenisRef={lenisRef} />

      <main>
        <section className="il-hero" ref={heroRef}>
          <RuHeroBg heroRef={heroRef} />
          <motion.div className="il-hero-inner" style={{ opacity: heroFade }}>
            <div className="il-hero-copy">
              <motion.span className="il-badge" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
                <i className="il-badge-dot" /> Сервис выкупа золота — без ломбардной логики
              </motion.span>

              <motion.h1
                className="il-hero-title rl-hero-title"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.12, ease: EASE }}
              >
                Курс, который<br />видно <span className="il-accent-text">до визита</span>
              </motion.h1>

              <motion.p className="il-hero-sub" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.4, ease: EASE }}>
                Оценка по биржевому курсу, оплата сразу — в отделении или с курьером.
                Мы платим всю стоимость. Никаких скрытых процентов и комиссий.
              </motion.p>

              <motion.div className="il-hero-cta" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.54, ease: EASE }}>
                <Magnetic>
                  <motion.a href="/ru/prodat/" className="il-btn il-btn--primary il-btn--lg" whileTap={{ scale: 0.96 }}>
                    Рассчитать стоимость
                    <span className="il-btn-arrow" aria-hidden>→</span>
                  </motion.a>
                </Magnetic>
                <motion.a href="#napravlenia" className="il-btn il-btn--outline il-btn--lg" onClick={(e) => goTo(e, '#napravlenia')} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}>
                  Все направления
                </motion.a>
              </motion.div>
            </div>

            <LiveCalcCard quote={quote} />
          </motion.div>
        </section>

        <RuMarquee items={[
          'Курс каждые 3 секунды', 'До 90% от биржи', 'Курьер бесплатно', 'Ювелирные слитки',
          'Resale в Telegram', 'Агенты по всей стране', 'Франшиза', 'Партнёрам',
        ]} />

        <section className="il-section rl-kpis-section">
          <div className="il-section-inner">
            <RuKpis items={[
              { val: rate ? formatMoney(rate) : '· · ·', label: 'курс за грамм 585 сейчас' },
              { val: 'до 90%', label: 'от биржевой стоимости' },
              { val: '15 мин', label: 'время сделки' },
              { val: '3 города', label: 'Калининград · Москва · СПб' },
            ]} />
          </div>
        </section>

        <section className="il-section" id="napravlenia">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Что у нас есть</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Не ещё одна скупка —<br /><span className="il-accent-text">настоящий сервис</span></h2></Reveal>
            </div>
            <motion.div className="il-products rl-products" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
              {DIRECTIONS.map((d) => (
                d.live ? (
                  <motion.a className="il-product" href={d.href} key={d.title} variants={staggerChild} whileHover={{ y: -3 }}>
                    <span className="il-product-tag">{d.tag}</span>
                    <h3 className="il-product-title">{d.title}</h3>
                    <p className="il-product-text">{d.text}</p>
                    <span className="il-product-link">Открыть раздел →</span>
                  </motion.a>
                ) : (
                  <motion.div className="il-product rl-product--soon" key={d.title} variants={staggerChild}>
                    <span className="il-product-tag">{d.tag}</span>
                    <h3 className="il-product-title">{d.title}</h3>
                    <p className="il-product-text">{d.text}</p>
                    <span className="rl-soon-chip">Готовим</span>
                  </motion.div>
                )
              ))}
            </motion.div>
          </div>
        </section>

        <section className="il-section" id="kak">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Как проходит сделка</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Четыре шага — от расчёта до денег</h2></Reveal>
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

        <RuStatement text="Курс, который вы видите на сайте, — это курс, который вы получите в отделении. Никакой «оценки на месте»." />

        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Почему на это можно опираться</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Принципы работы курса</h2></Reveal>
            </div>
            <div className="rl-media-split rl-media-split--even">
              <motion.div className="il-cards rl-media-split-cards" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
                {ADVANTAGES.map((a) => (
                  <motion.div className="il-card" key={a.title} variants={staggerChild} whileHover={{ y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
                    <h3 className="il-card-title">{a.title}</h3>
                    <p className="il-card-text">{a.text}</p>
                  </motion.div>
                ))}
              </motion.div>
              <RuTiltCard className="rl-media-split-visual">
                <img src="/ru/gold-bars.jpg" alt="Золотые украшения и слитки" loading="lazy" decoding="async" />
              </RuTiltCard>
            </div>
          </div>
        </section>

        <section className="il-section">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Настоящий сервис</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Отделение, а не окно в стене</h2></Reveal>
              <Reveal delay={0.14}><p className="il-section-lead">Светлый зал, отдельная зона проверки и оплаты. Никакой ломбардной атмосферы — только вы, эксперт и весы.</p></Reveal>
            </div>
            <Reveal delay={0.1} className="rl-photo-frame">
              <RuPhotoCard src={officeHallPhoto} alt="Зал отделения Reaktivo" caption="Отделение в Калининграде" />
            </Reveal>
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

        <section className="il-section il-section--cta">
          <div className="il-section-inner il-section-inner--narrow">
            <Reveal className="rl-cta-box">
              <h2 className="il-h2">Готовы посчитать точно?</h2>
              <p>Откройте калькулятор выкупа — сумма считается по текущему курсу, до визита курьера.</p>
              <a href="/ru/prodat/" className="il-btn il-btn--primary il-btn--lg">Рассчитать стоимость</a>
            </Reveal>
          </div>
        </section>
      </main>

      <RuFooter lenisRef={lenisRef} />

      <style>{IL_CSS}</style>
      <style>{RL_CSS}</style>
    </div>
  );
}
