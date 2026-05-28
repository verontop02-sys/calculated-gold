import { useEffect, useMemo, useState } from 'react';
import { Clients } from './Clients.jsx';

/**
 * Двухколоночный layout для раздела «Клиенты»:
 * слева — список + карточка (как было), справа — сводка по выбранному клиенту
 * (или общая статистика, если никто не выбран).
 *
 * Связь с Clients.jsx через CustomEvent 'cg:clients-selection' — без перестройки
 * существующего state-машины компонента.
 */
export function ClientsPage({ formatMoney, toast }) {
  const [sel, setSel] = useState({ customer: null, deals: null, total: 0 });

  useEffect(() => {
    function onSel(e) {
      const d = e.detail || {};
      setSel({ customer: d.customer || null, deals: d.deals ?? null, total: d.total ?? 0 });
    }
    window.addEventListener('cg:clients-selection', onSel);
    return () => window.removeEventListener('cg:clients-selection', onSel);
  }, []);

  const stats = useMemo(() => {
    const deals = Array.isArray(sel.deals) ? sel.deals : [];
    if (!deals.length) return null;
    const totalSum = deals.reduce((s, d) => s + (Number(d.total_rub) || 0), 0);
    const avg = totalSum / deals.length;
    const lastIso = deals
      .map((d) => d.created_at)
      .filter(Boolean)
      .sort()
      .slice(-1)[0];
    const probesCount = new Map();
    for (const d of deals) {
      const p = d.first_probe != null ? String(d.first_probe) : null;
      if (!p) continue;
      probesCount.set(p, (probesCount.get(p) || 0) + 1);
    }
    const favProbe = [...probesCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    return { dealsCount: deals.length, totalSum, avg, lastIso, favProbe };
  }, [sel.deals]);

  return (
    <div className="cg-page">
      <div className="cg-page__main">
        <Clients formatMoney={formatMoney} toast={toast} />
      </div>

      <aside className="cg-page__side cg-stagger">
        {sel.customer ? (
          <>
            <div className="cg-side-card cg-side-card--accent">
              <div className="cg-side-card__label">Выбранный клиент</div>
              <div className="cg-side-card__title" style={{ marginTop: 4, fontSize: '1.05rem' }}>
                {sel.customer.full_name || '—'}
              </div>
              <div className="cg-side-card__sub" style={{ marginTop: 4 }}>
                {sel.customer.phone || sel.customer.phone_normalized || '—'}
              </div>
            </div>

            {stats ? (
              <div className="cg-side-card">
                <div className="cg-side-card__head">
                  <span className="cg-side-card__title">Сводка</span>
                </div>
                <div className="cg-side-card__stats">
                  <div className="cg-side-stat">
                    <span className="cg-side-stat__k">Сделок</span>
                    <span className="cg-side-stat__v">{stats.dealsCount}</span>
                  </div>
                  <div className="cg-side-stat">
                    <span className="cg-side-stat__k">Всего</span>
                    <span className="cg-side-stat__v tone-gold">{formatMoney(stats.totalSum)}</span>
                  </div>
                  <div className="cg-side-stat">
                    <span className="cg-side-stat__k">Средний чек</span>
                    <span className="cg-side-stat__v">{formatMoney(Math.round(stats.avg))}</span>
                  </div>
                  <div className="cg-side-stat">
                    <span className="cg-side-stat__k">Часто проба</span>
                    <span className="cg-side-stat__v">{stats.favProbe ? `${stats.favProbe}` : '—'}</span>
                  </div>
                </div>
                <div className="cg-side-card__rows" style={{ marginTop: 12 }}>
                  <div className="cg-side-row">
                    <span className="cg-side-row__k">Последняя сделка</span>
                    <span className="cg-side-row__v">{formatDateShort(stats.lastIso)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="cg-side-card">
                <div className="cg-side-card__title">У клиента пока нет сделок</div>
                <div className="cg-side-card__sub" style={{ marginTop: 8 }}>
                  Сделки появятся автоматически после скачивания PDF договора.
                </div>
              </div>
            )}

            <div className="cg-side-card cg-side-card--emerald cg-side-card--hint">
              <div className="cg-side-card__hint-icon" aria-hidden>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
              </div>
              <div>
                <div className="cg-side-card__title">Подсказка</div>
                <p className="cg-side-card__hint-text">
                  Скачивайте PDF из карточки сделки для печати, а кнопка «Удалить» убирает запись из учёта (восстановить нельзя).
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="cg-side-card cg-side-card--accent">
              <div className="cg-side-card__label">База клиентов</div>
              <div className="cg-side-card__value mono-nums" style={{ fontSize: '2rem' }}>
                {sel.total || 0}
              </div>
              <div className="cg-side-card__sub">
                Выберите клиента слева, чтобы увидеть его персональную сводку и историю сделок.
              </div>
            </div>

            <div className="cg-side-card cg-side-card--emerald cg-side-card--hint">
              <div className="cg-side-card__hint-icon" aria-hidden>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4-4" />
                </svg>
              </div>
              <div>
                <div className="cg-side-card__title">Как искать</div>
                <p className="cg-side-card__hint-text">
                  Введите фамилию, имя или телефон — поиск работает по любой части номера и ФИО, регистр не важен.
                </p>
              </div>
            </div>

            <div className="cg-side-card">
              <div className="cg-side-card__title">Откуда появляются клиенты</div>
              <p className="cg-side-card__hint-text" style={{ marginTop: 8 }}>
                Каждый клиент автоматически попадает в базу при скачивании PDF договора в разделе <b>Договор</b>. Дубли по телефону объединяются.
              </p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function formatDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
