import { ThemeToggle } from './ThemeToggle.jsx';

/**
 * Публичная Политика обработки персональных данных (черновик под 152-ФЗ).
 * Текст — рабочий шаблон по реквизитам ООО «СЭТ»; юрист/Ромка могут заменить.
 */
export function PrivacyPolicy() {
  return (
    <div className="pp-root">
      <header className="pp-header">
        <div className="pp-header-inner">
          <a href="/" className="pp-logo">
            <img src="/logo-reaktivo-mark.svg" alt="" width="36" height="36" className="pp-logo-mark" />
            <span className="pp-logo-text">
              REAKTIVO<span>.PRO</span>
            </span>
          </a>
          <div className="pp-header-actions">
            <a href="/" className="pp-back">
              ← На главную
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="pp-main">
        <article className="pp-article">
          <p className="pp-eyebrow">Документы</p>
          <h1 className="pp-h1">Политика обработки персональных данных</h1>
          <p className="pp-meta">
            Действует для сайта reaktivo.ru, reaktivo.pro и связанных сервисов Reaktivo.
            <br />
            Редакция от 04.09.2026.
          </p>

          <section>
            <h2>1. Оператор</h2>
            <p>
              Оператором персональных данных является общество с ограниченной ответственностью «СЭТ»
              (ООО «СЭТ»).
            </p>
            <ul>
              <li>ИНН 9710095927</li>
              <li>ОГРН 1227700089627</li>
              <li>
                Адрес: 125167, г. Москва, ВН.ТЕР.Г. муниципальный округ Аэропорт, проезд Новый Зыковский,
                д. 3, помещ. 19Ц
              </li>
              <li>
                E-mail: <a href="mailto:team@reaktivo.ru">team@reaktivo.ru</a>
              </li>
              <li>
                Телефон: <a href="tel:+78005551848">8 (800) 555-18-48</a>
              </li>
            </ul>
          </section>

          <section>
            <h2>2. Какие данные мы обрабатываем</h2>
            <p>В зависимости от сценария использования сервиса могут обрабатываться:</p>
            <ul>
              <li>имя (как к вам обращаться);</li>
              <li>номер телефона;</li>
              <li>адрес электронной почты (если вы его указали);</li>
              <li>сведения, необходимые для исполнения договора и требований законодательства о драгоценных металлах;</li>
              <li>технические данные обращения к сайту (IP-адрес, дата и время запроса, тип устройства и браузера) — в объёме, необходимом для работы сервиса и обеспечения безопасности.</li>
            </ul>
          </section>

          <section>
            <h2>3. Цели обработки</h2>
            <ul>
              <li>обработка заявок на консультацию и обратная связь;</li>
              <li>заключение и исполнение договоров, оказание услуг Reaktivo;</li>
              <li>идентификация пользователя в личном кабинете;</li>
              <li>исполнение обязанностей, установленных законодательством РФ;</li>
              <li>улучшение работы сайта и защита от злоупотреблений.</li>
            </ul>
          </section>

          <section>
            <h2>4. Правовые основания</h2>
            <p>
              Обработка осуществляется на основании согласия субъекта персональных данных (ст. 6, 9 Федерального
              закона № 152-ФЗ «О персональных данных»), а также когда обработка необходима для исполнения договора
              или возложенных на оператора обязанностей.
            </p>
          </section>

          <section>
            <h2>5. Как мы получаем согласие</h2>
            <p>
              На формах сайта, где собираются персональные данные (в том числе форма «Оставить заявку»),
              предусмотрено явное согласие — чекбокс, не отмеченный по умолчанию. Отправка формы без согласия
              невозможна. Ссылкой на настоящую Политику сопровождается текст согласия.
            </p>
          </section>

          <section>
            <h2>6. Передача третьим лицам и трансграничная передача</h2>
            <p>
              Мы не продаём персональные данные. Передача допускается только в случаях, предусмотренных законом,
              либо привлечённым исполнителям (хостинг, SMS, платёжные и иные сервисы), с которыми заключены
              договоры, обеспечивающие конфиденциальность и безопасность данных.
            </p>
            <p>
              На публичных страницах сайта используется сервис веб-аналитики «Яндекс Метрика» (ООО «ЯНДЕКС»).
              Счётчик собирает технические данные о посещении (cookie, IP-адрес, сведения о браузере и
              устройстве, действия на сайте) для статистики, улучшения сайта и оптимизации рекламы.
              Данные обрабатываются на территории РФ в соответствии с политикой Яндекса.
              Служебные разделы (панель сотрудников, кабинет клиента) счётчиком не покрываются.
            </p>
            <p>
              Шрифты и статические ресурсы сайта размещаются на собственных серверах оператора (без загрузки
              шрифтов с зарубежных CDN вроде Google Fonts). При использовании зарубежных инфраструктурных
              сервисов оператор соблюдает требования 152-ФЗ о трансграничной передаче, включая необходимые
              уведомления регулятору, если это требуется.
            </p>
          </section>

          <section>
            <h2>7. Сроки хранения</h2>
            <p>
              Данные хранятся не дольше, чем этого требуют цели обработки, договор и законодательство РФ,
              после чего уничтожаются или обезличиваются, если иное не предусмотрено законом.
            </p>
          </section>

          <section>
            <h2>8. Права субъекта персональных данных</h2>
            <p>Вы вправе запросить уточнение, блокирование или удаление своих данных, отозвать согласие
              (если обработка основана на согласии), а также получить информацию об обработке. Для этого
              напишите на <a href="mailto:team@reaktivo.ru">team@reaktivo.ru</a>.</p>
          </section>

          <section>
            <h2>9. Защита данных</h2>
            <p>
              Оператор принимает организационные и технические меры для защиты персональных данных от
              неправомерного доступа, изменения, раскрытия или уничтожения.
            </p>
          </section>

          <section>
            <h2>10. Изменения Политики</h2>
            <p>
              Актуальная версия всегда опубликована на этой странице. При существенных изменениях дата редакции
              обновляется.
            </p>
          </section>

          <p className="pp-note">
            Документ подготовлен как рабочий черновик для публикации на сайте. При необходимости текст
            уточняется юристом оператора.
          </p>
        </article>
      </main>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.pp-root {
  min-height: 100dvh;
  background: var(--bg-deep);
  background-image: var(--bg-gradient);
  color: var(--text);
  font-family: var(--font-ui);
  -webkit-font-smoothing: antialiased;
}
.pp-header {
  position: sticky; top: 0; z-index: 20;
  border-bottom: 1px solid var(--stroke-soft);
  background: color-mix(in srgb, var(--bg-panel-solid) 88%, transparent);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
}
.pp-header-inner {
  max-width: 820px; margin: 0 auto; padding: 14px 20px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
}
.pp-logo {
  display: inline-flex; align-items: center; gap: 10px;
  text-decoration: none; color: var(--text-strong);
  font-family: var(--font-brand); font-weight: 800; font-size: 1.05rem;
}
.pp-logo-mark { width: 36px; height: 36px; border-radius: 10px; }
.pp-logo-text > span { color: var(--accent); }
.pp-header-actions { display: flex; align-items: center; gap: 10px; }
.pp-back {
  display: inline-flex; align-items: center;
  padding: 8px 14px; border-radius: 12px;
  border: 1px solid var(--stroke); color: var(--text-strong);
  text-decoration: none; font-size: 0.86rem; font-weight: 600;
}
.pp-back:hover { border-color: var(--accent); color: var(--accent); }
.pp-main { padding: 40px 20px 72px; }
.pp-article {
  max-width: 820px; margin: 0 auto;
  background: var(--bg-panel-solid);
  border: 1px solid var(--stroke);
  border-radius: 22px;
  padding: clamp(24px, 4vw, 40px);
}
.pp-eyebrow {
  margin: 0 0 10px; font-size: 0.72rem; font-weight: 800;
  letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent);
}
.pp-h1 {
  margin: 0 0 12px; font-size: clamp(1.55rem, 3vw, 2rem);
  font-weight: 800; letter-spacing: -0.02em; color: var(--text-strong); line-height: 1.2;
}
.pp-meta { margin: 0 0 28px; font-size: 0.9rem; line-height: 1.55; color: var(--text-muted); }
.pp-article section { margin: 0 0 22px; }
.pp-article h2 {
  margin: 0 0 10px; font-size: 1.05rem; font-weight: 800; color: var(--text-strong);
}
.pp-article p, .pp-article li {
  font-size: 0.94rem; line-height: 1.65; color: var(--text-muted);
}
.pp-article p { margin: 0 0 10px; }
.pp-article ul { margin: 0 0 10px; padding-left: 1.2em; }
.pp-article a { color: var(--accent); font-weight: 600; }
.pp-note {
  margin: 28px 0 0; padding-top: 18px; border-top: 1px solid var(--stroke-soft);
  font-size: 0.82rem; color: var(--text-dim); line-height: 1.55;
}
@media (max-width: 560px) {
  .pp-back { padding: 8px 10px; font-size: 0.8rem; }
}
`;
