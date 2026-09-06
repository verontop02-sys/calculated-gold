import { useEffect, useState } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { CSS as IL_CSS, EASE, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuCtaPanel, RuFaq, RuFooter, RuFullHero, RuGoldTicker, RuHeader, RuKpis, RuLeadForm, RuMarquee, RuSbpBadge, RuThemedImg, RuTiltCard,
  GramsSlider, formatMoney, setDraftMeta, useAnimatedNumber, useGoldQuote, useRuLenis,
} from './RuShared.jsx';

const PRINCIPLES = [
  { title: 'Курс с двух бирж', text: 'Программа берёт котировки с Московской и Лондонской бирж и пересчитывает цену за грамм каждые три секунды — курс на сайте, у курьера и в отделениях всегда одинаковый.' },
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

function BigCalcCard({ quote, pulseKey }) {
  const [proba, setProba] = useState(585);
  const [grams, setGrams] = useState(12);
  const [pulse, setPulse] = useState(false);
  const perGram = quote?.goldRubPerGram || null;
  const sum = perGram ? perGram * (proba / 1000) * grams * 0.9 : null;
  const perGramOut = perGram ? perGram * (proba / 1000) * 0.9 : null;
  const sumDisplay = useAnimatedNumber(sum);
  const perGramDisplay = useAnimatedNumber(perGramOut);

  useEffect(() => {
    if (!pulseKey) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 900);
    return () => clearTimeout(t);
  }, [pulseKey]);

  return (
    <motion.div className={`rl-calc-card rl-calc-card--wide${pulse ? ' rl-calc-card--pulse' : ''}`} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}>
      <div className="rl-calc-top">
        <span className="rl-calc-brand">РАСЧЁТ<i>·</i>ВЫКУП</span>
        <RuGoldTicker value={perGram} change={quote?.change} />
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
  return (
    <RuLeadForm
      source="prodat"
      title="Вызвать курьера или записаться в отделение"
      note="Оставьте телефон — согласуем время в течение 5 минут."
      phonePlaceholder="+7 (900) 000-00-00"
      phoneTel
      successNote="Мы позвоним в течение 5 минут и согласуем время."
    />
  );
}

export function RuProdat() {
  const quote = useGoldQuote();
  const lenisRef = useRuLenis();
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });
  const [calcPulse, setCalcPulse] = useState(0);

  const goToCalc = (e) => {
    e.preventDefault();
    document.querySelector('#calc')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setCalcPulse((n) => n + 1);
  };

  useEffect(() => { setDraftMeta('Продать золото — Reaktivo'); }, []);

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />

      <RuHeader active="/ru/prodat/" lenisRef={lenisRef} />

      <main>
        <RuFullHero
          imgDark="/ru/hero-prodat.jpg"
          imgLight="/ru/hero-prodat-light.jpg"
          imgPos="52% 48%"
          kicker="Выкуп золота"
          title={<>Мы привозим<br /><span className="il-accent-text">деньги</span>, а не просто оценку</>}
          sub="Оценка по биржевому курсу, оплата сразу — в отделении или с курьером. Мы выплачиваем всю стоимость. Никаких скрытых процентов и комиссий."
          primary={{ href: '#calc', label: 'Рассчитать стоимость', onClick: goToCalc }}
          secondary={{ href: '#zayavka', label: 'Вызвать курьера' }}
          aside={<div id="calc"><BigCalcCard quote={quote} pulseKey={calcPulse} /></div>}
        />

        <RuMarquee items={[
          'Курс каждые 3 секунды', 'До 90% от биржи', 'Курьер бесплатно', 'Деньги сразу',
          'Договор в приложении', 'Проверка при вас', 'Без комиссий', 'Без записи в отделение',
        ]} />

        <section className="il-section rl-kpis-section">
          <div className="il-section-inner">
            <RuKpis items={[
              { val: '3 сек', label: 'обновление курса с двух бирж', icon: 'bolt', imgDark: '/ru/kpi-ticker-dark.jpg', imgLight: '/ru/kpi-ticker-light.jpg' },
              { val: 'до 90%', label: 'от биржевой стоимости — без вычетов', icon: 'percent', imgDark: '/ru/kpi-percent-dark.jpg', imgLight: '/ru/kpi-percent-light.jpg' },
              { val: '45 мин', label: 'курьер приезжает бесплатно', icon: 'clock', imgDark: '/ru/kpi-parcel-dark.jpg', imgLight: '/ru/kpi-parcel-light.jpg' },
              { val: '0 ₽', label: 'комиссий за оценку и приём', icon: 'shield', imgDark: '/ru/kpi-zerofee-dark.jpg', imgLight: '/ru/kpi-zerofee-light.jpg' },
            ]} />
          </div>
        </section>

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
                <RuThemedImg dark="/ru/partner.jpg" light="/ru/partner-light.jpg" alt="Проверка изделия на прецизионных весах при клиенте" />
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
                  <span className="rl-stars" aria-label="Оценка 5 из 5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <svg key={i} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                        <path d="M10 1.4l2.6 5.6 6 0.7-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6-4.4-4.2 6-0.7z" />
                      </svg>
                    ))}
                  </span>
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
