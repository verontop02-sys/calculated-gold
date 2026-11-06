import { useEffect } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { CSS as IL_CSS, EASE, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuCtaPanel, RuFaq, RuFooter, RuFullHero, RuHeader, RuKpis, RuLeadForm, RuMarquee, RuThemedImg, RuTiltCard,
  ruHref, setDraftMeta, useRuLenis,
} from './RuShared.jsx';

const ACCEPT = [
  { title: 'Лом', text: 'Цепи, кольца, серьги без пары, обломки. Клеймо не обязательно: пробу смотрим на месте.' },
  { title: 'Украшения', text: 'Целые изделия любых проб. Камни и состояние не снижают выплату отдельной комиссией.' },
  { title: 'Монеты', text: 'Инвестиционные и памятные. Смотрим металл и вес, не коллекционную надбавку.' },
  { title: 'Столовое серебро', text: 'Ложки, вилки, подстаканники и посуда. Принимаем набором и по одной вещи.' },
];

const POINTS = [
  {
    title: 'Принимаем серебро любого вида',
    text: 'Лом, украшения, монеты, столовое серебро — любых проб. Оцениваем в отделении при вас.',
  },
  {
    title: 'Только в отделении',
    text: 'Курьер по серебру не выезжает. Приезжайте в офис Reaktivo — там же проверка и выплата.',
  },
  {
    title: 'Без онлайн-калькулятора',
    text: 'Серебро дешевле золота, поэтому на сайте нет отдельного калькулятора. Точную сумму скажет эксперт на месте.',
  },
  {
    title: 'Пробы 800, 875, 925 и 999',
    text: 'Рабочие пробы серебра считаем по курсу ЦБ и политике выкупа отделения. Паспорт нужен по закону.',
  },
];

const STEPS = [
  { n: '01', title: 'Приезжаете в отделение', text: 'Запишитесь по телефону или оставьте заявку ниже — согласуем удобное время.' },
  { n: '02', title: 'Проверка при вас', text: 'Вес и проба определяются на месте. Вы видите тот же результат, что и эксперт.' },
  { n: '03', title: 'Деньги сразу', text: 'Наличные или перевод после подписания договора. Без скрытых комиссий за оценку.' },
];

const FAQ = [
  { q: 'Какое серебро принимаете?', a: 'Любое: лом, украшения, монеты, столовые приборы — пробы 800, 875, 925, 999 и другие, если металл подтверждается при проверке.' },
  { q: 'Почему нет калькулятора на сайте?', a: 'Стоимость серебра заметно ниже золота, и онлайн-цифра часто путает. Честнее назвать сумму в отделении после проверки.' },
  { q: 'Курьер приедет за серебром?', a: 'Нет. Выкуп серебра — только в отделении. Курьер по-прежнему выезжает за золотом.' },
  { q: 'Нужен паспорт?', a: 'Да, это требование закона к сделке приёма металла, а не проверка, откуда вещь.' },
  { q: 'А золото тоже можно?', a: 'Да. Золото считайте и продавайте в разделе «Продать золото» — там калькулятор и вызов курьера.' },
];

function LeadForm() {
  return (
    <RuLeadForm
      source="serebro"
      title="Записаться в отделение"
      note="Оставьте телефон — согласуем визит. Курьер по серебру не выезжает."
      phonePlaceholder="+7 (900) 000-00-00"
      phoneTel
      successNote="Мы перезвоним и подберём удобное время в отделении."
    />
  );
}

export function RuSerebro() {
  const lenisRef = useRuLenis();
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });

  useEffect(() => { setDraftMeta('Выкуп серебра — Reaktivo'); }, []);

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />

      <RuHeader active="/ru/serebro/" lenisRef={lenisRef} ctaHref="#zayavka" ctaLabel="Записаться" />

      <main>
        <RuFullHero
          imgDark="/ru/hero-serebro-dark.jpg"
          imgLight="/ru/hero-serebro-light.jpg"
          imgPos="50% 52%"
          kicker="Выкуп серебра"
          title={<>Принимаем серебро<br /> <span className="il-accent-text">в отделении</span></>}
          sub="Лом и изделия любых проб. Оценка и выплата на месте. Без курьера и без онлайн-калькулятора — честная сумма после проверки."
          primary={{ href: '#zayavka', label: 'Записаться в отделение' }}
          secondary={{ href: ruHref('prodat'), label: 'Продать золото' }}
        />

        <RuMarquee items={[
          'Только отделение', 'Пробы 800 · 875 · 925 · 999', 'Без курьера', 'Проверка при вас',
          'Деньги сразу', 'Паспорт по закону', 'Без онлайн-калькулятора', 'Лом и украшения',
        ]} />

        <section className="il-section rl-kpis-section">
          <div className="il-section-inner">
            <RuKpis items={[
              { val: '4 пробы', label: '800, 875, 925 и 999', icon: 'percent', imgDark: '/ru/kpi-hallmark-dark.jpg', imgLight: '/ru/kpi-hallmark-light.jpg' },
              { val: 'Офис', label: 'оценка и выплата в отделении', icon: 'pin', imgDark: '/ru/kpi-office-dark.jpg', imgLight: '/ru/kpi-office-light.jpg' },
              { val: 'Без курьера', label: 'за серебром не выезжаем', icon: 'shield', imgDark: '/ru/kpi-silver-coin-dark.jpg', imgLight: '/ru/kpi-silver-coin-light.jpg' },
              { val: 'Сразу', label: 'наличные или перевод после договора', icon: 'bolt', imgDark: '/ru/kpi-time-dark.jpg', imgLight: '/ru/kpi-time-light.jpg' },
            ]} />
          </div>
        </section>

        <section className="il-section">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Что принимаем</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Серебро любого вида</h2></Reveal>
            </div>
            <motion.div className="il-cards" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
              {ACCEPT.map((a) => (
                <motion.div className="il-card" key={a.title} variants={staggerChild} whileHover={{ y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
                  <h3 className="il-card-title">{a.title}</h3>
                  <p className="il-card-text">{a.text}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Коротко</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Как устроен выкуп серебра</h2></Reveal>
            </div>
            <motion.div className="il-cards rl-perks-grid" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
              {POINTS.map((a) => (
                <motion.div className="il-card" key={a.title} variants={staggerChild} whileHover={{ y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
                  <h3 className="il-card-title">{a.title}</h3>
                  <p className="il-card-text">{a.text}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="il-section">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Процесс</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Три шага</h2></Reveal>
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
                <RuThemedImg dark="/ru/kpi-silver-coin-dark.jpg" light="/ru/kpi-silver-coin-light.jpg" alt="Серебро в отделении Reaktivo" style={{ objectPosition: '50% 45%' }} />
              </RuTiltCard>
            </div>
          </div>
        </section>

        <section className="il-section" id="faq">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Вопросы</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Частые вопросы</h2></Reveal>
            </div>
            <RuFaq items={FAQ} />
          </div>
        </section>

        <section className="il-section il-section--cta" id="zayavka">
          <div className="il-section-inner il-section-inner--narrow">
            <Reveal>
              <RuCtaPanel>
                <LeadForm />
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
