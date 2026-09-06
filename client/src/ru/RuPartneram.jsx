import { useEffect } from 'react';
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';
import { CSS as IL_CSS, EASE, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuCtaPanel, RuFaq, RuFooter, RuFullHero, RuGoldTicker, RuHeader, RuKpis, RuLeadForm, RuMarquee, RuStatement, RuTimeline,
  formatMoney, setDraftMeta, useAnimatedNumber, useGoldQuote, useRuLenis, useShowcaseCycle,
} from './RuShared.jsx';

const WHO = [
  { title: 'Ювелирные мастерские', text: 'Покупка и продажа по специальному курсу, а также создание совместных коллекций.' },
  { title: 'Ломбарды и скупки', text: 'Развитие Resale-продаж, а также обмен качественным клиентским трафиком.' },
  { title: 'Дилеры и оптовики', text: 'Стабильные объёмы в обе стороны: продажа и покупка с привязкой к бирже, а не к «настроению рынка».' },
];

const GIVES = [
  { n: '01', title: 'Специальный курс', text: 'Для партнёров действует отдельная сетка курса на продажу и покупку — выгоднее публичной. Зависит от объёма и регулярности.' },
  { n: '02', title: 'Приоритетная логистика', text: 'Партнёрские партии принимаются и обрабатываются в первую очередь. Для объёмов организуем выезд к вам.' },
  { n: '03', title: 'Совместные программы', text: 'Обмен клиентами, размещение изделий в Resale, направление заявок на ремонт и изготовление в вашу мастерскую.' },
  { n: '04', title: 'Прозрачные документы', text: 'Договор, спецификации и закрывающие документы по каждой партии. Отражение всех операций в ГИИС ДМДК.' },
];

const STEPS = [
  { n: '01', title: 'Заявка', text: 'Коротко расскажите, кто вы и какие объёмы: покупка, продажа или обе стороны.' },
  { n: '02', title: 'Персональный менеджер', text: 'Обсуждаем потребности и показываем партнёрскую сетку курса под ваш профиль.' },
  { n: '03', title: 'Тестовая партия', text: 'Проверяете курс, скорость и расчёт на небольшом объёме — без обязательств.' },
  { n: '04', title: 'Договор и постоянные условия', text: 'Фиксируем условия, логистику и документы. Дальше — рабочий ритм.' },
];

const FAQ = [
  { q: 'Какой минимальный объём?', a: 'Жёсткого порога нет: условия зависят от регулярности и объёма. Оставьте заявку — подберём формат под ваш случай, даже если начинаете с малого.' },
  { q: 'Насколько курс лучше публичного?', a: 'Партнёрская сетка зависит от объёма и направления — покупка или продажа. Точные цифры называем после первого разговора и фиксируем в договоре, а не «на словах».' },
  { q: 'Как проходит расчёт?', a: 'По договору, безналично и без задержек: партия принята и проверена — расчёт произведён. Никаких «подождите до пятницы».' },
  { q: 'Вы выезжаете к партнёрам?', a: 'Да, для партнёрских объёмов действует приоритетная логистика, включая выезд за партией к вам.' },
  { q: 'Можно и продавать вам, и покупать у вас?', a: 'Да, программа работает в обе стороны: сдавайте лом и изделия, покупайте металл — по одной партнёрской сетке.' },
];

function PartnerForm() {
  return (
    <RuLeadForm
      source="partneram"
      title="Заявка на партнёрство"
      note="Расскажите о компании — покажем партнёрскую сетку курса и предложим тестовую партию."
      namePlaceholder="Компания или имя"
      cta="Стать партнёром"
      successNote="Персональный менеджер свяжется с вами и покажет партнёрские условия."
      fields={[
        { key: 'profile', label: 'Профиль', placeholder: 'Профиль (ювелир / ломбард / дилер)', required: true },
        { key: 'volume', label: 'Объём в месяц', placeholder: 'Примерный объём в месяц' },
      ]}
    />
  );
}

const PARTNER_WAYS = [
  {
    key: 'in',
    title: 'Покупка у вас',
    sub: 'лом и изделия',
    img: '/ru/kpi-handshake-dark.jpg',
    pos: '50% 42%',
    seal: 'приём партий',
    hint: 'вы сдаёте — мы забираем',
    chips: ['ГИИС ДМДК', 'день в день', 'выезд за партией'],
  },
  {
    key: 'out',
    title: 'Продажа вам',
    sub: 'металл и слитки',
    img: '/ru/gold-bars-light.jpg',
    pos: '50% 48%',
    seal: 'отгрузка металлом',
    hint: 'вам — металл по сетке',
    chips: ['ГИИС ДМДК', 'своя сетка', 'сертификат'],
  },
];

function PartnerDeskCard({ quote }) {
  const perGram = quote?.goldRubPerGram || null;
  const rateDisplay = useAnimatedNumber(perGram);
  const [idx, go] = useShowcaseCycle(PARTNER_WAYS.length, 4800);
  const way = PARTNER_WAYS[idx];

  return (
    <div className="rl-b2b-stage">
      <span className="rl-b2b-ghost rl-b2b-ghost--2" aria-hidden />
      <span className="rl-b2b-ghost rl-b2b-ghost--1" aria-hidden />
      <motion.div className="rl-b2b" initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.35, ease: EASE }}>
        <div className="rl-b2b-bar">
          <span className="rl-b2b-mark" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M3 9h11M14 9l-3.2-3M14 9l-3.2 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 15H10M10 15l3.2 3M10 15l3.2-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="rl-b2b-bar-copy">
            <b>ПАРТНЁРСКИЙ СТОЛ</b>
            <i>{way.hint}</i>
          </span>
        </div>
        <button type="button" className="rl-b2b-media" onClick={() => go()} aria-label="Другое направление">
          <AnimatePresence mode="wait">
            <motion.img
              key={way.key}
              src={way.img}
              alt=""
              style={{ objectPosition: way.pos }}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            />
          </AnimatePresence>
          <span className="rl-b2b-seal">{way.seal}</span>
        </button>
        <div className="rl-b2b-ways">
          {PARTNER_WAYS.map((w, i) => (
            <button
              key={w.key}
              type="button"
              className={i === idx ? 'is-active' : ''}
              onClick={() => go(i)}
              aria-pressed={i === idx}
            >
              <span>{w.title}</span>
              <b>{w.sub}</b>
            </button>
          ))}
        </div>
        <div className="rl-b2b-rate">
          <div>
            <span className="rl-b2b-rate-label">публичный курс</span>
            <strong>{rateDisplay != null ? formatMoney(rateDisplay) : '· · ·'}<em>/г</em></strong>
          </div>
          <div className="rl-b2b-rate-aside">
            <span>партнёрам</span>
            <b>своя сетка</b>
            <RuGoldTicker value={perGram} change={quote?.change} />
          </div>
        </div>
        <div className="rl-b2b-foot">
          {way.chips.map((c) => <span key={c}>{c}</span>)}
        </div>
      </motion.div>
    </div>
  );
}

export function RuPartneram() {
  const quote = useGoldQuote();
  const lenisRef = useRuLenis();
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });

  useEffect(() => { setDraftMeta('Партнёрам — B2B с Reaktivo'); }, []);

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />

      <RuHeader active="/ru/partneram/" lenisRef={lenisRef} ctaHref="#zayavka" ctaLabel="Стать партнёром" />

      <main>
        <RuFullHero
          imgDark="/ru/partner.jpg"
          imgLight="/ru/partner-light.jpg"
          imgPos="58% 45%"
          kicker="B2B"
          title={<>Особые условия для тех, кто <span className="il-accent-text">в рынке</span></>}
          sub="Ювелиры, ломбарды и дилеры работают с Reaktivo по специальному курсу на продажу и покупку — с приоритетной логистикой и совместными программами."
          primary={{ href: '#zayavka', label: 'Стать партнёром' }}
          secondary={{ href: '#uslovia', label: 'Что даёт партнёрство' }}
          aside={<PartnerDeskCard quote={quote} />}
        />

        <RuMarquee items={[
          'Специальный курс', 'Объёмные сделки', 'Приоритетная логистика', 'Совместные программы',
          'Договор и документы', 'Расчёт без задержек',
        ]} />

        <section className="il-section rl-kpis-section">
          <div className="il-section-inner">
            <RuKpis items={[
              { val: 'биржа', label: 'сетка курса с привязкой к бирже', icon: 'percent', imgDark: '/ru/kpi-ticker-dark.jpg', imgLight: '/ru/kpi-ticker-light.jpg' },
              { val: '2 стороны', label: 'покупка и продажа металла', icon: 'users', imgDark: '/ru/kpi-handshake-dark.jpg', imgLight: '/ru/kpi-handshake-light.jpg' },
              { val: 'выезд', label: 'логистика за партией к вам', icon: 'send', imgDark: '/ru/kpi-parcel-dark.jpg', imgLight: '/ru/kpi-parcel-light.jpg' },
              { val: 'день в день', label: 'расчёт после проверки партии', icon: 'clock', imgDark: '/ru/kpi-time-dark.jpg', imgLight: '/ru/kpi-time-light.jpg' },
            ]} />
          </div>
        </section>

        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Кому подходит</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Работаем с профессионалами <span className="il-accent-text">рынка</span></h2></Reveal>
            </div>
            <motion.div className="il-cards" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
              {WHO.map((a) => (
                <motion.div className="il-card" key={a.title} variants={staggerChild} whileHover={{ y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
                  <h3 className="il-card-title">{a.title}</h3>
                  <p className="il-card-text">{a.text}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="il-section" id="uslovia">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Условия</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Что даёт партнёрство</h2></Reveal>
            </div>
            <RuTimeline items={GIVES} />
          </div>
        </section>

        <RuStatement text="B2B держится не на скидке, а на том, что каждый расчёт сходится и происходит вовремя." />

        <section className="il-section il-section--alt">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Старт</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">От заявки до рабочего ритма</h2></Reveal>
            </div>
            <RuTimeline items={STEPS} />
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
                <PartnerForm />
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
