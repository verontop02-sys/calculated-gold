import { useEffect, useRef } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { CSS as IL_CSS, EASE, Magnetic, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuCtaPanel, RuFaq, RuFooter, RuHeader, RuHeroBg, RuKpis, RuLeadForm, RuMarquee, RuPhotoCard, RuStatement,
  setDraftMeta, useRuLenis,
} from './RuShared.jsx';

const WHO = [
  { title: 'Ювелирные мастерские', text: 'Покупайте лом как материал по специальному курсу и сдавайте излишки напрямую — без потери на посредниках.' },
  { title: 'Ломбарды и скупки', text: 'Сдавайте невыкупленные изделия и лом объёмами: понятная сетка курса и расчёт без задержек.' },
  { title: 'Дилеры и оптовики', text: 'Регулярные объёмы в обе стороны: продажа и покупка металла с привязкой к бирже, а не к «настроению рынка».' },
];

const GIVES = [
  { n: '01', title: 'Специальный курс', text: 'Для партнёров действует отдельная сетка курса на продажу и покупку — выгоднее публичной. Зависит от объёма и регулярности.' },
  { n: '02', title: 'Приоритетная логистика', text: 'Партнёрские партии принимаются и обрабатываются в первую очередь. Для объёмов организуем выезд к вам.' },
  { n: '03', title: 'Совместные программы', text: 'Обмен клиентами, размещение изделий в Resale, направление заявок на ремонт и изготовление в вашу мастерскую.' },
  { n: '04', title: 'Прозрачные документы', text: 'Договор, спецификации и закрывающие документы по каждой партии. Бухгалтерии обеих сторон спокойны.' },
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
        { key: 'profile', label: 'Профиль', placeholder: 'Профиль (ювелир / ломбард / дилер)' },
        { key: 'volume', label: 'Объём в месяц', placeholder: 'Примерный объём в месяц' },
      ]}
    />
  );
}

export function RuPartneram() {
  const lenisRef = useRuLenis();
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });

  useEffect(() => { setDraftMeta('Партнёрам — B2B с Reaktivo (черновик)'); }, []);

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />
      <div className="rl-preview-flag">Черновик для просмотра · не окончательная версия</div>

      <RuHeader active="/ru/partneram/" lenisRef={lenisRef} ctaHref="#zayavka" ctaLabel="Стать партнёром" />

      <main>
        <p className="rl-crumbs"><a href="/ru/">Reaktivo</a> · Партнёрам</p>

        <section className="il-hero" style={{ paddingTop: '48px' }} ref={heroRef}>
          <RuHeroBg heroRef={heroRef} />
          <div className="il-hero-inner">
            <div className="il-hero-copy">
              <motion.span className="il-badge" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
                <i className="il-badge-dot" /> B2B
              </motion.span>
              <motion.h1 className="il-hero-title rl-hero-title" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1, ease: EASE }}>
                Особые условия для тех, кто <span className="il-accent-text">в рынке</span>
              </motion.h1>
              <motion.p className="il-hero-sub" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.32, ease: EASE }}>
                Ювелиры, ломбарды и дилеры работают с Reaktivo по специальному курсу
                на продажу и покупку — с приоритетной логистикой и совместными программами.
              </motion.p>
              <motion.div className="il-hero-cta" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.44, ease: EASE }}>
                <Magnetic>
                  <motion.a href="#zayavka" className="il-btn il-btn--primary il-btn--lg" whileTap={{ scale: 0.96 }}>
                    Стать партнёром
                    <span className="il-btn-arrow" aria-hidden>→</span>
                  </motion.a>
                </Magnetic>
                <motion.a href="#uslovia" className="il-btn il-btn--outline il-btn--lg" whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}>
                  Что даёт партнёрство
                </motion.a>
              </motion.div>
            </div>
            <motion.div className="rl-hero-visual rl-photo-frame" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.35, ease: EASE }}>
              <RuPhotoCard className="rl-hero-photo" src="/ru/partner.jpg" alt="Приёмка партнёрской партии: лоток с золотом у прецизионных весов" caption="Партии принимаются в приоритете" />
            </motion.div>
          </div>
        </section>

        <RuMarquee items={[
          'Специальный курс', 'Объёмные сделки', 'Приоритетная логистика', 'Совместные программы',
          'Договор и документы', 'Расчёт без задержек',
        ]} />

        <section className="il-section rl-kpis-section">
          <div className="il-section-inner">
            <RuKpis items={[
              { val: 'биржа', label: 'сетка курса с привязкой к бирже', icon: 'percent', imgDark: '/ru/kpi-ticker-dark.jpg', imgLight: '/ru/kpi-ticker-light.jpg' },
              { val: '2 стороны', label: 'покупка и продажа металла', icon: 'users', imgDark: '/ru/kpi-handshake-dark.jpg', imgLight: '/ru/kpi-handshake-light.jpg' },
              { val: 'выезд', label: 'логистика за партией к вам', icon: 'send', imgDark: '/ru/kpi-courier-dark.jpg', imgLight: '/ru/kpi-courier-light.jpg' },
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
            <div className="rl-rows">
              {GIVES.map((s, i) => (
                <Reveal key={s.n} delay={i * 0.05} className="rl-row">
                  <span className="rl-row-n">{s.n}</span>
                  <div><h4>{s.title}</h4><p>{s.text}</p></div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <RuStatement text="B2B держится не на скидке, а на том, что каждый расчёт сходится и происходит вовремя." />

        <section className="il-section il-section--alt">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Старт</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">От заявки до рабочего ритма</h2></Reveal>
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
