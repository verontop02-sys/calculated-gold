import { useEffect, useRef } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { CSS as IL_CSS, EASE, Magnetic, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import {
  RL_CSS, RuAtmosphere, RuFaq, RuFooter, RuHeader, RuHeroBg, RuKpis, RuLeadForm, RuMarquee, RuPhotoCard, RuStatement,
  officeHallPhoto, officeWorkPhoto, setDraftMeta, useRuLenis,
} from './RuShared.jsx';

const INCLUDES = [
  { title: 'Бренд и оформление', text: 'Вывеска, навигация и стандарт интерьера: клиент видит сервис, которому доверяют, а не «окно в стене».' },
  { title: 'Операционная система', text: 'Живой курс с биржи, оформление сделок, договоры, фото изделий, отчётность и статистика — всё в одной программе.' },
  { title: 'Обучение команды', text: 'Эксперты проходят курс: пробы, подделки, спектральный анализ, стандарты общения с клиентом — и аттестацию.' },
  { title: 'Стандарты сервиса', text: 'Регламент проверки при клиенте, зона ожидания, безопасность сделок — то, за что Reaktivo выбирают.' },
  { title: 'Маркетинг запуска', text: 'Реклама на город, страница отделения на сайте — заявки с reaktivo.ru идут в ваше отделение.' },
  { title: 'Сопровождение', text: 'Поддержка по операционке, юридическим вопросам и сложным изделиям. Вы не остаётесь один на один с нишей.' },
];

const FORMATS = [
  { title: 'Запуск с нуля', text: 'Подбор локации, ремонт по стандарту, найм и обучение команды, запуск рекламы. Для тех, кто заходит в нишу впервые: ведём за руку от договора до первой сделки.' },
  { title: 'Экспресс-переход', text: 'Для действующих скупок и ломбардов: ребрендинг, установка операционной системы, обучение вашей команды. Быстрее и дешевле запуска с нуля — точка продолжает работать.' },
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

export function RuFranshiza() {
  const lenisRef = useRuLenis();
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });

  useEffect(() => { setDraftMeta('Франшиза Reaktivo — открыть отделение (черновик)'); }, []);

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />
      <div className="rl-preview-flag">Черновик для просмотра · не окончательная версия</div>

      <RuHeader active="/ru/franshiza/" lenisRef={lenisRef} ctaHref="#zayavka" ctaLabel="Обсудить открытие" />

      <main>
        <p className="rl-crumbs"><a href="/ru/">Reaktivo</a> · Франшиза</p>

        <section className="il-hero" style={{ paddingTop: '48px' }} ref={heroRef}>
          <RuHeroBg heroRef={heroRef} />
          <div className="il-hero-inner">
            <div className="il-hero-copy">
              <motion.span className="il-badge" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
                <i className="il-badge-dot" /> Франшиза
              </motion.span>
              <motion.h1 className="il-hero-title rl-hero-title" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1, ease: EASE }}>
                Откройте отделение <span className="il-accent-text">в своём городе</span>
              </motion.h1>
              <motion.p className="il-hero-sub" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.32, ease: EASE }}>
                Запуск под ключ или экспресс-переход для действующей скупки: бренд,
                операционная система, обучение команды и поддержка на каждом этапе.
              </motion.p>
              <motion.div className="il-hero-cta" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.44, ease: EASE }}>
                <Magnetic>
                  <motion.a href="#zayavka" className="il-btn il-btn--primary il-btn--lg" whileTap={{ scale: 0.96 }}>
                    Обсудить открытие
                    <span className="il-btn-arrow" aria-hidden>→</span>
                  </motion.a>
                </Magnetic>
                <motion.a href="#chto" className="il-btn il-btn--outline il-btn--lg" whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}>
                  Что входит
                </motion.a>
              </motion.div>
            </div>
            <motion.div className="rl-hero-visual rl-photo-frame" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.35, ease: EASE }}>
              <RuPhotoCard className="rl-hero-photo" src={officeWorkPhoto} alt="Рабочая зона отделения Reaktivo" caption="Действующее отделение Reaktivo" />
            </motion.div>
          </div>
        </section>

        <RuMarquee items={[
          'Бренд', 'Операционная система', 'Обучение команды', 'Стандарты сервиса',
          'Маркетинг запуска', 'Сопровождение',
        ]} />

        <section className="il-section rl-kpis-section">
          <div className="il-section-inner">
            <RuKpis items={[
              { val: '3 города', label: 'уже работают по системе' },
              { val: '15 мин', label: 'средняя сделка в отделении' },
              { val: 'до 90%', label: 'клиенту — поток рекомендует сам себя' },
              { val: '2 формата', label: 'с нуля или переход действующей точки' },
            ]} />
          </div>
        </section>

        <section className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Почему модель работает</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Клиент выбирает сервис,<br />а не ближайшее окно</h2></Reveal>
            </div>
            <div className="rl-vs">
              <Reveal className="rl-vs-col rl-vs-col--old" y={20}>
                <span className="rl-vs-tag">Обычная скупка</span>
                <h4>Точка без бренда<br />и без системы</h4>
                <ul>
                  <li>Кустарная вывеска и недоверие с порога</li>
                  <li>Курс «по звонку», клиент торгуется</li>
                  <li>Тетрадь, калькулятор и человеческий фактор</li>
                  <li>Клиент приходит один раз и не возвращается</li>
                </ul>
                <div className="rl-vs-fig">Случайные клиенты</div>
                <div className="rl-vs-figl">и потолок по обороту</div>
              </Reveal>
              <Reveal className="rl-vs-col rl-vs-col--new" delay={0.08} y={20}>
                <span className="rl-vs-tag">Отделение Reaktivo</span>
                <h4>Бренд, система<br />и стандарты сервиса</h4>
                <ul>
                  <li>Узнаваемый бренд и светлый зал</li>
                  <li>Живой биржевой курс — на сайте и на экране</li>
                  <li>Сделки, договоры и отчёты считает система</li>
                  <li>Клиент возвращается и рекомендует</li>
                </ul>
                <div className="rl-vs-fig">Поток и повторные</div>
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

        <section className="il-section">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Два формата</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">С нуля — или поверх действующей точки</h2></Reveal>
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
              <Reveal><span className="il-pill">Как выглядит стандарт</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Отделение, в которое не страшно зайти</h2></Reveal>
              <Reveal delay={0.14}><p className="il-section-lead">Светлый зал, отдельная зона проверки и оплаты, живой курс на экране. Таким получает отделение каждый партнёр.</p></Reveal>
            </div>
            <Reveal delay={0.1} className="rl-photo-frame">
              <RuPhotoCard src={officeHallPhoto} alt="Зал отделения Reaktivo" caption="Отделение Reaktivo в Калининграде" />
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
            <Reveal><FranshizaForm /></Reveal>
          </div>
        </section>
      </main>

      <RuFooter />

      <style>{IL_CSS}</style>
      <style>{RL_CSS}</style>
    </div>
  );
}
