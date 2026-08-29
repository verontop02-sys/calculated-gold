import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { CSS as IL_CSS, EASE, Magnetic, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuFaq, RuFooter, RuHeader, RuHeroBg, RuKpis, RuLeadForm, RuMarquee, RuStatement, RuTiltCard,
  formatMoney, setDraftMeta, useAnimatedNumber, useGoldQuote, useRuLenis,
} from './RuShared.jsx';

const WHY = [
  { title: 'Официально украшение', text: 'У изделия ювелирная проба и клеймо. Его можно свободно купить, носить, подарить и продать — как любое ювелирное изделие.' },
  { title: 'Цена привязана к бирже', text: 'Стоимость считается от биржевого курса золота на день покупки, а не от «ценника витрины». Вы всегда видите, за что платите.' },
  { title: 'Ликвидность каждый день', text: 'Reaktivo ежедневно выкупает золото. Слиток можно продать обратно по живому курсу — в отделении или через курьера.' },
];

const FORMS = [
  { n: '01', title: 'Цепочка', text: 'Слиток-звено в плетении: украшение, которое остаётся инвестицией. Вес и проба зафиксированы на клейме.' },
  { n: '02', title: 'Подвеска', text: 'Классический мини-слиток на цепочку: строгая форма, клеймо и проба на лицевой стороне.' },
  { n: '03', title: 'Кулон', text: 'Слиток в оправе — ближе к ювелирному украшению, дальше от сейфа. Носится каждый день.' },
  { n: '04', title: 'Под запрос', text: 'Подберём вес и форму под ваш бюджет: от небольшого подарка до серьёзного веса.' },
];

const STEPS = [
  { n: '01', title: 'Заявка', text: 'Оставьте телефон — менеджер уточнит, что подбираем: вес, форму, бюджет.' },
  { n: '02', title: 'Подбор и расчёт', text: 'Предложим варианты с точным весом и ценой, посчитанной от биржевого курса на день покупки.' },
  { n: '03', title: 'Оплата и оформление', text: 'Официальная продажа ювелирного изделия с документами и чеком.' },
  { n: '04', title: 'Доставка или самовывоз', text: 'Доставим по всей стране или отдадим в отделении — как вам удобнее.' },
];

const FAQ = [
  { q: 'Чем слиток-украшение отличается от банковского слитка?', a: 'Это ювелирное изделие с пробой и клеймом: его можно носить, дарить и свободно продавать. При этом вес и проба зафиксированы, а цена привязана к биржевой стоимости золота — как у слитка.' },
  { q: 'Можно ли продать слиток обратно?', a: 'Да. Reaktivo ежедневно выкупает золото по живому курсу: принесите слиток в отделение или вызовите курьера. Это обычная сделка выкупа — быстрая и по понятной цене.' },
  { q: 'Как считается цена?', a: 'От биржевого курса золота на день покупки плюс стоимость работы, зависящая от формата изделия. Точный расчёт вы видите до оплаты — без скрытых наценок.' },
  { q: 'Как проходит доставка?', a: 'Отправляем по всей стране, в городах присутствия можно забрать в отделении. Детали доставки согласуем в заявке.' },
  { q: 'Это подходит как подарок?', a: 'Да. В отличие от обычной ювелирки, слиток-украшение не теряет большую часть цены «на выходе из магазина»: его стоимость привязана к металлу, а не к витринной наценке.' },
];

const WEIGHTS = [1, 2.5, 5, 10, 20];

function SlitokPriceCard({ quote }) {
  const [w, setW] = useState(5);
  const perGram = quote?.goldRubPerGram || null;
  const metal = perGram ? perGram * w : null;
  const metalDisplay = useAnimatedNumber(metal);
  const perGramDisplay = useAnimatedNumber(perGram);

  return (
    <motion.div className="rl-calc-card rl-calc-card--wide" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3, ease: EASE }}>
      <div className="rl-calc-top">
        <span className="rl-calc-brand">СЛИТОК<i>·</i>999,9</span>
        <span className="rl-calc-live"><i />курс живой</span>
      </div>
      <span className="rl-calc-label">Вес изделия</span>
      <div className="rl-seg">
        {WEIGHTS.map((v) => (
          <button key={v} type="button" className={v === w ? 'is-active' : ''} onClick={() => setW(v)}>
            {String(v).replace('.', ',')} г
          </button>
        ))}
      </div>
      <div className="rl-calc-mini">
        <div>Биржевой курс<b>{perGramDisplay != null ? `${formatMoney(perGramDisplay)}/г` : '· · ·'}</b></div>
        <div>Проба<b>999,9</b></div>
      </div>
      <div className="rl-calc-out">
        <span className="rl-calc-out-label">Золото в изделии по бирже сейчас</span>
        <span className="rl-calc-out-val">{metalDisplay != null ? formatMoney(metalDisplay) : '· · ·'}</span>
      </div>
      <p className="rl-calc-note">Финальная цена изделия зависит от формы и работы — посчитаем в заявке до оплаты.</p>
      <a href="#zayavka" className="rl-btn rl-btn--primary rl-calc-cta">Подобрать под бюджет</a>
    </motion.div>
  );
}

function SlitokForm() {
  return (
    <RuLeadForm
      source="slitki"
      title="Подобрать слиток"
      note="Оставьте телефон — предложим форму и вес под ваш бюджет, с точной ценой от биржи."
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
                <i className="il-badge-dot" /> Интернет-магазин
              </motion.span>
              <motion.h1 className="il-hero-title rl-hero-title" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1, ease: EASE }}>
                Слиток, который<br />можно <span className="il-accent-text">носить</span>
              </motion.h1>
              <motion.p className="il-hero-sub" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.32, ease: EASE }}>
                Цепочка, подвеска или кулон — официально ювелирное изделие с пробой и клеймом.
                Цена привязана к бирже, доставка по всей стране.
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
          'Проба 999,9', 'Клеймо на изделии', 'Цена привязана к бирже', 'Доставка по всей стране',
          'Обратный выкуп по живому курсу', 'Официальные документы',
        ]} />

        <section className="il-section rl-kpis-section">
          <div className="il-section-inner">
            <RuKpis items={[
              { val: '999,9', label: 'проба и клеймо на изделии' },
              { val: 'биржа', label: 'цена считается от курса' },
              { val: '3 формы', label: 'цепочка · подвеска · кулон' },
              { val: 'выкуп', label: 'продадите обратно в любой день' },
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

        <section className="il-section" id="formy">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Форматы</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Одна идея — три формы</h2></Reveal>
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
                <img src="/ru/slitok.jpg" alt="Слиток-подвеска 999,9 на золотой цепочке" loading="lazy" decoding="async" />
              </RuTiltCard>
            </div>
          </div>
        </section>

        <RuStatement text="Обычная ювелирка теряет половину цены на выходе из магазина. Слиток-украшение остаётся золотом по курсу биржи." />

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
            <Reveal><SlitokForm /></Reveal>
          </div>
        </section>
      </main>

      <RuFooter />

      <style>{IL_CSS}</style>
      <style>{RL_CSS}</style>
    </div>
  );
}
