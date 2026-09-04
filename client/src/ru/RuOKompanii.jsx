import { useEffect, useState } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { clientApi } from '../api.js';
import { ymReachGoal } from '../yandexMetrika.js';
import { CSS as IL_CSS, EASE, Reveal, staggerChild, staggerParent } from '../InvestLanding.jsx';
import { FranshizaOsMock } from './RuFranshiza.jsx';
import {
  RL_CSS, RuAtmosphere, RuCtaPanel, RuFooter, RuFullHero, RuGoldTicker, RuHeader, RuMarquee, RuPhotoCard, RuStatement, RuTiltCard,
  formatMoney, isLeadName, isRuPhone, setDraftMeta, useAnimatedNumber, useGoldQuote, useRuLenis, useShowcaseCycle,
} from './RuShared.jsx';

const MEMORANDUM_P = [
  'Reaktivo — строит в России сервис нового формата для работы с золотом: технологичный и честный там, где раньше были только непрозрачность и цена «на глаз».',
  'Мы уверены: сервисы в России должны меняться быстрее, чем меняются сейчас. Слишком многое — от того, как считают цену, до того, как разговаривают с клиентом, — досталось в наследство от рынка, который не обновлялся десятилетиями. Мы не готовы называть это нормой.',
  'И мы уверены в другом: люди заслуживают равного доступа к сервису и честной стоимости своего золота — где бы они ни жили. Поэтому наша задача — открыть отделения не только в каждом регионе страны, но и в большинстве больших и не очень больших городов.',
  'Мы создали не очередную скупку, а технологичный сервис для людей — с прозрачным курсом, IT-решениями и командой: всё это создаёт абсолютно новое впечатление от услуги.',
  'В ближайшие 3–5 лет мы запустим несколько принципиально новых сервисов и продуктов на стыке золота и технологий. Новый формат сервиса в России — то, куда мы идём.',
];

const FINTECH_FEATURES = [
  { title: 'Курс с двух бирж', text: 'Программа считает курс сразу по Лондонской и Московской биржам и обновляет его в реальном времени — без ручных правок и «настроения рынка».' },
  { title: 'Учёт без бумаг', text: 'Каждая сделка и каждое отделение — в системе. Курьеры и приёмщики работают без бумажных журналов и тетрадей с калькулятором.' },
  { title: 'Не побочный эффект роста', text: 'Мы выстраиваем свой продукт, а не повторяем существующий формат скупки. Собственная технология — то, ради чего компания существует.' },
];

const TEAM_VALUES = [
  { title: 'Честная цена', text: 'Мы прямо называем курс и никогда не завышаем ожидания, чтобы потом их занизить на месте.' },
  { title: 'Каждый день лучше', text: 'Сервис, продукт и операционная система меняются постоянно — мы не стоим на месте.' },
  { title: 'Уважение к каждому', text: 'К клиентам, коллегам и партнёрам — без исключений и без «привилегированных» разговоров.' },
];

const LETTER_TOPICS = ['Предложение', 'Критика', 'Отзыв', 'Другое'];

function JoinTeamForm() {
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    if (phase === 'sending') return;
    const fd = new FormData(e.currentTarget);
    const payload = {
      source: 'komanda',
      name: String(fd.get('name') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      website: String(fd.get('website') || ''),
      fields: {
        'Какая роль интересует': String(fd.get('role') || '').trim(),
        'О себе': String(fd.get('about') || '').trim(),
      },
    };
    if (!isLeadName(payload.name)) {
      setError('Укажите имя');
      return;
    }
    if (!isRuPhone(payload.phone)) {
      setError('Укажите номер телефона, без него мы не сможем связаться');
      return;
    }
    if (!String(fd.get('role') || '').trim()) {
      setError('Укажите, какая роль интересует');
      return;
    }
    setPhase('sending');
    setError('');
    try {
      await clientApi.landingLead(payload);
      ymReachGoal('lead', { source: payload.source || '' });
      setPhase('sent');
    } catch (err) {
      setPhase('idle');
      setError(err?.message || 'Не получилось отправить. Попробуйте ещё раз или позвоните: 8 800 555-18-48');
    }
  }

  if (phase === 'sent') {
    return (
      <motion.div className="rl-form" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }}>
        <div className="rl-form-full rl-sent" role="status">
          <span className="rl-sent-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.5l5 5L19.5 7" /></svg>
          </span>
          <h3>Заявка принята</h3>
          <p className="rl-form-note">Посмотрим анкету и напишем вам — даже если сейчас нет открытой вакансии под вашу роль.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <form className="rl-form" onSubmit={onSubmit}>
      <div className="rl-form-full">
        <h3>Попасть в команду</h3>
        <p className="rl-form-note">Расскажите о себе — если совпадём по ценностям, найдём место в команде.</p>
      </div>
      <input className="rl-input" name="name" placeholder="Ваше имя" required maxLength={120} autoComplete="name" />
      <input className="rl-input" name="phone" placeholder="+7 (900) 000-00-00" required maxLength={120} inputMode="tel" autoComplete="tel" />
      <div className="rl-form-full">
        <input className="rl-input" name="role" placeholder="Какая роль интересует" required maxLength={200} />
      </div>
      <div className="rl-form-full">
        <textarea className="rl-input" name="about" rows={3} placeholder="Немного о себе и опыте" maxLength={800} />
      </div>
      <input className="rl-hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="rl-form-full">
        <motion.button type="submit" className="il-btn il-btn--primary il-btn--lg" style={{ width: '100%' }} disabled={phase === 'sending'} whileTap={{ scale: 0.97 }}>
          {phase === 'sending' ? (<><span className="rl-btn-spin" aria-hidden /> Отправляем…</>) : 'Отправить анкету'}
        </motion.button>
        {error && <p className="rl-form-error">{error}</p>}
      </div>
    </form>
  );
}

function CeoLetterForm() {
  const [topic, setTopic] = useState(LETTER_TOPICS[0]);
  const [agree, setAgree] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    if (phase === 'sending') return;
    if (!agree) { setError('Нужно согласие на обработку персональных данных.'); return; }
    const fd = new FormData(e.currentTarget);
    const payload = {
      source: 'pismo-ceo',
      name: String(fd.get('name') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      website: String(fd.get('website') || ''),
      fields: {
        'Тема письма': topic,
        'Текст письма': String(fd.get('message') || '').trim(),
      },
    };
    if (!isLeadName(payload.name)) {
      setError('Укажите имя');
      return;
    }
    if (!isRuPhone(payload.phone)) {
      setError('Укажите номер телефона, без него мы не сможем связаться');
      return;
    }
    if (!payload.fields['Текст письма']) {
      setError('Напишите текст письма');
      return;
    }
    setPhase('sending');
    setError('');
    try {
      await clientApi.landingLead(payload);
      ymReachGoal('lead', { source: payload.source || '' });
      setPhase('sent');
    } catch (err) {
      setPhase('idle');
      setError(err?.message || 'Не получилось отправить. Попробуйте ещё раз или напишите: team@reaktivo.ru');
    }
  }

  if (phase === 'sent') {
    return (
      <motion.div className="rl-form" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }}>
        <div className="rl-form-full rl-sent" role="status">
          <span className="rl-sent-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.5l5 5L19.5 7" /></svg>
          </span>
          <h3>Письмо отправлено</h3>
          <p className="rl-form-note">Генеральный директор получит его напрямую и лично прочитает.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <form className="rl-form" onSubmit={onSubmit}>
      <div className="rl-form-full">
        <h3>Написать письмо CEO</h3>
        <p className="rl-form-note">Есть предложение, критика или просто отзыв о том, как устроена Reaktivo? Напишите напрямую генеральному директору.</p>
      </div>
      <input className="rl-input" name="name" placeholder="Ваше имя" required maxLength={120} autoComplete="name" />
      <input className="rl-input" name="phone" placeholder="+7 (900) 000-00-00" required maxLength={120} inputMode="tel" autoComplete="tel" />
      <div className="rl-form-full">
        <span className="rl-form-label">Тема письма</span>
        <div className="rl-seg rl-seg--wrap">
          {LETTER_TOPICS.map((t) => (
            <button key={t} type="button" className={t === topic ? 'is-active' : ''} onClick={() => setTopic(t)}>{t}</button>
          ))}
        </div>
      </div>
      <div className="rl-form-full">
        <textarea className="rl-input" name="message" rows={4} placeholder="Текст письма — можно писать без ограничений по длине" required maxLength={4000} />
      </div>
      <div className="rl-form-full">
        <label className="rl-check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
          <span>Согласен на обработку персональных данных</span>
        </label>
      </div>
      <input className="rl-hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="rl-form-full">
        <motion.button type="submit" className="il-btn il-btn--primary il-btn--lg" style={{ width: '100%' }} disabled={phase === 'sending'} whileTap={{ scale: 0.97 }}>
          {phase === 'sending' ? (<><span className="rl-btn-spin" aria-hidden /> Отправляем…</>) : 'Отправить письмо'}
        </motion.button>
        {error && <p className="rl-form-error">{error}</p>}
      </div>
    </form>
  );
}

function AboutTerminalCard({ quote }) {
  const [xaut, setXaut] = useState(null);
  const [idx, go] = useShowcaseCycle(2, 5000);
  const moex = quote?.goldRubPerGram || null;
  const oz = xaut?.xautUsdPerOz || null;
  const moexDisplay = useAnimatedNumber(moex);
  const ozDisplay = useAnimatedNumber(oz);

  useEffect(() => {
    let alive = true;
    const load = () => clientApi.buybackQuote('xaut').then((q) => { if (alive) setXaut(q); }).catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const ozLabel = ozDisplay != null
    ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(ozDisplay)} $`
    : '· · ·';

  return (
    <div className="rl-term-stage">
      <span className="rl-term-ghost rl-term-ghost--2" aria-hidden />
      <span className="rl-term-ghost rl-term-ghost--1" aria-hidden />
      <motion.div className="rl-term" initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.35, ease: EASE }}>
        <div className="rl-term-bar">
          <span className="rl-term-mark" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 16V8l8-4 8 4v8l-8 4-8-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M12 12v8M4 8l8 4 8-4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="rl-term-bar-copy">
            <b>REAKTIVO PRO</b>
            <i>{idx === 0 ? 'Москва · Мосбиржа' : 'Лондон · XAUT'}</i>
          </span>
          <span className="rl-calc-live"><i />live</span>
        </div>
        <button
          type="button"
          className={`rl-term-board${idx === 0 ? ' is-active' : ''}`}
          style={{ backgroundImage: 'url(/cities/moscow.jpg)' }}
          onClick={() => go(0)}
          aria-pressed={idx === 0}
        >
          <span className="rl-term-board-k">Москва · Мосбиржа</span>
          <strong>{moexDisplay != null ? formatMoney(moexDisplay) : '· · ·'}<em>/г</em></strong>
          <RuGoldTicker value={moex} />
        </button>
        <button
          type="button"
          className={`rl-term-board rl-term-board--ldn${idx === 1 ? ' is-active' : ''}`}
          style={{ backgroundImage: 'url(/cities/london.jpg)' }}
          onClick={() => go(1)}
          aria-pressed={idx === 1}
        >
          <span className="rl-term-board-k">Лондон · XAUT</span>
          <strong>{ozLabel}<em>/oz</em></strong>
          <RuGoldTicker value={oz} />
        </button>
        <div className="rl-term-foot">
          <a href="#licenzia">лицензия</a>
          <span>ГИИС ДМДК</span>
          <span>3 города</span>
        </div>
      </motion.div>
    </div>
  );
}

export function RuOKompanii() {
  const quote = useGoldQuote();
  const lenisRef = useRuLenis();
  const { scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });

  useEffect(() => { setDraftMeta('О компании — Reaktivo'); }, []);

  return (
    <div className="il-root rl-root">
      <motion.div className="il-progress" style={{ scaleX: progressX }} aria-hidden />
      <RuAtmosphere />

      <RuHeader active="/ru/o-kompanii/" lenisRef={lenisRef} ctaHref="#pismo" ctaLabel="Написать CEO" />

      <main>
        <RuFullHero
          imgDark="/ru/okompanii-hero.jpg"
          imgLight="/ru/okompanii-hero.jpg"
          imgPos="62% 42%"
          kicker="О компании"
          title={<>Не скупка, а <span className="il-accent-text">технологичный сервис</span> нового формата</>}
          sub="Прозрачный курс, собственная операционная система и команда, которой можно доверять. Мы строим то, что до нас в этой отрасли делали редко."
          primary={{ href: '#pismo', label: 'Написать CEO' }}
          secondary={{ href: '#komanda', label: 'Попасть в команду' }}
          aside={<AboutTerminalCard quote={quote} />}
        />

        <RuMarquee items={[
          'Лицензия на скупку металлов', 'Спецучёт ГИИС ДМДК', 'Курс с двух бирж', 'Договор в приложении',
          'Команда по ценностям', 'Письмо напрямую CEO',
        ]} />

        <section className="il-section" id="memorandum">
          <div className="il-section-inner">
            <div className="rl-media-split rl-media-split--fill">
              <div>
                <div className="il-section-head">
                  <Reveal><span className="il-pill">Меморандум</span></Reveal>
                  <Reveal delay={0.08}><h2 className="il-h2">Новый формат сервиса — <span className="il-accent-text">то, куда мы идём</span></h2></Reveal>
                </div>
                {MEMORANDUM_P.map((p, i) => (
                  <Reveal key={p.slice(0, 24)} delay={0.1 + i * 0.04}>
                    <p className="il-section-lead" style={{ marginBottom: 14 }}>{p}</p>
                  </Reveal>
                ))}
              </div>
              <RuTiltCard className="rl-media-split-visual">
                <RuPhotoCard src="/ru/okompanii-lobby.jpg" alt="Зона ожидания отделения Reaktivo" />
              </RuTiltCard>
            </div>
          </div>
        </section>

        <RuStatement text="Люди заслуживают равного доступа к сервису и честной стоимости своего золота — где бы они ни жили." />

        <section className="il-section il-section--alt" id="licenzia">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Работаем по лицензии</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Лицензия и разрешения</h2></Reveal>
              <Reveal delay={0.14}>
                <p className="il-section-lead">
                  Reaktivo работает по лицензии на скупку драгоценных металлов и соблюдает требования законодательства
                  к обороту золота. Каждая сделка оформляется договором — для нас это не формальность для проверяющих,
                  а часть продукта. Все операции осуществляются при предъявлении оригинала паспорта РФ.
                </p>
              </Reveal>
            </div>
            <div className="il-license-grid">
              <Reveal delay={0.1} className="il-license-card">
                <span className="il-license-badge">Действующая</span>
                <h3 className="il-license-title">Лицензия на скупку драгоценных металлов</h3>
                <dl className="il-license-meta">
                  <div><dt>Номер</dt><dd>Л023-00119-77/04343605</dd></div>
                  <div><dt>Дата выдачи</dt><dd>11.02.2026</dd></div>
                  <div><dt>Выдана</dt><dd>Межрегиональное управление Федеральной пробирной палаты по ЦФО</dd></div>
                </dl>
                <p className="il-license-scope">
                  Скупка у физических лиц ювелирных и других изделий из драгоценных металлов и (или) драгоценных
                  камней, лома таких изделий, заготовка лома и отходов драгоценных металлов и продукции,
                  содержащей драгоценные металлы.
                </p>
                <a href="/docs/license-probpalata.pdf" target="_blank" rel="noopener noreferrer" className="il-license-link">
                  Открыть PDF лицензии <span aria-hidden>→</span>
                </a>
              </Reveal>
              <Reveal delay={0.16} className="il-license-card">
                <span className="il-license-badge il-license-badge--indigo">ГИИС ДМДК</span>
                <h3 className="il-license-title">Спецучёт участников рынка драгметаллов</h3>
                <dl className="il-license-meta">
                  <div><dt>Учётный номер</dt><dd>ЮЛ7701041176</dd></div>
                  <div><dt>Дата постановки</dt><dd>05.02.2026</dd></div>
                  <div><dt>Реестр</dt><dd>Государственная информационная система ГИИС ДМДК</dd></div>
                </dl>
                <p className="il-license-scope">
                  ООО «СЭТ» включено в реестр юридических лиц, индивидуальных предпринимателей и художников-ювелиров,
                  осуществляющих операции с драгоценными металлами и драгоценными камнями.
                </p>
                <a href="/docs/giis-dmdk-registration.pdf" target="_blank" rel="noopener noreferrer" className="il-license-link">
                  Открыть PDF уведомления <span aria-hidden>→</span>
                </a>
              </Reveal>
              <Reveal delay={0.22} className="il-license-qr-card">
                <a
                  href="https://knd.gov.ru/registry-entry?registryType=purchasePreciousMetals&id=698c2ad78212522cdf5de5c6"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="il-license-qr-link"
                  aria-label="Открыть карточку лицензии в реестре knd.gov.ru"
                >
                  <img src="/license-qr.png" alt="QR-код проверки лицензии в реестре knd.gov.ru" width="160" height="160" loading="lazy" />
                </a>
                <div className="il-license-qr-copy">
                  <span className="il-license-qr-label">Проверить лицензию онлайн</span>
                  <p className="il-license-qr-text">
                    Наведите камеру на QR или откройте ссылку — попадёте прямо на карточку нашей лицензии
                    в государственном реестре knd.gov.ru.
                  </p>
                  <a
                    href="https://knd.gov.ru/registry-entry?registryType=purchasePreciousMetals&id=698c2ad78212522cdf5de5c6"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="il-license-link"
                  >
                    Открыть реестр <span aria-hidden>→</span>
                  </a>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="il-section" id="fintekh">
          <div className="il-section-inner">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Превосходство IT</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Не скупка — а настоящий <span className="il-accent-text">финтех</span></h2></Reveal>
              <Reveal delay={0.14}>
                <p className="il-section-lead">
                  Наша программа считает курс сразу по двум биржам — Лондонской и Московской — и обновляет его в
                  реальном времени. Учёт ведётся по каждой сделке и каждому отделению; курьеры работают без бумаг.
                  Справа — часть интерфейса Reaktivo Pro в работе.
                </p>
              </Reveal>
            </div>
            <div className="rl-media-split rl-media-split--even">
              <motion.div className="il-cards rl-media-split-cards" variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-8% 0px' }}>
                {FINTECH_FEATURES.map((a) => (
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

        <RuStatement text="Создать новый формат сервиса — не побочный эффект роста, а то, ради чего компания вообще существует." />

        <section className="il-section il-section--alt" id="komanda-intro">
          <div className="il-section-inner">
            <div className="rl-media-split rl-media-split--reverse rl-media-split--even">
              <RuTiltCard className="rl-media-split-visual">
                <RuPhotoCard src="/ru/okompanii-desk.jpg" alt="Рабочее место команды Reaktivo" />
              </RuTiltCard>
              <div>
                <div className="il-section-head">
                  <Reveal><span className="il-pill">Команда</span></Reveal>
                  <Reveal delay={0.08}><h2 className="il-h2">Собираем команду не только по резюме</h2></Reveal>
                  <Reveal delay={0.14}>
                    <p className="il-section-lead">
                      Важнее совпадение ценностей и желание создавать что-то полезное. Нам важно, чтобы человек
                      разделял наши принципы: мы честно называем цену, каждый день улучшаем сервис и всегда
                      уважительно относимся ко всем.
                    </p>
                  </Reveal>
                </div>
                <div className="rl-rows">
                  {TEAM_VALUES.map((v, i) => (
                    <Reveal key={v.title} delay={0.1 + i * 0.05}>
                      <div className="rl-row">
                        <span className="rl-row-n">0{i + 1}</span>
                        <div><h4>{v.title}</h4><p>{v.text}</p></div>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="il-section il-section--cta" id="komanda">
          <div className="il-section-inner il-section-inner--narrow">
            <Reveal>
              <RuCtaPanel>
                <JoinTeamForm />
              </RuCtaPanel>
            </Reveal>
          </div>
        </section>

        <section className="il-section" id="pismo-intro">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <Reveal><span className="il-pill">Прямая связь</span></Reveal>
              <Reveal delay={0.08}><h2 className="il-h2">Написать письмо CEO</h2></Reveal>
              <Reveal delay={0.14}>
                <p className="il-section-lead">
                  Есть предложение, критика или просто отзыв о том, как устроена Reaktivo? Напишите напрямую
                  генеральному директору и расскажите, что, по вашему мнению, стоит улучшить в компании.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="il-section il-section--cta" id="pismo">
          <div className="il-section-inner il-section-inner--narrow">
            <Reveal>
              <RuCtaPanel>
                <CeoLetterForm />
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
