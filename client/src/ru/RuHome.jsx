import { useEffect, useState } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { CSS as IL_CSS, EASE, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuCtaPanel, RuFaq, RuFooter, RuFullHero, RuGoldTicker, RuHeader, RuKpis, RuMarketTiles, RuMarquee, RuPhotoCard, RuSbpBadge, RuStatement, RuThemedImg, RuTiltCard,
  GramsSlider, formatMoney, officeHallPhoto, ruHref, setDraftMeta, useAnimatedNumber, useGoldQuote, useRuLenis,
} from './RuShared.jsx';

const DIRECTIONS = [
  {
    tag: 'Выкуп золота', title: 'Продать золото', page: 'prodat',
    imgDark: '/ru/home-prodat.jpg', imgLight: '/ru/home-prodat-light.jpg', imgPos: '50% 58%',
    text: 'Оценка по бирже, оплата сразу — в отделениях или с курьером.',
  },
  {
    tag: 'Регионы', title: 'Работа', page: 'agenty',
    imgDark: '/ru/agent-kit.jpg', imgLight: '/ru/agent-kit-light.jpg', imgPos: '50% 22%',
    text: 'Обучение, набор для проверки золота, и доступ в приложение — зарабатывайте в своём городе и регионе.',
  },
  {
    tag: 'Интернет-магазин', title: 'Ювелирные слитки', page: 'slitki',
    imgDark: '/ru/home-slitok.jpg', imgLight: '/ru/home-slitok-light.jpg', imgPos: '50% 38%',
    text: 'Слиток-украшение: кулон, подвеска, цепочка. Ювелирное украшение, сохраняющее ценность.',
  },
  {
    tag: 'Reaktivo Resale', title: 'Проверенные украшения', page: 'resale',
    imgDark: '/ru/resale.jpg', imgLight: '/ru/resale-light.jpg', imgPos: '55% 45%',
    text: 'Брендовые изделия из выкупа — сразу после экспертизы и ювелирного SPA. Мировые бренды по выгодной цене.',
  },
  {
    tag: 'Франшиза', title: 'Открыть отделение', page: 'franshiza',
    imgDark: '/office-lobby.jpg', imgLight: '/office-lobby.jpg', imgPos: '70% 55%',
    text: 'Запуск под ключ или экспресс-переход для действующих скупок и ломбардов: бренд, операционная система, процессы и поддержка.',
  },
  {
    tag: 'B2B', title: 'Партнёрам', page: 'partneram',
    imgDark: '/ru/partner.jpg', imgLight: '/ru/partner-light.jpg', imgPos: '55% 45%',
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
  { title: 'Наценка видна', text: 'Клиент получает до 90% биржевой стоимости. Мы показываем, из чего складывается цена, а не прячем её.' },
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
        <RuGoldTicker value={perGram} change={quote?.change} />
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
      <a href={ruHref('prodat', '#zayavka')} className="rl-btn rl-btn--primary rl-calc-cta">Точный расчёт и вызов курьера</a>
    </motion.div>
  );
}

export function RuHome() {
  const quote = useGoldQuote();
  const lenisRef = useRuLenis();
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });

  useEffect(() => { setDraftMeta('Reaktivo — выкуп золота без ломбардной логики'); }, []);

  const goTo = (e, selector) => {
    e.preventDefault();
    if (lenisRef.current) lenisRef.current.scrollTo(selector, { offset: -84, duration: 1.5 });
    else document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />

      <RuHeader active="home" lenisRef={lenisRef} />

      <main>
        <RuFullHero
          imgDark="/ru/hero-home-style-dark.jpg"
          imgLight="/ru/hero-home-style-light.jpg"
          imgPos="62% 42%"
          kicker="Сервис выкупа золота — без ломбардной логики"
          title={<>Курс, который<br />видно <span className="il-accent-text">до визита</span></>}
          sub="Оценка по биржевому курсу, оплата сразу — в отделении или с курьером. Мы платим всю стоимость. Никаких скрытых процентов и комиссий."
          primary={{ href: ruHref('prodat'), label: 'Продать золото' }}
          secondary={{ href: '#napravlenia', label: 'Все направления', onClick: (e) => goTo(e, '#napravlenia') }}
          aside={<LiveCalcCard quote={quote} />}
        />

        <RuMarquee items={[
          'Курс каждые 3 секунды', 'До 90% от биржи', 'Курьер бесплатно', 'Ювелирные слитки',
          'Resale в Telegram', 'Агенты по всей стране', 'Франшиза', 'Партнёрам',
        ]} />

        <section className="il-section rl-kpis-section">
          <div className="il-section-inner">
            <RuKpis items={[
              { val: 'до 90%', label: 'от биржевой стоимости', icon: 'percent', imgDark: '/ru/kpi-percent-dark.jpg', imgLight: '/ru/kpi-percent-light.jpg' },
              { val: '45 мин', label: 'курьер приезжает', icon: 'clock', imgDark: '/ru/kpi-parcel-dark.jpg', imgLight: '/ru/kpi-parcel-light.jpg' },
              { val: '5 мин', label: 'время сделки', icon: 'bolt', imgDark: '/ru/kpi-watch-dark.jpg', imgLight: '/ru/kpi-watch-light.jpg' },
              { val: '3 города', label: 'Москва · Калининград · СПб', icon: 'pin', imgDark: '/ru/kpi-cities-dark.jpg', imgLight: '/ru/kpi-cities-light.jpg' },
            ]} />
          </div>
        </section>

        <section className="il-section" id="napravlenia">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Что у нас есть</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Не ещё одна скупка —<br /><span className="il-accent-text">настоящий сервис</span></h2></Reveal>
            </div>
            <motion.div className="rl-dirs" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
              {DIRECTIONS.map((d) => (
                <motion.a className="rl-dir" href={ruHref(d.page)} key={d.title} variants={staggerChild}>
                  <span className="rl-dir-media" aria-hidden>
                    <RuThemedImg dark={d.imgDark} light={d.imgLight} alt="" style={{ objectPosition: d.imgPos }} />
                    <span className="rl-dir-tag">{d.tag}</span>
                  </span>
                  <span className="rl-dir-body">
                    <h3 className="rl-dir-title">{d.title}</h3>
                    <p className="rl-dir-text">{d.text}</p>
                    <span className="rl-dir-link">Открыть раздел <i aria-hidden>→</i></span>
                  </span>
                </motion.a>
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
                <RuMarketTiles />
              </RuTiltCard>
            </div>
          </div>
        </section>

        <section className="il-section">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Настоящий сервис</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Высокий стандарт. Наш формат</h2></Reveal>
              <Reveal delay={0.14}><p className="il-section-lead">Во всём. Светлый зал, отдельная зона проверки и оплаты. Никакой ломбардной атмосферы, только вы и комфорт.</p></Reveal>
            </div>
            <Reveal delay={0.1}>
              <RuPhotoCard src={officeHallPhoto} alt="Зал отделения Reaktivo" />
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
            <Reveal>
              <RuCtaPanel>
                <h2 className="il-h2">Готовы посчитать точно?</h2>
                <p>Откройте калькулятор выкупа — сумма считается по текущему курсу, до визита курьера.</p>
                <a href={ruHref('prodat')} className="il-btn il-btn--primary il-btn--lg">Рассчитать стоимость</a>
              </RuCtaPanel>
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
