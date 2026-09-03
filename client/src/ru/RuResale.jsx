import { useEffect } from 'react';
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';
import { CSS as IL_CSS, EASE, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuCtaPanel, RuFaq, RuFooter, RuFullHero, RuHeader, RuKpis, RuLeadForm, RuMarquee, RuStatement, RuTimeline,
  formatMoney, setDraftMeta, useAnimatedNumber, useGoldQuote, useRuLenis, useShowcaseCycle,
} from './RuShared.jsx';

const WHY = [
  { title: 'Без наценки магазина', text: 'В рознице ювелирные изделия продаются с кратной наценкой. В Resale цена считается от металла, бренда и состояния — без витринных процентов.' },
  { title: 'Проверено экспертом', text: 'Каждое изделие проходит проверку пробы и подлинности: реактивы, спектральный анализ, экспертиза бренда. Подделки до канала не доходят.' },
  { title: 'Чистое происхождение', text: 'Все изделия выкуплены официально, по паспортной сделке с договором. История каждой вещи известна с момента выкупа.' },
];

const PATH = [
  { n: '01', title: 'Выкуп', text: 'Reaktivo выкупает изделие у владельца по договору и проверяет его историю.' },
  { n: '02', title: 'Экспертиза', text: 'Проба, подлинность бренда, состояние. Всё, что не проходит проверку, уходит в переработку, а не в продажу.' },
  { n: '03', title: 'Чистка и полировка', text: 'Профессиональный уход и предпродажная подготовка: изделие выглядит так, как должно.' },
  { n: '04', title: 'Публикация в канале', text: 'Фото, честное описание и цена. Лучшие лоты первыми видят подписчики Telegram-канала.' },
];

const FAQ = [
  { q: 'Как я могу быть уверен в подлинности?', a: 'Каждое изделие проходит экспертизу пробы и бренда: реактивы, спектральный анализ, проверка клейм. Результат проверки фиксируется в описании лота.' },
  { q: 'Почему дешевле, чем в магазине?', a: 'Мы не закладываем розничную наценку: изделия приходят из выкупа, а цена считается от металла, бренда и состояния — без витринных процентов и аренды бутика.' },
  { q: 'Как купить лот?', a: 'Лоты публикуются в Telegram-канале. Пишете менеджеру, бронируете, оплачиваете — и получаете доставкой или в отделении.' },
  { q: 'Можно посмотреть изделие вживую?', a: 'Да, в городах присутствия лот можно посмотреть в отделении перед покупкой — договоритесь с менеджером о времени.' },
  { q: 'Откуда изделия?', a: 'Из ежедневного выкупа Reaktivo: люди продают золото и брендовые украшения, и лучшее после экспертизы попадает в Resale вместо переплавки.' },
];

const LOTS = [
  {
    id: 1847, name: 'Цепь', meta: '750 проба · 42,1 г', grams: 42.1, proba: 750,
    img: '/ru/resale.jpg', imgPos: '58% 48%', resaleK: 1.28, storeK: 2.38,
  },
  {
    id: 1842, name: 'Карманные часы', meta: 'золотой корпус · 22,4 г', grams: 22.4, proba: 750,
    img: '/ru/kpi-watch-dark.jpg', imgPos: '50% 72%', resaleK: 1.42, storeK: 2.85,
  },
  {
    id: 1838, name: 'Браслет', meta: '585 проба · 28,6 г', grams: 28.6, proba: 585,
    img: '/ru/hero-home-style-dark.jpg', imgPos: '72% 48%', resaleK: 1.32, storeK: 2.42,
  },
];

function ResaleLotMock({ quote }) {
  const [idx, go] = useShowcaseCycle(LOTS.length, 4200);
  const perGram = quote?.goldRubPerGram || null;

  const lot = LOTS[idx];
  const metal = perGram ? perGram * (lot.proba / 1000) * lot.grams : null;
  const resale = metal ? metal * lot.resaleK : null;
  const store = metal ? metal * lot.storeK : null;
  const resaleDisplay = useAnimatedNumber(resale);
  const off = resale && store ? Math.round((1 - resale / store) * 100) : null;

  return (
    <div className="rl-lot-stage">
      <span className="rl-lot-ghost rl-lot-ghost--2" aria-hidden />
      <span className="rl-lot-ghost rl-lot-ghost--1" aria-hidden />
      <motion.div className="rl-lot" initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.35, ease: EASE }}>
        <div className="rl-lot-bar">
          <span className="rl-lot-plane" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M3.4 11.2 21 4.2l-7.4 16.2-2.6-6.2-6.2-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="rl-lot-bar-copy">
            <b>REAKTIVO RESALE</b>
            <i>так выглядит канал</i>
          </span>
          <span className="rl-calc-live"><i />live</span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={lot.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.38, ease: EASE }}>
            <button type="button" className="rl-lot-media" onClick={() => go()} aria-label="Следующий лот">
              <img src={lot.img} alt="" style={{ objectPosition: lot.imgPos }} />
              <span className="rl-lot-new">новый лот</span>
              <span className="rl-lot-seal">экспертиза пройдена</span>
            </button>
            <div className="rl-lot-body">
              <div className="rl-lot-id">лот #{lot.id}</div>
              <h3>{lot.name}</h3>
              <p>{lot.meta}</p>
              <div className="rl-lot-checks">
                <span>Проба</span>
                <span>Подлинность</span>
                <span>SPA</span>
                <span>Договор</span>
              </div>
              <div className="rl-lot-price">
                <div>
                  <span className="rl-lot-price-label">цена в канале</span>
                  <strong>{resaleDisplay != null ? formatMoney(resaleDisplay) : '· · ·'}</strong>
                </div>
                <div className="rl-lot-store">
                  {store != null && <s>{formatMoney(store)}</s>}
                  {off != null && <b>−{off}%</b>}
                  <span>витрина бутика</span>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
        <div className="rl-lot-feed">
          <span className="rl-lot-feed-title">в канале сегодня</span>
          {LOTS.map((l, i) => (
            <button
              type="button"
              className={`rl-lot-feed-row${i === idx ? ' is-active' : ''}`}
              key={l.id}
              onClick={() => go(i)}
              aria-pressed={i === idx}
            >
              <b>{i === idx ? 'сейчас' : 'ещё'}</b>
              <span>{l.name} · {l.meta.split(' · ')[0]}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function ResaleForm() {
  return (
    <RuLeadForm
      source="resale"
      title="Получить доступ в канал"
      note="Оставьте контакт — пришлём ссылку на Telegram-канал Resale с новыми лотами."
      cta="Хочу в канал"
      successNote="Пришлём ссылку на канал и будем на связи по лотам."
    />
  );
}

export function RuResale() {
  const quote = useGoldQuote();
  const lenisRef = useRuLenis();
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });

  useEffect(() => { setDraftMeta('Reaktivo Resale — проверенные украшения'); }, []);

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />

      <RuHeader active="/ru/resale/" lenisRef={lenisRef} ctaHref="#zayavka" ctaLabel="Хочу в канал" />

      <main>
        <RuFullHero
          imgDark="/ru/resale.jpg"
          imgLight="/ru/resale-light.jpg"
          imgPos="60% 45%"
          kicker="Проверенные украшения"
          title={<>Брендовые украшения <span className="il-accent-text">после экспертизы</span></>}
          sub="Лучшие изделия из выкупа проходят проверку подлинности, пробы и чистку — и продаются в Telegram-канале по цене заметно ниже магазинной."
          primary={{ href: '#zayavka', label: 'Хочу в канал' }}
          secondary={{ href: '#kak', label: 'Как мы проверяем' }}
          aside={<ResaleLotMock quote={quote} />}
        />

        <RuMarquee items={[
          'Экспертиза каждого изделия', 'Мировые бренды', 'Чистка и полировка', 'Паспортные сделки',
          'Цена ниже магазина', 'Лоты в Telegram',
        ]} />

        <section className="il-section rl-kpis-section">
          <div className="il-section-inner">
            <RuKpis items={[
              { val: '100%', label: 'лотов проходят экспертизу', icon: 'check', imgDark: '/ru/kpi-check-dark.jpg', imgLight: '/ru/kpi-check-light.jpg' },
              { val: 'бренды', label: 'мировые дома и ювелирные марки', icon: 'star', imgDark: '/ru/kpi-medal-dark.jpg', imgLight: '/ru/kpi-medal-light.jpg' },
              { val: 'договор', label: 'происхождение каждой вещи известно', icon: 'shield', imgDark: '/ru/kpi-contract-dark.jpg', imgLight: '/ru/kpi-contract-light.jpg' },
              { val: 'Telegram', label: 'новые лоты первыми видят подписчики', icon: 'send', imgDark: '/ru/kpi-telegram-dark.jpg', imgLight: '/ru/kpi-telegram-light.jpg' },
            ]} />
          </div>
        </section>

        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Почему это выгодно</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Цена вещи, а не <span className="il-accent-text">витрины</span></h2></Reveal>
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

        <section className="il-section" id="kak">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Путь изделия</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">От выкупа до канала — четыре фильтра</h2></Reveal>
            </div>
            <RuTimeline items={PATH} />
          </div>
        </section>

        <RuStatement text="Хорошие вещи должны жить дольше одного владельца — особенно когда их цена честная." />

        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <Reveal>
              <RuCtaPanel>
                <h2 className="il-h2">Первыми видят подписчики</h2>
                <p>Новые лоты, бренды и цены публикуются в Telegram-канале Resale. Оставьте контакт — пришлём ссылку.</p>
                <a href="#zayavka" className="il-btn il-btn--primary il-btn--lg">Получить ссылку на канал</a>
              </RuCtaPanel>
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

        <section className="il-section il-section--cta" id="zayavka">
          <div className="il-section-inner il-section-inner--narrow">
            <Reveal>
              <RuCtaPanel>
                <ResaleForm />
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
