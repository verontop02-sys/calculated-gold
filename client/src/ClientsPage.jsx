import { useEffect, useMemo, useState } from 'react';
import { Clients } from './Clients.jsx';
import { isSuperAdminRole } from './roles.js';

export function ClientsPage({ formatMoney, toast, user }) {
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
      .map((d) => d.created_at).filter(Boolean).sort().slice(-1)[0];
    const probesCount = new Map();
    for (const d of deals) {
      const p = d.first_probe != null ? String(d.first_probe) : null;
      if (!p) continue;
      probesCount.set(p, (probesCount.get(p) || 0) + 1);
    }
    // Частая проба — та, что встречается чаще всего
    const favProbe = [...probesCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const favCount = probesCount.get(favProbe) || 0;
    const favPct = deals.length > 0 ? Math.round((favCount / deals.length) * 100) : 0;
    return { dealsCount: deals.length, totalSum, avg, lastIso, favProbe, favCount, favPct };
  }, [sel.deals]);

  return (
    <div className="cg-page">
      <div className="cg-page__main">
        <Clients formatMoney={formatMoney} toast={toast} user={user} />
      </div>

      <aside className="cg-page__side cg-stagger">
        {sel.customer ? (
          <>
            {/* Итог по клиенту */}
            <div className="csp-card csp-card--accent">
              <div className="csp-card__label">Клиент выбран</div>
              <div className="csp-card__name">{sel.customer.full_name || '—'}</div>
              {sel.customer.phone && (
                <div className="csp-card__phone">{sel.customer.phone}</div>
              )}
            </div>

            {stats ? (
              <div className="csp-card">
                <div className="csp-card__title">Сводка</div>
                <div className="csp-rows">
                  <div className="csp-row">
                    <span className="csp-row__k">Сделок</span>
                    <span className="csp-row__v">{stats.dealsCount}</span>
                  </div>
                  <div className="csp-row">
                    <span className="csp-row__k">Всего</span>
                    <span className="csp-row__v csp-row__v--em">{formatMoney(Math.round(stats.totalSum))}</span>
                  </div>
                  <div className="csp-row">
                    <span className="csp-row__k">Средний чек</span>
                    <span className="csp-row__v">{formatMoney(Math.round(stats.avg))}</span>
                  </div>
                  {stats.favProbe && (
                    <div className="csp-row">
                      <span className="csp-row__k">Частая проба</span>
                      <span className="csp-row__v">
                        {stats.favProbe}
                        <span className="csp-row__sub"> · {stats.favPct}% сделок</span>
                      </span>
                    </div>
                  )}
                  <div className="csp-row">
                    <span className="csp-row__k">Последняя</span>
                    <span className="csp-row__v">{formatDateShort(stats.lastIso)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="csp-card">
                <div className="csp-card__title">Сделок нет</div>
                <p className="csp-hint-text">Сделки появятся после скачивания PDF договора с этим клиентом.</p>
              </div>
            )}

            <div className="csp-card csp-card--hint">
              <svg className="csp-hint-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
              </svg>
              <div>
                <div className="csp-card__title">Подсказка</div>
                <p className="csp-hint-text">
                  {isSuperAdminRole(user?.role)
                    ? '«Исправить» правит сумму и позиции на месте (PDF обновится). «Удалить» убирает запись из учёта — восстановить нельзя.'
                    : 'Договор можно открыть и скачать PDF. Исправить или удалить сделку может только супер-администратор — о неточности сообщите руководству сразу.'}
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="csp-card csp-card--accent">
              <div className="csp-card__label">База клиентов</div>
              <div className="csp-card__big mono-nums">{sel.total || 0}</div>
              <div className="csp-card__sub">Выберите клиента, чтобы увидеть сводку и историю сделок</div>
            </div>

            <div className="csp-card csp-card--hint">
              <svg className="csp-hint-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>
              </svg>
              <div>
                <div className="csp-card__title">Как искать</div>
                <p className="csp-hint-text">Введите фамилию, имя или телефон. Поиск работает по любой части номера и ФИО, регистр не важен.</p>
              </div>
            </div>

            <div className="csp-card">
              <div className="csp-card__title">Откуда клиенты</div>
              <p className="csp-hint-text" style={{ marginTop: 6 }}>
                Каждый клиент автоматически попадает в базу при скачивании PDF в разделе <strong>Договор</strong>. Дубли по телефону объединяются.
              </p>
            </div>
          </>
        )}
      </aside>

      <style>{`
        .csp-card {
          background: var(--bg-panel-solid);
          border: 1px solid var(--stroke-soft);
          border-radius: 18px;
          padding: 18px 16px;
          display: flex; flex-direction: column; gap: 0;
        }
        .csp-card--accent {
          background: linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 80%, #000) 100%);
          border-color: transparent; color: #fff;
        }
        .csp-card--hint { flex-direction: row; gap: 12px; align-items: flex-start; }
        .csp-hint-icon { flex-shrink: 0; margin-top: 2px; color: var(--emerald); }
        .csp-card--accent .csp-hint-icon { color: rgba(255,255,255,0.7); }
        .csp-card__label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; opacity: 0.75; margin-bottom: 6px; }
        .csp-card__name { font-size: 1.05rem; font-weight: 700; font-family: var(--font-display); line-height: 1.2; }
        .csp-card__phone { font-size: 0.82rem; margin-top: 4px; opacity: 0.8; }
        .csp-card__big { font-size: 2.4rem; font-weight: 800; letter-spacing: -0.04em; font-family: var(--font-display); line-height: 1; }
        .csp-card__sub { font-size: 0.78rem; margin-top: 8px; opacity: 0.75; line-height: 1.4; }
        .csp-card__title { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 10px; }
        .csp-hint-text { font-size: 0.78rem; color: var(--text-muted); line-height: 1.5; margin: 0; }
        .csp-rows { display: flex; flex-direction: column; gap: 8px; }
        .csp-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--stroke-soft); }
        .csp-row:last-child { border: none; }
        .csp-row__k { font-size: 0.8rem; color: var(--text-muted); }
        .csp-row__v { font-size: 0.88rem; font-weight: 600; text-align: right; }
        .csp-row__v--em { color: var(--accent); }
        .csp-row__sub { font-size: 0.72rem; color: var(--text-muted); font-weight: 400; }
      `}</style>
    </div>
  );
}

function formatDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
