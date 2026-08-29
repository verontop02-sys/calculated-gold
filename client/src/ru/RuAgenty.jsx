import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { CSS as IL_CSS, EASE, Magnetic, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuFaq, RuFooter, RuHeader, RuHeroBg, RuMarquee, RuStatement, RuTiltCard,
  formatMoney, setDraftMeta, useAnimatedNumber, useGoldQuote, useRuLenis,
} from './RuShared.jsx';

const PERKS = [
  { title: 'Инструменты', text: 'Фирменная сумка, весы, прибор для оценки золота, бейдж, визитки и элементы фирменной одежды. Для агентов с высоким рейтингом — детектор металла.' },
  { title: 'Обучение и аттестация', text: 'Как определить пробу и распознать подделку, как отличить золото от гальванического покрытия, как разговаривать с клиентом. Итоговый тест и практика на реальных изделиях.' },
  { title: 'Приложение агента', text: 'Живой курс, расчёт выкупа, оформление сделки без бумаг, история операций, поддержка и личный рейтинг.' },
  { title: 'Оборотный капитал', text: 'Первое время вы покупаете золото на свои средства. Доступ к оборотному капиталу Reaktivo открывается по мере роста рейтинга.' },
  { title: 'Безопасность', text: 'Кнопка SOS с передачей местоположения, прямая связь с поддержкой и безналичный расчёт с клиентом — не нужно носить крупные суммы наличных.' },
  { title: 'Заявки с сайта и сервиса', text: 'Часть заказов Reaktivo распределяет между агентами в вашем районе. Приоритет получают самые быстрые и агенты с высоким рейтингом.' },
];

const RULES = [
  { title: 'Без паспорта — нет сделки', text: 'Агент обязан спросить и проверить паспорт клиента при каждой покупке. Сделка без паспорта запрещена в любых обстоятельствах.' },
  { title: 'Сдача золота — не позднее 48 часов', text: 'Всё купленное золото сдаётся в местный пункт приёма в течение 24–48 часов с момента покупки — это ставит его на учёт и высвобождает ваш капитал для новых сделок.' },
  { title: 'Курс — только из приложения', text: 'Покупать дороже — терять свою маржу, дешевле — разрушать честную цену клиента. Курс приложения одинаков для всех и не меняется по договорённости.' },
  { title: 'Нарушения — пожизненная блокировка', text: 'Покупка без паспорта, несдача золота, работа в состоянии опьянения и повторные жалобы клиентов — основания для отключения от сервиса навсегда, привязанного к паспортным данным.' },
];

const LEVELS = [
  { st: '★', title: 'Стажёр', cond: 'после обучения и аттестации', items: ['Полный набор и приложение', 'Сопровождение первых сделок'] },
  { st: '★★', title: 'Агент', cond: '10 корректных сделок', items: ['Стандартное вознаграждение', 'Заявки с сайта по вашему городу'] },
  { st: '★★★', title: 'Старший агент', cond: 'стабильный оборот 3 месяца', items: ['Повышенный процент', 'Доступ к оборотному капиталу', 'Детектор металла в наборе'] },
  { st: '★★★★', title: 'Представитель', cond: 'оборот и обучение других', items: ['Доступ к обучению агентов', 'Максимальный процент от сделок', 'Максимальный лимит капитала', 'Приоритет на франшизу'], top: true },
];

const FUNNEL = [
  { n: '01', title: 'Ближний круг', text: 'Первые сделки почти всегда от знакомых, соседей и коллег. Ненужное золото есть почти у каждого.' },
  { n: '02', title: 'Объявления на досках и маркетплейсах', text: 'Авито, Юла и аналогичные площадки — размещайте объявление «Агент Reaktivo — куплю золото дорого» с актуальным курсом, фото процесса, отзывами.' },
  { n: '03', title: 'Соцсети и мессенджеры', text: 'Посты и сторис о том, что вы покупаете золото; фото значка и сумки агента повышают доверие.' },
  { n: '04', title: 'Офлайн и сарафанное радио', text: 'В подъездах своего района, на досках у магазинов (там, где это разрешено).' },
  { n: '05', title: 'Повторные клиенты', text: 'Самый сильный канал. Человек, получивший заметно больше, чем в скупке, обязательно посоветует вас и сервис.' },
  { n: '06', title: 'Заказы от самого сервиса', text: 'Ещё один источник клиентов — сам Reaktivo. Часть заказов приходит в регион через рекламу и ресурсы компании, и сервис распределяет их между агентами.' },
  { n: '07', title: 'Профессиональные каналы', text: 'Ювелирные мастерские, мелкие ломбарды, часовщики и антиквары. Налаживайте связи и стройте свою базу клиентов.' },
];

const STEPS = [
  { n: '01', title: 'Заявка', text: 'Заполните форму ниже. Мы свяжемся с вами и расскажем, какие документы нужны.' },
  { n: '02', title: 'Обучение', text: 'Видеокурс и памятка агенту: основное, пробы, подделки, работа с клиентом, юридическая часть, безопасность и приложение.' },
  { n: '03', title: 'Аттестация', text: 'Пройдите итоговый тест и практику на реальных изделиях. Без этого аттестацию не получить.' },
  { n: '04', title: 'Набор и первая сделка', text: 'Получаете полный набор, бейдж, доступ в приложение и закрываете первые сделки и продажи.' },
];

const FAQ = [
  { q: 'Нужны ли свои деньги, чтобы начать?', a: 'Да, для старта в сервисе вам понадобится небольшой первоначальный капитал. По договору всё купленное вами золото будет выкуплено сервисом, и вы зарабатываете на каждой сделке. Доступ к оборотному капиталу на выкуп золота от сервиса появится по мере роста рейтинга. Рейтинг растёт по мере накопления истории корректных сделок.' },
  { q: 'Как рассчитывается моё вознаграждение?', a: '8% сверху — по сделкам, которые вы нашли сами, и 5% — по заказам, которые распределяет сам сервис. Курс покупки у клиента всегда берётся из приложения на момент сделки: отклоняться в любую сторону запрещено — это защищает и вашу маржу, и честную цену для клиента.' },
  { q: 'Что будет, если при сдаче золото не совпадёт по весу или пробе?', a: 'Reaktivo не выкупает такое изделие у агента и не компенсирует его стоимость — это защищает сервис от подмены и небрежной проверки на месте. Именно поэтому обучение экспертизе золота обязательно перед началом работы: пробы, подделки, гальваническое покрытие.' },
  { q: 'Я не разбираюсь в золоте. Это проблема?', a: 'Нет — этому посвящена основная часть нашего обучающего курса. Дополнительно у всех агентов есть постоянный доступ к поддержке для решения возникающих вопросов, в том числе если возникло сомнение при определении пробы на месте.' },
  { q: 'Сколько времени это занимает?', a: 'Расписание и график определяете вы. Многие начинают с выходных и нескольких сделок в месяц. Ваш доход и рейтинг зависят от количества времени в сервисе, числа сделок и других параметров.' },
  { q: 'Что делает сервис для моей безопасности?', a: 'В приложении есть кнопка SOS, которая мгновенно передаёт в офис сигнал о проблеме вместе с вашим местоположением, и прямая связь с поддержкой. Расчёт с клиентом можно проводить безналично, чтобы не носить с собой крупные суммы наличных.' },
  { q: 'Кто устанавливает цену для клиента?', a: 'Курс приходит из системы Reaktivo и одинаков для всех: и для клиента на сайте, и для вас в приложении. Главное правило сервиса — совершать сделки в соответствии с курсом в приложении. Это напрямую влияет на вашу доходность: золото, купленное по правилам, будет гарантированно выкуплено Reaktivo.' },
  { q: 'Как оформляется мой статус юридически?', a: 'Вы работаете как представитель Reaktivo по агентскому договору, а не покупаете золото от своего имени. Стороной сделки с клиентом остаётся компания, вы получаете агентское вознаграждение официально.' },
];

// Клиент получает ≈90% от биржевой стоимости (как и везде на сайте), доход агента —
// 8% сверху от суммы, выплаченной клиенту: именно с такой наценкой Reaktivo принимает
// золото у агента, если сделку агент нашёл сам. По заказам, которые распределяет сам
// сервис, комиссия агента — 5%.
const AGENT_BUY_PCT = 0.9;
const AGENT_MARKUP = 0.08;
const AGENT_MARKUP_SERVICE = 0.05;

function AgentCalc({ quote }) {
  const [deals, setDeals] = useState(10);
  const [weight, setWeight] = useState(8);
  const [source, setSource] = useState('self');
  const markup = source === 'self' ? AGENT_MARKUP : AGENT_MARKUP_SERVICE;
  const spot = quote?.goldRubPerGram || null;
  const { income, turnover, gramsMonth, perDeal } = useMemo(() => {
    if (!spot) return {};
    const gMonth = deals * weight;
    const buyPricePerGram = spot * 0.585 * AGENT_BUY_PCT;
    const turn = gMonth * buyPricePerGram;
    const inc = gMonth * buyPricePerGram * markup;
    return { income: inc, turnover: turn, gramsMonth: gMonth, perDeal: inc / deals };
  }, [deals, weight, spot, markup]);
  const incomeDisplay = useAnimatedNumber(income);
  const turnoverDisplay = useAnimatedNumber(turnover);
  const perDealDisplay = useAnimatedNumber(perDeal);

  return (
    <motion.div className="rl-calc-card rl-calc-card--wide" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.4, ease: EASE }}>
      <div className="rl-calc-top">
        <span className="rl-calc-brand">АГЕНТ<i>·</i>ДОХОД</span>
        <span className="rl-calc-live"><i />live</span>
      </div>
      <span className="rl-calc-label">Ваш доход в месяц</span>
      <div className="rl-seg">
        <button type="button" className={source === 'self' ? 'is-active' : ''} onClick={() => setSource('self')}>Свои клиенты · 8%</button>
        <button type="button" className={source === 'service' ? 'is-active' : ''} onClick={() => setSource('service')}>От сервиса · 5%</button>
      </div>
      <div className="rl-calc-row"><span>СДЕЛОК В МЕСЯЦ</span><b>{deals}</b></div>
      <input type="range" min={1} max={45} value={deals} onChange={(e) => setDeals(Number(e.target.value))} aria-label="Сделок в месяц" />
      <div className="rl-calc-row"><span>СРЕДНИЙ ВЕС ИЗДЕЛИЯ</span><b>{weight} г</b></div>
      <input type="range" min={2} max={50} value={weight} onChange={(e) => setWeight(Number(e.target.value))} aria-label="Средний вес" />
      <div className="rl-calc-out">
        <span className="rl-calc-out-label">Ваш доход в месяц</span>
        <span className="rl-calc-out-val">{incomeDisplay != null ? formatMoney(incomeDisplay) : '· · ·'}</span>
      </div>
      <div className="rl-calc-mini">
        <div>Оборот<b>{turnoverDisplay != null ? formatMoney(turnoverDisplay) : '—'}</b></div>
        <div>Золота в месяц<b>{gramsMonth ? `${gramsMonth} г` : '—'}</b></div>
        <div>Со сделки<b>{perDealDisplay != null ? formatMoney(perDealDisplay) : '—'}</b></div>
      </div>
      <a href="#zayavka" className="rl-btn rl-btn--primary rl-calc-cta">Хочу так же</a>
    </motion.div>
  );
}

function AgentForm() {
  const [sent, setSent] = useState(false);
  return sent ? (
    <div className="rl-form">
      <div className="rl-form-full" style={{ textAlign: 'center', padding: '20px 0' }}>
        <h3>Заявка принята</h3>
        <p className="rl-form-note">Мы свяжемся, ответим на вопросы и отправим программу обучения.</p>
      </div>
    </div>
  ) : (
    <form className="rl-form" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
      <div className="rl-form-full">
        <h3>Заявка на статус агента</h3>
        <p className="rl-form-note">Расскажите о себе и своём городе. Мы свяжемся, ответим на вопросы и отправим программу обучения.</p>
      </div>
      <input className="rl-input" placeholder="Имя" required />
      <input className="rl-input" placeholder="Телефон или Telegram" required />
      <input className="rl-input" placeholder="Город" required />
      <input className="rl-input" placeholder="Опыт работы с золотом (если есть)" />
      <div className="rl-form-full">
        <textarea className="rl-input" rows={2} placeholder="Сколько времени готовы уделять и почему вам это интересно" />
      </div>
      <div className="rl-form-full">
        <button type="submit" className="il-btn il-btn--primary il-btn--lg" style={{ width: '100%' }}>Отправить заявку</button>
      </div>
    </form>
  );
}

export function RuAgenty() {
  const quote = useGoldQuote();
  const lenisRef = useRuLenis();
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });

  useEffect(() => { setDraftMeta('Работа с Reaktivo — агентская программа (черновик)'); }, []);

  const rate585 = quote?.goldRubPerGram ? quote.goldRubPerGram * 0.585 : null;
  const oldPay = rate585 ? rate585 * 12 * 0.6 : null;
  const agentBuyPay = rate585 ? rate585 * 12 * AGENT_BUY_PCT : null;
  const agentCut = agentBuyPay ? agentBuyPay * AGENT_MARKUP : null;

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />
      <div className="rl-preview-flag">Черновик для просмотра · не окончательная версия</div>

      <RuHeader active="/ru/agenty/" lenisRef={lenisRef} ctaHref="#zayavka" ctaLabel="Стать агентом" />

      <main>
        <p className="rl-crumbs"><a href="/ru/">Reaktivo</a> · Работа</p>

        <section className="il-hero" style={{ paddingTop: '48px' }} ref={heroRef}>
          <RuHeroBg heroRef={heroRef} />
          <div className="il-hero-inner">
            <div className="il-hero-copy">
              <motion.span className="il-badge" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
                <i className="il-badge-dot" /> Для агентов в регионах
              </motion.span>
              <motion.h1 className="il-hero-title rl-hero-title" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1, ease: EASE }}>
                Зарабатывайте на золоте <span className="il-accent-text">в своём городе</span>
              </motion.h1>
              <motion.p className="il-hero-sub" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.32, ease: EASE }}>
                Пройдите обучение, получите набор для проверки золота и доступ в приложение —
                зарабатывайте в своём городе и регионе.
              </motion.p>
              <motion.div className="il-hero-cta" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.44, ease: EASE }}>
                <Magnetic>
                  <motion.a href="#zayavka" className="il-btn il-btn--primary il-btn--lg" whileTap={{ scale: 0.96 }}>
                    Стать агентом
                    <span className="il-btn-arrow" aria-hidden>→</span>
                  </motion.a>
                </Magnetic>
                <motion.a href="/ru/prodat/" className="il-btn il-btn--outline il-btn--lg" whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}>
                  Я клиент, хочу продать
                </motion.a>
              </motion.div>
            </div>
            <AgentCalc quote={quote} />
          </div>
        </section>

        <RuMarquee items={[
          'Обучение', 'Инструменты', 'Приложение', 'SOS', 'Рейтинг', 'Оборотный капитал',
        ]} />

        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Почему это работает</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">В небольшом городе людям негде<br />узнать реальную цену золота</h2></Reveal>
            </div>
            <div className="rl-vs">
              <Reveal className="rl-vs-col rl-vs-col--old" y={20}>
                <span className="rl-vs-tag">Как сегодня</span>
                <h4>Цепочка 12 г, 585 проба.<br />Обычная скупка</h4>
                <ul>
                  <li>Курс в рекламе завышен</li>
                  <li>Вычитают комиссии, за вид, пробу и т.д.</li>
                  <li>Занижают пробу и платят меньше</li>
                  <li>Реальная выплата — около 55–65% от биржи</li>
                </ul>
                <div className="rl-vs-fig">{oldPay ? formatMoney(oldPay) : '· · ·'}</div>
                <div className="rl-vs-figl">Клиент получает</div>
              </Reveal>
              <Reveal className="rl-vs-col rl-vs-col--new" delay={0.08} y={20}>
                <span className="rl-vs-tag">С агентом Reaktivo</span>
                <h4>Цепочка 12 г, 585 проба.<br />Агент Reaktivo</h4>
                <ul>
                  <li>Курс такой же, как на сайте Reaktivo</li>
                  <li>Проба и вес проверяются при клиенте</li>
                  <li>Расчёт виден в приложении на экране</li>
                  <li>Выплата ≈ 90% от биржевой стоимости</li>
                </ul>
                <div className="rl-vs-fig">{agentBuyPay ? formatMoney(agentBuyPay) : '· · ·'}</div>
                <div className="rl-vs-figl">Клиент получает · Вам ≈ {agentCut ? formatMoney(agentCut) : '· · ·'}</div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="il-section">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Что вы получаете</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Всё, что вам нужно, — это время</h2></Reveal>
            </div>
            <div className="rl-media-split rl-media-split--reverse rl-media-split--even">
              <RuTiltCard className="rl-media-split-visual">
                <img src="/ru/agent-kit.jpg" alt="Фирменный набор агента Reaktivo: сумка, весы, прибор для оценки золота" loading="lazy" decoding="async" />
              </RuTiltCard>
              <motion.div className="il-cards rl-perks-grid" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
                {PERKS.map((a) => (
                  <motion.div className="il-card" key={a.title} variants={staggerChild} whileHover={{ y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
                    <h3 className="il-card-title">{a.title}</h3>
                    <p className="il-card-text">{a.text}</p>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>
        </section>

        <section className="il-section">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Правила без исключений</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Это защищает и клиента, и вас</h2></Reveal>
            </div>
            <div className="rl-rows">
              {RULES.map((r, i) => (
                <Reveal key={r.title} delay={i * 0.05} className="rl-row">
                  <span className="rl-row-n">{String(i + 1).padStart(2, '0')}</span>
                  <div><h4>{r.title}</h4><p>{r.text}</p></div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <RuStatement text="Вы находите клиентов — курс, инструмент и гарантию выкупа даёт Reaktivo." />

        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Ваш рейтинг</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Условия улучшаются вместе с вами</h2></Reveal>
              <Reveal delay={0.12}><p className="il-section-lead">Компания считает количество и регулярность ваших сделок, а также отзывы клиентов. Помимо личного рейтинга есть общий рейтинг агентов по весу и объёму выкупа за месяц — лучшие получают бонусы по итогам квартала и года.</p></Reveal>
            </div>
            <motion.div className="rl-lvls" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
              {LEVELS.map((l) => (
                <motion.div className={`rl-lvl${l.top ? ' rl-lvl--top' : ''}`} key={l.title} variants={staggerChild}>
                  <span className="rl-lvl-st rl-lvl-stars" aria-hidden>{l.st}</span>
                  <h4>{l.title}</h4>
                  <span className="rl-lvl-cond">{l.cond}</span>
                  <ul>{l.items.map((it) => <li key={it}>{it}</li>)}</ul>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="il-section">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Откуда клиенты</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Заявки с сайта — это разгон,<br />дальше вы строите поток сами</h2></Reveal>
            </div>
            <div className="rl-rows">
              {FUNNEL.map((s, i) => (
                <Reveal key={s.n} delay={i * 0.04} className="rl-row">
                  <span className="rl-row-n">{s.n}</span>
                  <div><h4>{s.title}</h4><p>{s.text}</p></div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <Reveal className="rl-cta-box">
              <h2 className="il-h2">Начните зарабатывать без офиса</h2>
              <p>Обучение, аппаратуру и приложение даёт вам Reaktivo. Ваш вклад — время и знание своего города.</p>
              <a href="#zayavka" className="il-btn il-btn--primary il-btn--lg">Оставить заявку</a>
            </Reveal>
          </div>
        </section>

        <section className="il-section">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Начало</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Как стать агентом</h2></Reveal>
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
            <Reveal><AgentForm /></Reveal>
          </div>
        </section>
      </main>

      <RuFooter lenisRef={lenisRef} />

      <style>{IL_CSS}</style>
      <style>{RL_CSS}</style>
    </div>
  );
}
