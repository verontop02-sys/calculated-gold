import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { clientApi, fintechApi } from './api.js';
import { ThemeToggle } from './ThemeToggle.jsx';
import { MissedBenefitCalc } from './MissedBenefitCalc.jsx';

function formatMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(n));
}

const STEPS = [
  {
    n: '01',
    title: 'Регистрация в кабинете',
    text: 'Вход по номеру телефона и коду из SMS — без бумажных анкет и визитов в офис.',
  },
  {
    n: '02',
    title: 'Покупка золота от 1 г',
    text: 'Фиксируете курс в моменте и пополняете виртуальный слиток — с любой суммы, без порогов входа.',
  },
  {
    n: '03',
    title: 'Рост портфеля онлайн',
    text: 'Курс золота обновляется в реальном времени, баланс в граммах и рублях виден в любой момент.',
  },
  {
    n: '04',
    title: 'Продажа и вывод средств',
    text: 'Продаёте часть или весь портфель по текущему курсу — деньги выводятся на счёт без задержек.',
  },
];

const ADVANTAGES = [
  {
    icon: '⚖️',
    title: 'Точный учёт без округлений',
    text: 'Граммы считаются с точностью до четырёх знаков — ни одна доля миллиграмма не теряется при покупке и продаже.',
  },
  {
    icon: '🔍',
    title: 'Прозрачная комиссия заранее',
    text: 'Размер комиссии показывается до подтверждения сделки — никаких скрытых удержаний по факту.',
  },
  {
    icon: '🌓',
    title: 'Светлая и тёмная тема',
    text: 'Кабинет подстраивается под ваши привычки и одинаково удобен днём и ночью.',
  },
  {
    icon: '📄',
    title: 'Выписка по сделкам в PDF',
    text: 'Полная история операций формируется в один клик — для отчётности и личного контроля.',
  },
  {
    icon: '🤖',
    title: 'AI-ассистент по портфелю',
    text: 'Отвечает на вопросы про ваш баланс и строит прогнозы на исторических данных ЦБ РФ.',
  },
  {
    icon: '🔒',
    title: 'Официальный курс ЦБ и биржи',
    text: 'Котировки берутся из официальных источников — никакой самодеятельности в ценообразовании.',
  },
];

const FAQ = [
  {
    q: 'Сколько стоит купить золото в Reaktivo?',
    a: 'Минимальный порог покупки — от 1 грамма. Комиссия показывается заранее, до подтверждения сделки, и зависит от текущих настроек площадки.',
  },
  {
    q: 'Что значит «золото на счету»?',
    a: 'В кабинете ведётся точный учёт вашего виртуального остатка в граммах по текущему курсу. Это учётная запись в системе Reaktivo, а не физическое хранение слитка.',
  },
  {
    q: 'Как продать золото и получить деньги?',
    a: 'В разделе «Продать» указываете количество граммов или сумму — сделка фиксируется по актуальному курсу, а средства становятся доступны к выводу.',
  },
  {
    q: 'По какому курсу считается доходность?',
    a: 'Исторические расчёты в калькуляторе используют официальные данные Банка России; текущие сделки — биржевой курс, отображаемый в кабинете в реальном времени.',
  },
  {
    q: 'Нужно ли приходить в офис?',
    a: 'Нет. Вся работа — от входа до продажи и вывода средств — происходит онлайн в личном кабинете.',
  },
  {
    q: 'Это инвестиционная рекомендация?',
    a: 'Нет. Материалы на сайте и в калькуляторе носят иллюстративный характер и не являются индивидуальной инвестиционной рекомендацией. Прошлый рост цены не гарантирует будущий результат.',
  },
];

function useRevealOnScroll() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setVisible(true); });
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, visible];
}

function Reveal({ as: Tag = 'div', className = '', children, ...rest }) {
  const [ref, visible] = useRevealOnScroll();
  return (
    <Tag ref={ref} className={`il-reveal${visible ? ' il-reveal--in' : ''} ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}

function FaqItem({ item, open, onToggle }) {
  return (
    <div className={`il-faq-item${open ? ' il-faq-item--open' : ''}`}>
      <button type="button" className="il-faq-q" onClick={onToggle}>
        <span>{item.q}</span>
        <span className="il-faq-plus" aria-hidden>{open ? '−' : '+'}</span>
      </button>
      <div className="il-faq-a-wrap">
        <p className="il-faq-a">{item.a}</p>
      </div>
    </div>
  );
}

export function InvestLanding() {
  const [quote, setQuote] = useState(null);
  const [quoteErr, setQuoteErr] = useState('');
  const [history, setHistory] = useState(null);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    document.title = 'Reaktivo Invest — инвестиции в золото онлайн';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    const prevContent = meta.getAttribute('content');
    meta.setAttribute(
      'content',
      'Инвестируйте в золото онлайн от 1 грамма: реальный курс, прозрачная комиссия, калькулятор упущенной выгоды и личный кабинет Reaktivo.PRO.'
    );
    return () => { if (prevContent != null) meta.setAttribute('content', prevContent); };
  }, []);

  useEffect(() => {
    let alive = true;
    clientApi.buybackQuote('moex')
      .then((q) => { if (alive) setQuote(q); })
      .catch((e) => { if (alive) setQuoteErr(e?.message || ''); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    fintechApi.cbrGoldHistory()
      .then((out) => { if (alive) setHistory(out.points || []); })
      .catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, []);

  const growth = useMemo(() => {
    if (!history?.length) return null;
    const first = history[0];
    const last = history[history.length - 1];
    if (!first?.price || !last?.price) return null;
    return {
      first,
      last,
      multiple: last.price / first.price,
      years: last.year - first.year,
    };
  }, [history]);

  const chartData = useMemo(() => {
    if (!history?.length) return [];
    return history.map((p) => ({ year: String(p.year), price: p.price }));
  }, [history]);

  return (
    <div className="il-root">
      <header className="il-header">
        <div className="il-header-inner">
          <a href="/" className="il-logo">REAKTIVO<span>.PRO</span> <em>Invest</em></a>
          <nav className="il-nav">
            <a href="#how" className="il-nav-link">Как это работает</a>
            <a href="#calc" className="il-nav-link">Калькулятор</a>
            <a href="#faq" className="il-nav-link">FAQ</a>
          </nav>
          <div className="il-header-actions">
            <ThemeToggle />
            <a href="/kabinet" className="il-btn il-btn--ghost">Войти</a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="il-hero">
          <div className="il-hero-bg" aria-hidden>
            <span className="il-hero-orb il-hero-orb--1" />
            <span className="il-hero-orb il-hero-orb--2" />
          </div>
          <div className="il-hero-inner">
            <span className="il-badge il-anim-in" style={{ animationDelay: '0.02s' }}>Личный кабинет инвестора Reaktivo.PRO</span>
            <h1 className="il-hero-title il-anim-in" style={{ animationDelay: '0.08s' }}>
              Инвестируйте в золото <span className="il-accent-text">онлайн</span>,<br />начиная от 1 грамма
            </h1>
            <p className="il-hero-sub il-anim-in" style={{ animationDelay: '0.14s' }}>
              Реальный биржевой курс, прозрачная комиссия до подтверждения сделки и точный учёт до четырёх знаков после запятой. Покупайте, продавайте и следите за портфелем в одном кабинете.
            </p>
            <div className="il-hero-cta il-anim-in" style={{ animationDelay: '0.2s' }}>
              <a href="/kabinet" className="il-btn il-btn--primary il-btn--lg">Открыть кабинет</a>
              <a href="#calc" className="il-btn il-btn--outline il-btn--lg">Рассчитать выгоду</a>
            </div>
            <div className="il-hero-quote il-anim-in" style={{ animationDelay: '0.26s' }}>
              {quote?.goldRubPerGram ? (
                <>
                  <span className="il-hero-quote-label">Золото сейчас</span>
                  <span className="il-hero-quote-val">{formatMoney(quote.goldRubPerGram)} <small>/ г</small></span>
                  <span className="il-hero-quote-live"><i /> в реальном времени</span>
                </>
              ) : quoteErr ? (
                <span className="il-hero-quote-label">Курс временно недоступен</span>
              ) : (
                <span className="il-hero-quote-label">Загружаем текущий курс…</span>
              )}
            </div>
          </div>
        </section>

        {/* Market dynamics */}
        <Reveal as="section" className="il-section il-market">
          <div className="il-section-inner">
            <div className="il-market-grid">
              <div className="il-market-copy">
                <span className="il-pill">Динамика рынка</span>
                <h2 className="il-h2">
                  {growth ? (
                    <>Золото выросло в <span className="il-accent-text">{growth.multiple.toFixed(1)}×</span> за {growth.years} лет</>
                  ) : (
                    <>Золото стабильно растёт в цене на длинном горизонте</>
                  )}
                </h2>
                <p className="il-p">
                  По официальным данным Банка России цена на золото демонстрирует устойчивый долгосрочный рост, опережая инфляцию и многие традиционные инструменты сбережений.
                </p>
                {growth && (
                  <div className="il-market-stats">
                    <div>
                      <span className="il-stat-label">{growth.first.year} год</span>
                      <span className="il-stat-val">{Math.round(growth.first.price).toLocaleString('ru-RU')} ₽/г</span>
                    </div>
                    <div className="il-market-arrow">→</div>
                    <div>
                      <span className="il-stat-label">{growth.last.year} год</span>
                      <span className="il-stat-val il-accent-text">{Math.round(growth.last.price).toLocaleString('ru-RU')} ₽/г</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="il-market-chart">
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                      <defs>
                        <linearGradient id="ilMarketFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="year" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={32} />
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-panel-solid)', border: '1px solid var(--stroke)', borderRadius: 10, fontSize: 12, color: 'var(--text)' }}
                        formatter={(v) => [`${Number(v).toLocaleString('ru-RU')} ₽/г`, 'ЦБ РФ']}
                      />
                      <Area type="monotone" dataKey="price" stroke="var(--accent)" strokeWidth={2.5} fill="url(#ilMarketFill)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="il-market-loading"><span className="mbc-spinner" /> Загружаем историю ЦБ…</div>
                )}
              </div>
            </div>
          </div>
        </Reveal>

        {/* Calculator */}
        <Reveal as="section" id="calc" className="il-section il-calc-section">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <span className="il-pill">Бесплатный инструмент</span>
              <h2 className="il-h2">Сколько вы могли бы заработать?</h2>
              <p className="il-p">Введите сумму и год покупки — калькулятор посчитает результат по официальному курсу ЦБ РФ. Регистрация не требуется.</p>
            </div>
            <MissedBenefitCalc />
          </div>
        </Reveal>

        {/* How it works */}
        <Reveal as="section" id="how" className="il-section">
          <div className="il-section-inner">
            <div className="il-section-head">
              <span className="il-pill">Как это работает</span>
              <h2 className="il-h2">От регистрации до продажи — четыре простых шага</h2>
            </div>
            <div className="il-steps">
              {STEPS.map((s) => (
                <div className="il-step" key={s.n}>
                  <span className="il-step-n">{s.n}</span>
                  <h3 className="il-step-title">{s.title}</h3>
                  <p className="il-step-text">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Advantages */}
        <Reveal as="section" className="il-section il-section--alt">
          <div className="il-section-inner">
            <div className="il-section-head">
              <span className="il-pill">Почему Reaktivo</span>
              <h2 className="il-h2">Продукт, которому можно доверять цифры</h2>
            </div>
            <div className="il-cards">
              {ADVANTAGES.map((a) => (
                <div className="il-card" key={a.title}>
                  <span className="il-card-icon">{a.icon}</span>
                  <h3 className="il-card-title">{a.title}</h3>
                  <p className="il-card-text">{a.text}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* FAQ */}
        <Reveal as="section" id="faq" className="il-section">
          <div className="il-section-inner il-section-inner--narrow">
            <div className="il-section-head">
              <span className="il-pill">Частые вопросы</span>
              <h2 className="il-h2">FAQ</h2>
            </div>
            <div className="il-faq">
              {FAQ.map((item, i) => (
                <FaqItem key={item.q} item={item} open={openFaq === i} onToggle={() => setOpenFaq((cur) => (cur === i ? -1 : i))} />
              ))}
            </div>
          </div>
        </Reveal>

        {/* Final CTA */}
        <Reveal as="section" className="il-section il-final-cta">
          <div className="il-section-inner il-section-inner--narrow il-final-cta-inner">
            <h2 className="il-h2">Начните инвестировать в золото сегодня</h2>
            <p className="il-p">Вход по номеру телефона — кабинет откроется за пару минут.</p>
            <a href="/kabinet" className="il-btn il-btn--primary il-btn--lg">Открыть кабинет</a>
            <p className="il-disclaimer">
              Материалы носят иллюстративный характер и не являются индивидуальной инвестиционной рекомендацией или предложением по покупке ценных бумаг. Прошлый рост цены не гарантирует будущий результат.
            </p>
          </div>
        </Reveal>
      </main>

      <footer className="il-footer">
        <div className="il-section-inner il-footer-inner">
          <span>© {new Date().getFullYear()} REAKTIVO.PRO</span>
          <div className="il-footer-links">
            <a href="/kabinet" className="il-nav-link">Личный кабинет</a>
            <a href="/pro" className="il-nav-link il-nav-link--dim">Сотрудникам</a>
          </div>
        </div>
      </footer>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.il-root {
  min-height: 100dvh;
  background: var(--bg-deep);
  background-image: var(--bg-gradient);
  color: var(--text);
  font-family: var(--font-display);
  overflow-x: hidden;
}
.il-section-inner { max-width: 1160px; margin: 0 auto; padding: 0 24px; }
.il-section-inner--narrow { max-width: 780px; }

.il-header {
  position: sticky; top: 0; z-index: 40;
  background: color-mix(in srgb, var(--bg-panel-solid) 78%, transparent);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--stroke-soft);
}
.il-header-inner {
  max-width: 1160px; margin: 0 auto; padding: 14px 24px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
}
.il-logo { font-weight: 800; font-size: 1.02rem; letter-spacing: -0.01em; color: var(--text-strong); text-decoration: none; white-space: nowrap; }
.il-logo span { color: var(--accent); }
.il-logo em { font-style: normal; color: var(--text-muted); font-weight: 600; margin-left: 4px; }
.il-nav { display: flex; gap: 22px; }
.il-nav-link { color: var(--text-muted); text-decoration: none; font-size: 0.86rem; font-weight: 600; transition: color 0.15s; }
.il-nav-link:hover { color: var(--text-strong); }
.il-header-actions { display: flex; align-items: center; gap: 12px; }

.il-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  border-radius: 12px; font-weight: 700; font-size: 0.86rem; text-decoration: none;
  padding: 10px 18px; border: 1px solid transparent; cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.il-btn--primary { background: var(--accent); color: #fff; box-shadow: 0 8px 24px -8px color-mix(in srgb, var(--accent) 65%, transparent); }
.il-btn--primary:hover { transform: translateY(-1px); box-shadow: 0 12px 28px -8px color-mix(in srgb, var(--accent) 75%, transparent); }
.il-btn--ghost { background: transparent; border-color: var(--stroke); color: var(--text); }
.il-btn--ghost:hover { border-color: var(--accent); color: var(--accent); }
.il-btn--outline { background: transparent; border-color: var(--stroke); color: var(--text-strong); }
.il-btn--outline:hover { border-color: var(--accent); color: var(--accent); }
.il-btn--lg { padding: 14px 26px; font-size: 0.95rem; border-radius: 14px; }

.il-hero { position: relative; padding: 76px 24px 64px; overflow: hidden; }
.il-hero-bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.il-hero-orb {
  position: absolute; border-radius: 50%; filter: blur(70px); opacity: 0.35;
  background: radial-gradient(circle, var(--accent), transparent 70%);
  animation: ilFloat 9s ease-in-out infinite;
}
.il-hero-orb--1 { width: 420px; height: 420px; top: -160px; right: -100px; }
.il-hero-orb--2 { width: 320px; height: 320px; bottom: -140px; left: -80px; animation-delay: -4s; opacity: 0.22; }
@keyframes ilFloat { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-20px, 24px) scale(1.06); } }

.il-hero-inner { position: relative; z-index: 1; max-width: 780px; margin: 0 auto; text-align: center; }
.il-badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--accent); background: var(--accent-soft); padding: 6px 14px; border-radius: 100px;
  margin-bottom: 20px;
}
.il-hero-title { font-size: clamp(1.9rem, 4.4vw, 3.1rem); font-weight: 800; line-height: 1.14; letter-spacing: -0.02em; margin: 0 0 18px; color: var(--text-strong); }
.il-accent-text { color: var(--accent); }
.il-hero-sub { font-size: 1.05rem; line-height: 1.6; color: var(--text-muted); max-width: 640px; margin: 0 auto 30px; }
.il-hero-cta { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-bottom: 34px; }
.il-hero-quote {
  display: inline-flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center;
  background: var(--bg-panel-solid); border: 1px solid var(--stroke); border-radius: 100px;
  padding: 10px 22px;
}
.il-hero-quote-label { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; }
.il-hero-quote-val { font-size: 1.1rem; font-weight: 800; color: var(--text-strong); font-variant-numeric: tabular-nums; }
.il-hero-quote-val small { font-size: 0.7rem; color: var(--text-muted); font-weight: 600; }
.il-hero-quote-live { display: inline-flex; align-items: center; gap: 6px; font-size: 0.72rem; color: var(--emerald); font-weight: 700; }
.il-hero-quote-live i { width: 7px; height: 7px; border-radius: 50%; background: var(--emerald); display: inline-block; animation: ilPulse 1.6s ease-in-out infinite; }
@keyframes ilPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }

.il-anim-in { opacity: 0; transform: translateY(16px); animation: ilFadeUp 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
@keyframes ilFadeUp { to { opacity: 1; transform: translateY(0); } }

.il-reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1), transform 0.7s cubic-bezier(0.22, 1, 0.36, 1); }
.il-reveal--in { opacity: 1; transform: translateY(0); }

.il-section { padding: 64px 0; }
.il-section--alt { background: color-mix(in srgb, var(--bg-panel-solid) 45%, transparent); }
.il-section-head { text-align: center; max-width: 640px; margin: 0 auto 36px; }
.il-pill {
  display: inline-block; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;
  color: var(--accent); background: var(--accent-soft); padding: 5px 12px; border-radius: 100px; margin-bottom: 12px;
}
.il-h2 { font-size: clamp(1.5rem, 2.6vw, 2rem); font-weight: 800; letter-spacing: -0.015em; margin: 0 0 12px; color: var(--text-strong); line-height: 1.25; }
.il-p { font-size: 0.95rem; line-height: 1.65; color: var(--text-muted); margin: 0; }

.il-market-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 40px; align-items: center; }
.il-market-copy .il-section-head { display: none; }
.il-market-stats { display: flex; align-items: center; gap: 18px; margin-top: 22px; }
.il-market-arrow { color: var(--text-dim); font-size: 1.2rem; }
.il-stat-label { display: block; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); font-weight: 700; margin-bottom: 4px; }
.il-stat-val { display: block; font-size: 1.3rem; font-weight: 800; color: var(--text-strong); font-variant-numeric: tabular-nums; }
.il-market-chart {
  background: var(--bg-panel-solid); border: 1px solid var(--stroke); border-radius: 18px; padding: 16px;
}
.il-market-loading { display: flex; align-items: center; gap: 8px; justify-content: center; height: 260px; color: var(--text-muted); font-size: 0.88rem; }

.il-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
.il-step {
  background: var(--bg-panel-solid); border: 1px solid var(--stroke); border-radius: 16px; padding: 22px 18px;
  transition: transform 0.2s, border-color 0.2s;
}
.il-step:hover { transform: translateY(-4px); border-color: var(--accent); }
.il-step-n { font-size: 1.6rem; font-weight: 800; color: var(--accent-soft); display: block; margin-bottom: 10px; -webkit-text-stroke: 1px var(--accent); }
.il-step-title { font-size: 0.98rem; font-weight: 700; margin: 0 0 8px; color: var(--text-strong); }
.il-step-text { font-size: 0.84rem; line-height: 1.55; color: var(--text-muted); margin: 0; }

.il-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.il-card {
  background: var(--bg-panel-solid); border: 1px solid var(--stroke); border-radius: 16px; padding: 22px 20px;
  transition: transform 0.2s, border-color 0.2s;
}
.il-card:hover { transform: translateY(-4px); border-color: var(--accent); }
.il-card-icon { font-size: 1.6rem; display: block; margin-bottom: 12px; }
.il-card-title { font-size: 0.95rem; font-weight: 700; margin: 0 0 8px; color: var(--text-strong); }
.il-card-text { font-size: 0.84rem; line-height: 1.55; color: var(--text-muted); margin: 0; }

.il-faq { display: flex; flex-direction: column; gap: 10px; }
.il-faq-item { background: var(--bg-panel-solid); border: 1px solid var(--stroke); border-radius: 14px; overflow: hidden; transition: border-color 0.2s; }
.il-faq-item--open { border-color: var(--accent); }
.il-faq-q {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: none; border: none; padding: 16px 20px; text-align: left; cursor: pointer;
  font-size: 0.92rem; font-weight: 700; color: var(--text-strong);
}
.il-faq-plus { font-size: 1.2rem; color: var(--accent); font-weight: 700; flex-shrink: 0; transition: transform 0.2s; }
.il-faq-a-wrap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.25s ease; }
.il-faq-item--open .il-faq-a-wrap { grid-template-rows: 1fr; }
.il-faq-a { overflow: hidden; margin: 0; padding: 0 20px; font-size: 0.86rem; line-height: 1.6; color: var(--text-muted); }
.il-faq-item--open .il-faq-a { padding: 0 20px 18px; }

.il-final-cta-inner { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.il-final-cta .il-p { max-width: 480px; }
.il-disclaimer { font-size: 0.72rem; color: var(--text-dim); line-height: 1.5; max-width: 560px; margin-top: 8px; }

.il-footer { border-top: 1px solid var(--stroke-soft); padding: 24px 0; }
.il-footer-inner { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 0.82rem; color: var(--text-muted); }
.il-footer-links { display: flex; align-items: center; gap: 18px; }
.il-nav-link--dim { color: var(--text-dim); font-weight: 500; }

@media (max-width: 900px) {
  .il-market-grid { grid-template-columns: 1fr; }
  .il-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .il-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .il-nav { display: none; }
  .il-hero { padding: 56px 18px 48px; }
  .il-section { padding: 48px 0; }
  .il-steps { grid-template-columns: 1fr; }
  .il-cards { grid-template-columns: 1fr; }
  .il-footer-inner { flex-direction: column; gap: 8px; text-align: center; }
}
`;
