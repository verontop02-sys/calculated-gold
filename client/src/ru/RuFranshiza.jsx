import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';
import { CSS as IL_CSS, EASE, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuCtaPanel, RuFaq, RuFooter, RuFullHero, RuGoldTicker, RuHeader, RuKpis, RuLeadForm, RuMarquee, RuPhotoCard, RuStatement, RuTiltCard, RuTimeline,
  formatMoney, officeHallPhoto, setDraftMeta, useAnimatedNumber, useGoldQuote, useRuLenis, useShowcaseCycle,
} from './RuShared.jsx';

const INCLUDES = [
  { title: 'Бренд и оформление', text: 'Вывеска, навигация и стандарты интерьера: продуманные решения — клиент видит бренд, которому доверяют.' },
  { title: 'Обучение команды', text: 'Программа подготовки команды: обучение работе с золотом и оборудованием, повышение стандартов коммуникации с клиентом. Прописаны самые высокие стандарты и предусмотрена обязательная аттестация.' },
  { title: 'Маркетинг запуска', text: 'Стартовый набор для запуска вашего отделения: настройка каналов продвижения и подключение к глобальной рекламной кампании с передачей заявок от Reaktivo.ru.' },
  { title: 'Операционная система', text: 'Биржевой курс в реальном времени, оформление сделок и договоров, управление командой, фото изделий, отчётность и статистика — всё в одном IT-решении.' },
  { title: 'Стандарты сервиса', text: 'Ведение клиентов и правила обслуживания на всех этапах до сделки — всё то, за что клиенты выбирают сервис Reaktivo.' },
  { title: 'Сопровождение', text: 'Поддержка на всех этапах запуска новой точки, а также полное сопровождение по юридическим и организационным вопросам. Это не просто франчайзинг, а настоящее партнёрство.' },
];

const IT_FEATURES = [
  { title: 'Живой биржевой курс', text: 'Котировки приходят с биржи и пересчитываются каждые несколько секунд. На сайте, на экране отделения и в системе — один курс.' },
  { title: 'Сделка без бумаг и калькулятора', text: 'Расчёт выкупа, договор и фото изделия оформляются в системе за минуты. Человеческий фактор исключён из цены.' },
  { title: 'Отчётность и статистика', text: 'История сделок, отчёты и показатели отделения формируются автоматически — вы видите свой бизнес в реальном времени.' },
  { title: 'Управление командой', text: 'Роли, смены и действия сотрудников — в одной системе. Новичок работает по регламенту с первого дня.' },
];

const FORMATS = [
  { title: 'Запуск с нуля', text: 'Подбор локации, ремонт по стандартам, помощь в найме и обучении команды, запуск рекламы. Для тех, кто заходит в нишу впервые: сопровождаем от договора до первой сделки.' },
  { title: 'Экспресс-переход', text: 'Для действующих скупок и ломбардов: полный ребрендинг, установка операционной системы и обучение вашей команды. Быстрее и дешевле запуска с нуля — точка продолжает работать.' },
];

const STEPS = [
  { n: '01', title: 'Заявка и созвон', text: 'Рассказываете о городе и вашей ситуации: с нуля или действующая точка.' },
  { n: '02', title: 'Финансовая модель', text: 'Считаем вместе экономику под ваш город: аренда, команда, оборот, срок выхода в плюс. Честно, без «гарантированных миллионов».' },
  { n: '03', title: 'Договор', text: 'Фиксируем формат, зону ответственности и поддержку. Прозрачные условия без мелкого шрифта.' },
  { n: '04', title: 'Подготовка', text: 'Помещение, оформление, установка системы, обучение и аттестация команды.' },
  { n: '05', title: 'Запуск с поддержкой', text: 'Открытие с рекламной кампанией и сопровождением первых недель работы.' },
];

const FAQ = [
  { q: 'Сколько стоит открытие?', a: 'Бюджет зависит от города, формата (с нуля или переход) и помещения. На созвоне считаем финансовую модель под ваш случай: расходы, оборот и срок окупаемости — честно и по цифрам.' },
  { q: 'Нужен ли опыт работы с золотом?', a: 'Нет. Обучение экспертизе и работе с системой входит в запуск. Важнее предпринимательский опыт и внимание к сервису — остальному научим.' },
  { q: 'У меня уже есть скупка или ломбард. Что меняется?', a: 'Это формат «экспресс-переход»: бренд, операционная система и стандарты Reaktivo ставятся поверх вашей действующей точки и команды. Точка продолжает работать во время перехода.' },
  { q: 'Что происходит с выкупленным золотом?', a: 'Выкупленный металл сдаётся по регламенту сервиса: логистика и переработка уже выстроены — это часть системы, а не ваша отдельная забота.' },
  { q: 'Как быстро можно открыться?', a: 'Экспресс-переход действующей точки заметно быстрее запуска с нуля. Точные сроки зависят от помещения и города — озвучим после первого созвона.' },
];

function FranshizaForm() {
  return (
    <RuLeadForm
      source="franshiza"
      title="Заявка на франшизу"
      note="Расскажите о себе и городе — посчитаем финансовую модель под ваш случай."
      namePlaceholder="Имя"
      cta="Обсудить открытие"
      successNote="Свяжемся, обсудим ваш город и посчитаем финансовую модель."
      fields={[
        { key: 'city', label: 'Город', placeholder: 'Город', required: true },
        { key: 'point', label: 'Действующая точка', placeholder: 'Есть действующая точка? (скупка / ломбард / нет)' },
      ]}
    />
  );
}

/* ── Живой мокап операционной системы: настоящий биржевой курс + «идущая» сделка.
   Демонстрирует «не скупка, а финтех» вживую, а не текстом. ── */
const OS_DEALS = [
  { item: 'Цепочка · 585', grams: 14.2, proba: 585 },
  { item: 'Кольцо · 750', grams: 3.6, proba: 750 },
  { item: 'Браслет · 585', grams: 21.4, proba: 585 },
  { item: 'Серьги · 375', grams: 5.2, proba: 375 },
];
const OS_PHASES = ['Проверка пробы', 'Договор', 'Выплата'];
const OS_LOG_TIMES = ['12:41', '11:58', '10:24'];

export function FranshizaOsMock({ quote }) {
  const perGram = quote?.goldRubPerGram || null;
  const rateDisplay = useAnimatedNumber(perGram);
  const [di, setDi] = useState(0);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhase((p) => {
        if (p < OS_PHASES.length - 1) return p + 1;
        setDi((d) => (d + 1) % OS_DEALS.length);
        return 0;
      });
    }, 1700);
    return () => clearInterval(id);
  }, []);

  const deal = OS_DEALS[di];
  const payout = perGram ? perGram * (deal.proba / 1000) * deal.grams * 0.9 : null;
  const payoutDisplay = useAnimatedNumber(payout);

  return (
    <div className="rl-os">
      <div className="rl-os-bar">
        <span className="rl-os-dots" aria-hidden><i /><i /><i /></span>
        <span className="rl-os-title">REAKTIVO · ОПЕРАЦИОННАЯ СИСТЕМА</span>
        <span className="rl-calc-live"><i />live</span>
      </div>
      <div className="rl-os-rate">
        <div>
          <span className="rl-os-rate-label">Золото · биржевой курс</span>
          <span className="rl-os-rate-val">{rateDisplay != null ? formatMoney(rateDisplay) : '· · ·'}<b>/г</b></span>
        </div>
        <RuGoldTicker value={perGram} />
      </div>
      <div className="rl-os-deal">
        <AnimatePresence mode="wait">
          <motion.div key={di} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.4, ease: EASE }}>
            <div className="rl-os-deal-top">
              <span className="rl-os-deal-id">Сделка №{1024 + di}</span>
              <span className="rl-os-deal-item">{deal.item} · {String(deal.grams).replace('.', ',')} г</span>
            </div>
            <div className="rl-os-deal-sum">{payoutDisplay != null ? formatMoney(payoutDisplay) : '· · ·'}</div>
            <div className="rl-os-phases">
              {OS_PHASES.map((p, i) => (
                <span key={p} className={`rl-os-phase${i < phase ? ' is-done' : ''}${i === phase ? ' is-active' : ''}`}>
                  <i>{i < phase ? '✓' : i + 1}</i>{p}
                </span>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="rl-os-log">
        <span className="rl-os-log-title">Завершено сегодня</span>
        {OS_LOG_TIMES.map((t, i) => {
          const d = OS_DEALS[(di + i + 1) % OS_DEALS.length];
          const sum = perGram ? perGram * (d.proba / 1000) * d.grams * 0.9 : null;
          return (
            <span className="rl-os-log-row" key={t}>
              <b>{t}</b>
              <span>{d.item} · {String(d.grams).replace('.', ',')} г</span>
              <i>{sum != null ? formatMoney(sum) : '· · ·'}</i>
            </span>
          );
        })}
      </div>
      <div className="rl-os-foot">
        <span className="rl-os-chip">ГИИС ДМДК ✓</span>
        <span className="rl-os-chip">Договор сформирован</span>
        <span className="rl-os-chip">Отчёт дня готов</span>
      </div>
    </div>
  );
}

const BRANCH_CITIES = [
  { name: 'Москва', state: 'on', img: '/office-lobby.jpg', pos: '62% 48%', seal: 'стандарт интерьера', hint: 'флагман сети' },
  { name: 'Калининград', state: 'on', img: '/office-interior.jpg', pos: '48% 50%', seal: 'стандарт интерьера', hint: 'первая точка' },
  { name: 'Санкт-Петербург', state: 'on', img: '/office-work.jpg', pos: '55% 42%', seal: 'стандарт интерьера', hint: 'центр' },
  { name: 'Ваш город', state: 'next', img: '/ru/okompanii-storefront.jpg', pos: '50% 48%', seal: 'откроем под вас', hint: 'следующая точка' },
];

function FranshizaBranchCard({ quote }) {
  const perGram = quote?.goldRubPerGram || null;
  const rateDisplay = useAnimatedNumber(perGram);
  const [idx, go] = useShowcaseCycle(BRANCH_CITIES.length, 4200);
  const city = BRANCH_CITIES[idx];

  return (
    <div className="rl-branch-stage">
      <span className="rl-branch-ghost rl-branch-ghost--2" aria-hidden />
      <span className="rl-branch-ghost rl-branch-ghost--1" aria-hidden />
      <motion.div className="rl-branch" initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.35, ease: EASE }}>
        <div className="rl-branch-bar">
          <span className="rl-branch-pin" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 21s7-5.6 7-11.2A7 7 0 0 0 5 9.8C5 15.4 12 21 12 21z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              <circle cx="12" cy="9.8" r="2.2" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          </span>
          <span className="rl-branch-bar-copy">
            <b>ОТДЕЛЕНИЕ REAKTIVO</b>
            <i>{city.hint}</i>
          </span>
          <span className="rl-calc-live"><i />live</span>
        </div>
        <button type="button" className="rl-branch-media" onClick={() => go()} aria-label="Следующий город">
          <AnimatePresence mode="wait">
            <motion.img
              key={city.name}
              src={city.img}
              alt=""
              style={{ objectPosition: city.pos }}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            />
          </AnimatePresence>
          <span className="rl-branch-seal">{city.seal}</span>
        </button>
        <div className="rl-branch-cities">
          {BRANCH_CITIES.map((c, i) => (
            <button
              key={c.name}
              type="button"
              className={`rl-branch-city${c.state === 'next' ? ' rl-branch-city--next' : ''}${i === idx ? ' is-active' : ''}`}
              onClick={() => go(i)}
              aria-pressed={i === idx}
            >
              <span className="rl-branch-city-name"><i aria-hidden />{c.name}</span>
              <b>{c.state === 'on' ? 'работает' : 'открываем'}</b>
            </button>
          ))}
        </div>
        <div className="rl-branch-rate">
          <div>
            <span className="rl-branch-rate-label">курс на экране отделения</span>
            <strong>{rateDisplay != null ? formatMoney(rateDisplay) : '· · ·'}<em>/г</em></strong>
          </div>
          <RuGoldTicker value={perGram} />
        </div>
      </motion.div>
    </div>
  );
}

export function RuFranshiza() {
  const quote = useGoldQuote();
  const lenisRef = useRuLenis();
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });

  useEffect(() => { setDraftMeta('Франшиза Reaktivo — открыть отделение'); }, []);

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />

      <RuHeader active="/ru/franshiza/" lenisRef={lenisRef} ctaHref="#zayavka" ctaLabel="Обсудить открытие" />

      <main>
        <RuFullHero
          imgDark="/office-lobby.jpg"
          imgLight="/office-lobby.jpg"
          imgPos="72% 55%"
          kicker="Франшиза"
          title={<>Откройте отделение <span className="il-accent-text">в своём городе</span></>}
          sub="Запуск под ключ или экспресс-переход для действующей скупки: бренд, операционная система, обучение команды и поддержка на каждом этапе."
          primary={{ href: '#zayavka', label: 'Обсудить открытие' }}
          secondary={{ href: '#chto', label: 'Что входит' }}
          aside={<FranshizaBranchCard quote={quote} />}
        />

        <RuMarquee items={[
          'Бренд', 'Операционная система', 'Обучение команды', 'Стандарты сервиса',
          'Маркетинг запуска', 'Сопровождение',
        ]} />

        <section className="il-section rl-kpis-section">
          <div className="il-section-inner">
            <RuKpis items={[
              { val: '3 города', label: 'уже работают по системе', icon: 'pin', imgDark: '/ru/kpi-cities-dark.jpg', imgLight: '/ru/kpi-cities-light.jpg' },
              { val: '5 минут', label: 'средняя сделка в отделении', icon: 'clock', imgDark: '/ru/kpi-watch-dark.jpg', imgLight: '/ru/kpi-watch-light.jpg' },
              { val: 'финтех', label: 'операционная система, а не тетрадь с калькулятором', icon: 'bolt', imgDark: '/ru/kpi-ticker-dark.jpg', imgLight: '/ru/kpi-ticker-light.jpg' },
              { val: '2 формата', label: 'с нуля или переход действующей точки', icon: 'building', imgDark: '/ru/kpi-office-dark.jpg', imgLight: '/ru/kpi-office-light.jpg' },
            ]} />
          </div>
        </section>

        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Почему модель работает</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Клиент выбирает технологичный сервис,<br />скорость и комфорт</h2></Reveal>
            </div>
            <div className="rl-vs">
              <Reveal className="rl-vs-col rl-vs-col--old" y={20}>
                <span className="rl-vs-tag">Обычная скупка</span>
                <h4>Точка без бренда<br />и без системы</h4>
                <ul>
                  <li>Раздутый курс в рекламе и другой на месте</li>
                  <li>Комиссии и другие предлоги снизить цену</li>
                  <li>Тетрадь, калькулятор и человеческий фактор</li>
                  <li>Негативный опыт клиента от сделки</li>
                </ul>
                <div className="rl-vs-fig">Разовые клиенты</div>
                <div className="rl-vs-figl">и потолок по обороту</div>
              </Reveal>
              <Reveal className="rl-vs-col rl-vs-col--new" delay={0.08} y={20}>
                <span className="rl-vs-tag">Отделение Reaktivo</span>
                <h4>Бренд, система<br />и стандарты сервиса</h4>
                <ul>
                  <li>Единый биржевой курс — на сайте и в отделениях</li>
                  <li>Никаких комиссий и вычетов</li>
                  <li>Расчёт выкупа, договор и курс в операционной системе</li>
                  <li>Клиентская база и система лояльности</li>
                </ul>
                <div className="rl-vs-fig">Постоянные клиенты сервиса</div>
                <div className="rl-vs-figl">заявки с reaktivo.ru идут в ваше отделение</div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="il-section" id="chto">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Что входит</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Передаём не логотип, а <span className="il-accent-text">систему</span></h2></Reveal>
            </div>
            <motion.div className="il-cards rl-perks-grid" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
              {INCLUDES.map((a) => (
                <motion.div className="il-card" key={a.title} variants={staggerChild} whileHover={{ y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
                  <h3 className="il-card-title">{a.title}</h3>
                  <p className="il-card-text">{a.text}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="il-section il-section--alt" id="it">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Превосходство IT</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Не скупка, а <span className="il-accent-text">финтех</span></h2></Reveal>
              <Reveal delay={0.14}><p className="il-section-lead">Вместе с франшизой вы получаете операционную систему Reaktivo. Справа — она в работе: настоящий биржевой курс и сделка, как её видит ваша команда.</p></Reveal>
            </div>
            <div className="rl-media-split rl-media-split--even">
              <motion.div className="il-cards rl-media-split-cards" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
                {IT_FEATURES.map((a) => (
                  <motion.div className="il-card" key={a.title} variants={staggerChild} whileHover={{ y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
                    <h3 className="il-card-title">{a.title}</h3>
                    <p className="il-card-text">{a.text}</p>
                  </motion.div>
                ))}
              </motion.div>
              <RuTiltCard className="rl-media-split-visual rl-media-split-visual--os">
                <FranshizaOsMock quote={quote} />
              </RuTiltCard>
            </div>
          </div>
        </section>

        <section className="il-section">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Два формата</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Новая точка — или экспресс-переход</h2></Reveal>
            </div>
            <motion.div className="rl-two-cards" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
              {FORMATS.map((f) => (
                <motion.div className="il-card" key={f.title} variants={staggerChild} whileHover={{ y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
                  <h3 className="il-card-title">{f.title}</h3>
                  <p className="il-card-text">{f.text}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Наши стандарты</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Формат, созданный для клиента</h2></Reveal>
              <Reveal delay={0.14}><p className="il-section-lead">Светлые пространства, отдельные зоны для проверки и оплаты, вывод курса на экране. Именно таким будет отделение каждого партнёра Reaktivo.</p></Reveal>
            </div>
            <Reveal delay={0.1}>
              <RuPhotoCard src={officeHallPhoto} alt="Зал отделения Reaktivo" />
            </Reveal>
          </div>
        </section>

        <RuStatement text="Франшиза — это когда вам передают не логотип, а работающую систему: курс, процессы, обучение и поток клиентов." />

        <section className="il-section">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Путь к открытию</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Пять шагов до первой сделки</h2></Reveal>
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
                <FranshizaForm />
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
