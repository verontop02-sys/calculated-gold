import { useEffect, useRef } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { CSS as IL_CSS, EASE, Magnetic, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuCtaPanel, RuFaq, RuFooter, RuHeader, RuHeroBg, RuKpis, RuLeadForm, RuMarquee, RuPhotoCard, RuStatement,
  setDraftMeta, useRuLenis,
} from './RuShared.jsx';

const WHY = [
  { title: 'Без наценки магазина', text: 'В рознице ювелирные изделия продаются с кратной наценкой. В Resale цена считается от металла, бренда и состояния — без витринных процентов.' },
  { title: 'Проверено экспертом', text: 'Каждое изделие проходит проверку пробы и подлинности: реактивы, спектральный анализ, экспертиза бренда. Подделки до канала не доходят.' },
  { title: 'Чистое происхождение', text: 'Все изделия выкуплены официально, по паспортной сделке с договором. История каждой вещи известна с момента выкупа.' },
];

const PATH = [
  { n: '01', title: 'Выкуп', text: 'Изделие приезжает из отделения или от курьера — по обычной паспортной сделке Reaktivo.' },
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
  const lenisRef = useRuLenis();
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });

  useEffect(() => { setDraftMeta('Reaktivo Resale — проверенные украшения (черновик)'); }, []);

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />
      <div className="rl-preview-flag">Черновик для просмотра · не окончательная версия</div>

      <RuHeader active="/ru/resale/" lenisRef={lenisRef} ctaHref="#zayavka" ctaLabel="Хочу в канал" />

      <main>
        <p className="rl-crumbs"><a href="/ru/">Reaktivo</a> · Resale</p>

        <section className="il-hero" style={{ paddingTop: '48px' }} ref={heroRef}>
          <RuHeroBg heroRef={heroRef} />
          <div className="il-hero-inner">
            <div className="il-hero-copy">
              <motion.span className="il-badge" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
                <i className="il-badge-dot" /> Reaktivo Resale
              </motion.span>
              <motion.h1 className="il-hero-title rl-hero-title" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1, ease: EASE }}>
                Брендовые украшения <span className="il-accent-text">после экспертизы</span>
              </motion.h1>
              <motion.p className="il-hero-sub" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.32, ease: EASE }}>
                Лучшие изделия из выкупа проходят проверку подлинности, пробы и чистку —
                и продаются в Telegram-канале по цене заметно ниже магазинной.
              </motion.p>
              <motion.div className="il-hero-cta" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.44, ease: EASE }}>
                <Magnetic>
                  <motion.a href="#zayavka" className="il-btn il-btn--primary il-btn--lg" whileTap={{ scale: 0.96 }}>
                    Хочу в канал
                    <span className="il-btn-arrow" aria-hidden>→</span>
                  </motion.a>
                </Magnetic>
                <motion.a href="#kak" className="il-btn il-btn--outline il-btn--lg" whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}>
                  Как мы проверяем
                </motion.a>
              </motion.div>
            </div>
            <motion.div className="rl-hero-visual" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.35, ease: EASE }}>
              <RuPhotoCard className="rl-hero-photo" src="/ru/resale.jpg" alt="Брендовые украшения после чистки на лотке ювелира" caption="После экспертизы и чистки" />
            </motion.div>
          </div>
        </section>

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
            <div className="rl-rows">
              {PATH.map((s, i) => (
                <Reveal key={s.n} delay={i * 0.05} className="rl-row">
                  <span className="rl-row-n">{s.n}</span>
                  <div><h4>{s.title}</h4><p>{s.text}</p></div>
                </Reveal>
              ))}
            </div>
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
