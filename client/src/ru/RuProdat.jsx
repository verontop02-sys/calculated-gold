import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { CSS as IL_CSS, EASE, Magnetic, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuFaq, RuFooter, RuHeader, RuHeroBg, RuMarquee, RuSbpBadge, RuTiltCard,
  GramsSlider, formatMoney, setDraftMeta, useAnimatedNumber, useGoldQuote, useRuLenis,
} from './RuShared.jsx';

const PRINCIPLES = [
  { title: 'Курс с двух бирж', text: 'Программа берёт котировки с Московской и Лондонской бирж и пересчитывает цену за грамм каждые три секунды — курс на сайте, у курьера и в отделении всегда одинаковый.' },
  { title: 'Проба определяется при вас', text: 'Пробирным реактивом и, при необходимости, спектральным анализом. Вы видите тот же результат, что и эксперт — никаких сюрпризов.' },
  { title: 'Деньги сразу', text: 'Наличные на месте или перевод в течение минуты после подписания договора. Договор — в приложении, без бумажной волокиты.' },
];

const STEPS = [
  { n: '01', title: 'Считаете сами', text: 'Укажите пробу и вес в калькуляторе. Ваш результат — точная сумма, которую вы получите, а не раздутая оценка.' },
  { n: '02', title: 'Оставляете заявку', text: 'Адрес для курьера и удобное вам время — или приезжаете в отделение: курс будет таким же.' },
  { n: '03', title: 'Проверка при вас', text: 'Проба и вес определяются на ваших глазах, с объяснением каждого шага.' },
  { n: '04', title: 'Деньги и документы', text: 'Наличные или перевод сразу после подписания. Договор хранится в приложении.' },
];

const REVIEWS = [
  { name: 'Дмитрий, Калининград', text: 'Курьер приехал за час, всё взвесил при мне и объяснил, откуда взялась проба. Вопросов не осталось.' },
  { name: 'Марина', text: 'Сравнила с двумя ломбардами до этого — тут сумма оказалась заметно выше, и никто не тянул время.' },
  { name: 'Игорь', text: 'Отдавал старые цепочки без клейма. Показали спектральный анализ прямо на экране, всё прозрачно.' },
];

const FAQ = [
  { q: 'Как определяется проба, если клеймо стёрлось?', a: 'Пробирным реактивом и, при необходимости, спектральным анализом. Всё делается при вас — вы видите тот же результат, что и эксперт.' },
  { q: 'Курьер бесплатный?', a: 'Да, вызов курьера для вас абсолютно бесплатный.' },
  { q: 'Что если я не согласен с суммой?', a: 'Продажа не является обязательной: вы всегда можете отказаться или передумать — это бесплатно.' },
  { q: 'Нужны ли документы?', a: 'Нужен паспорт — это требование закона к самой сделке приёма металла, а не проверка происхождения вещи.' },
  { q: 'В других городах есть курьеры?', a: 'Курьеры Reaktivo работают в Калининграде, Москве и Санкт-Петербурге. В остальных регионах золото принимают агенты Reaktivo — условия абсолютно одинаковые. Следите за открытием новых регионов в разделе Агенты.' },
];

function BigCalcCard({ quote }) {
  const [proba, setProba] = useState(585);
  const [grams, setGrams] = useState(12);
  const perGram = quote?.goldRubPerGram || null;
  const sum = perGram ? perGram * (proba / 1000) * grams * 0.9 : null;
  const perGramOut = perGram ? perGram * (proba / 1000) * 0.9 : null;
  const sumDisplay = useAnimatedNumber(sum);
  const perGramDisplay = useAnimatedNumber(perGramOut);

  return (
    <motion.div className="rl-calc-card rl-calc-card--wide" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}>
      <div className="rl-calc-top">
        <span className="rl-calc-brand">РАСЧЁТ<i>·</i>ВЫКУП</span>
        <span className="rl-calc-live"><i />курс живой</span>
      </div>
      <span className="rl-calc-label">Проба изделия</span>
      <div className="rl-seg">
        {[375, 585, 750, 999].map((p) => (
          <button key={p} type="button" className={p === proba ? 'is-active' : ''} onClick={() => setProba(p)}>{p}</button>
        ))}
      </div>
      <GramsSlider value={grams} onChange={setGrams} max={1000} allowType typeMax={5000} />
      <div className="rl-calc-mini">
        <div>Цена за грамм<b>{perGramDisplay != null ? formatMoney(perGramDisplay) : '· · ·'}</b></div>
        <div>Доля от биржи<b>до 90%</b></div>
      </div>
      <div className="rl-calc-out">
        <span className="rl-calc-out-label">Вы получите наличными или переводом<RuSbpBadge /></span>
        <span className="rl-calc-out-val">{sumDisplay != null ? formatMoney(sumDisplay) : '· · ·'}</span>
      </div>
      <p className="rl-calc-note">Точная сумма определяется после проверки пробы на месте.</p>
    </motion.div>
  );
}

function LeadForm() {
  const [sent, setSent] = useState(false);
  return sent ? (
    <div className="rl-form">
      <div className="rl-form-full" style={{ textAlign: 'center', padding: '20px 0' }}>
        <h3>Заявка принята</h3>
        <p className="rl-form-note">Мы позвоним в течение 5 минут и согласуем время курьера.</p>
      </div>
    </div>
  ) : (
    <form className="rl-form" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
      <div className="rl-form-full">
        <h3>Вызвать курьера или записаться в отделение</h3>
        <p className="rl-form-note">Оставьте телефон — согласуем время в течение 5 минут.</p>
      </div>
      <input className="rl-input" placeholder="Ваше имя" required />
      <input className="rl-input" placeholder="+7 (900) 000-00-00" inputMode="tel" required />
      <div className="rl-form-full">
        <button type="submit" className="il-btn il-btn--primary il-btn--lg" style={{ width: '100%' }}>Отправить заявку</button>
      </div>
    </form>
  );
}

export function RuProdat() {
  const quote = useGoldQuote();
  const lenisRef = useRuLenis();
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });

  useEffect(() => { setDraftMeta('Продать золото — Reaktivo (черновик)'); }, []);

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />
      <div className="rl-preview-flag">Черновик для просмотра · не окончательная версия</div>

      <RuHeader active="/ru/prodat/" lenisRef={lenisRef} />

      <main>
        <p className="rl-crumbs"><a href="/ru/">Reaktivo</a> · Продать золото</p>

        <section className="il-hero" style={{ paddingTop: '48px' }} ref={heroRef}>
          <RuHeroBg heroRef={heroRef} />
          <div className="il-hero-inner">
            <div className="il-hero-copy">
              <motion.span className="il-badge" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
                <i className="il-badge-dot" /> Выкуп золота
              </motion.span>
              <motion.h1 className="il-hero-title rl-hero-title" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1, ease: EASE }}>
                Мы привозим<br /><span className="il-accent-text">деньги</span>, а не просто оценку
              </motion.h1>
              <motion.p className="il-hero-sub" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.32, ease: EASE }}>
                Оценка по биржевому курсу, оплата сразу — в отделении или с курьером.
                Мы выплачиваем всю стоимость. Никаких скрытых процентов и комиссий.
              </motion.p>
              <motion.div className="il-hero-cta" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.44, ease: EASE }}>
                <Magnetic>
                  <motion.a href="#calc" className="il-btn il-btn--primary il-btn--lg" whileTap={{ scale: 0.96 }}>
                    Рассчитать стоимость
                    <span className="il-btn-arrow" aria-hidden>→</span>
                  </motion.a>
                </Magnetic>
                <motion.a href="#zayavka" className="il-btn il-btn--outline il-btn--lg" whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}>
                  Вызвать курьера
                </motion.a>
              </motion.div>
            </div>
            <div id="calc">
              <BigCalcCard quote={quote} />
            </div>
          </div>
        </section>

        <RuMarquee items={[
          'Курс каждые 3 секунды', 'До 90% от биржи', 'Курьер бесплатно', 'Деньги сразу',
          'Договор в приложении', 'Проверка при вас', 'Без комиссий', 'Без записи в отделение',
        ]} />

        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Принципы работы</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Как формируется курс</h2></Reveal>
            </div>
            <motion.div className="il-cards" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
              {PRINCIPLES.map((a) => (
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
              <Reveal delay={0.08}><h2 className="il-h2">Как проходит сделка</h2></Reveal>
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
                <img src="/ru/courier.jpg" alt="Курьер Reaktivo передаёт документы и терминал для оплаты" loading="lazy" decoding="async" />
              </RuTiltCard>
            </div>
          </div>
        </section>

        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Отзывы</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Что говорят клиенты</h2></Reveal>
            </div>
            <div className="il-cards rl-tilt-cards">
              {REVIEWS.map((r) => (
                <RuTiltCard key={r.name} className="il-card rl-tilt-card">
                  <p className="il-card-text" style={{ marginBottom: 14 }}>«{r.text}»</p>
                  <h3 className="il-card-title" style={{ fontSize: '0.95rem' }}>{r.name}</h3>
                </RuTiltCard>
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
            <Reveal><LeadForm /></Reveal>
          </div>
        </section>
      </main>

      <RuFooter lenisRef={lenisRef} />

      <style>{IL_CSS}</style>
      <style>{RL_CSS}</style>
    </div>
  );
}
