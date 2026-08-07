import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const STATUS_TABS = [
  { key: '', label: 'Все' },
  { key: 'pending_review', label: 'На проверке' },
  { key: 'approved', label: 'Подтверждены' },
  { key: 'new', label: 'Новые' },
  { key: 'rejected', label: 'Отклонены' },
  { key: 'blocked', label: 'Блокированы' },
];

const STATUS_LABEL = {
  new: 'Новый',
  pending_review: 'На проверке',
  approved: 'Подтверждён',
  rejected: 'Отклонён',
  blocked: 'Блокирован',
};

const DOC_LABEL = {
  passport_main: 'Паспорт (разворот)',
  passport_registration: 'Паспорт (регистрация)',
  selfie: 'Селфи с паспортом',
};

const ENTRY_LABEL = {
  deposit_rub: 'Пополнение',
  withdraw_rub: 'Вывод',
  buy_gold: 'Покупка золота',
  sell_gold: 'Продажа золота',
  fee: 'Комиссия',
  correction: 'Корректировка',
};

const WITHDRAWAL_STATUS_TABS = [
  { key: 'pending', label: 'На модерации' },
  { key: 'approved', label: 'В обработке' },
  { key: 'paid', label: 'Выплачены' },
  { key: 'rejected', label: 'Отклонены' },
  { key: '', label: 'Все' },
];

const WITHDRAWAL_STATUS_LABEL = {
  pending: 'На модерации',
  approved: 'В обработке',
  paid: 'Выплачено',
  rejected: 'Отклонена',
};

const SETTINGS_FIELDS = [
  { key: 'buyFeePercent', label: 'Комиссия покупки, %', hint: 'Закладывается в курс при покупке золота клиентом' },
  { key: 'sellFeePercent', label: 'Комиссия продажи, %', hint: 'Удерживается при продаже золота клиентом' },
  { key: 'minPurchaseGrams', label: 'Минимальная покупка, г', hint: 'Порог входа для новой покупки' },
  { key: 'minSellGrams', label: 'Минимальная продажа, г', hint: 'Порог для продажи золота на баланс' },
  { key: 'withdrawFeePercent', label: 'Комиссия вывода, %', hint: 'Удерживается при выводе рублей клиенту' },
  { key: 'minWithdrawRub', label: 'Минимальный вывод, ₽', hint: 'Порог для заявки на вывод средств' },
];

function formatMoneyRub(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(n));
}
function formatGrams(n) {
  if (n == null || !Number.isFinite(Number(n))) return '0.0000 г';
  return `${Number(n).toFixed(4)} г`;
}
function formatGramsShort(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `${Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} г`;
}
function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * Раздел «Биржа» для админов: дашборд со сводкой (по умолчанию — правка Руслана)
 * и модерация клиентов: KYC, статус, ручное пополнение, удаление (супер-админ).
 */
export function FintechAdminPage({ toast, isSuperAdmin = false, initialView }) {
  const [view, setView] = useState(initialView === 'clients' ? 'clients' : 'dashboard'); // dashboard | clients
  const [status, setStatus] = useState('pending_review');
  const [q, setQ] = useState('');
  const [clients, setClients] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const out = await api.fintechAdminClients({ status: status || undefined, q: q || undefined, limit: 100 });
      setClients(out.clients || []);
      setTotal(out.total || 0);
    } catch (e) {
      setErr(e?.message || 'Не удалось загрузить список клиентов');
    } finally {
      setLoading(false);
    }
  }, [status, q]);

  useEffect(() => { load(); }, [load]);

  const openClients = useCallback((statusKey) => {
    setView('clients');
    if (statusKey !== undefined) setStatus(statusKey);
  }, []);

  return (
    <div className="cg-page">
      <div className="cg-page__main">
        <div className="fea-view-tabs">
          <button
            type="button"
            className={`fea-view-tab${view === 'dashboard' ? ' fea-view-tab--on' : ''}`}
            onClick={() => setView('dashboard')}
          >
            Дашборд
          </button>
          <button
            type="button"
            className={`fea-view-tab${view === 'clients' ? ' fea-view-tab--on' : ''}`}
            onClick={() => setView('clients')}
          >
            Клиенты
          </button>
          <button
            type="button"
            className={`fea-view-tab${view === 'withdrawals' ? ' fea-view-tab--on' : ''}`}
            onClick={() => setView('withdrawals')}
          >
            Выводы
          </button>
          <button
            type="button"
            className={`fea-view-tab${view === 'settings' ? ' fea-view-tab--on' : ''}`}
            onClick={() => setView('settings')}
          >
            Настройки
          </button>
        </div>

        {view === 'dashboard' && <ExchangeDashboard onOpenClients={openClients} />}
        {view === 'withdrawals' && <WithdrawalsPanel toast={toast} />}
        {view === 'settings' && <SettingsPanelFintech toast={toast} />}

        {view === 'clients' && (
          <div className="fea-card">
            <div className="fea-head">
              <h2 className="fea-title">Клиенты биржи</h2>
              <input
                className="fea-search"
                placeholder="Поиск по имени, телефону, email…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="fea-tabs">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.key || 'all'}
                  type="button"
                  className={`fea-tab${status === t.key ? ' fea-tab--on' : ''}`}
                  onClick={() => setStatus(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {loading && <div className="fea-empty"><span className="fea-spinner" /> Загрузка…</div>}
            {err && !loading && <div className="fea-empty fea-err">{err}</div>}
            {!loading && !err && clients.length === 0 && <div className="fea-empty">Клиентов не найдено</div>}

            {!loading && clients.length > 0 && (
              <div className="fea-table-wrap">
                <table className="fea-table">
                  <thead>
                    <tr>
                      <th>Клиент</th>
                      <th>Телефон</th>
                      <th>Статус</th>
                      <th className="num">Баланс, ₽</th>
                      <th className="num">Золото, г</th>
                      <th>Регистрация</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c) => (
                      <tr
                        key={c.id}
                        className={`fea-row${selectedId === c.id ? ' fea-row--on' : ''}`}
                        onClick={() => setSelectedId(c.id)}
                      >
                        <td>{c.fullName || <span className="fea-muted">Без имени</span>}</td>
                        <td className="mono-nums">+7 {c.phone}</td>
                        <td><StatusBadge status={c.status} /></td>
                        <td className="num mono-nums">{formatMoneyRub(c.rubBalance)}</td>
                        <td className="num mono-nums">{formatGrams(c.goldGrams)}</td>
                        <td className="fea-muted">{formatDateTime(c.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {(view === 'dashboard' || view === 'clients') && (
        <aside className="cg-page__side cg-stagger">
          {selectedId && view === 'clients' ? (
            <ClientDetailPanel
              clientId={selectedId}
              toast={toast}
              isSuperAdmin={isSuperAdmin}
              onChanged={() => { load(); }}
              onDeleted={() => { setSelectedId(null); load(); }}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div className="fea-card fea-card--accent">
              <div className="fea-side-label">{view === 'dashboard' ? `${STATUS_LABEL[status] || 'Клиенты'} · в списке` : 'Клиенты в списке'}</div>
              <div className="fea-side-big mono-nums">{total}</div>
              <div className="fea-side-sub">
                {view === 'dashboard'
                  ? 'Сводка по бирже: объём золота у клиентов, обороты и статусы. Вкладка «Клиенты» — проверка документов.'
                  : 'Выберите клиента в списке, чтобы проверить документы и управлять балансом'}
              </div>
            </div>
          )}
        </aside>
      )}

      <style>{CSS}</style>
    </div>
  );
}

/** Дашборд биржи: общий объём золота в весе и деньгах, обороты, статусы клиентов. */
function ExchangeDashboard({ onOpenClients }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const out = await api.fintechAdminSummary();
      setData(out);
    } catch (e) {
      setErr(e?.message || 'Не удалось загрузить сводку');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="fea-card fea-empty"><span className="fea-spinner" /> Загружаем сводку биржи…</div>;
  if (err) {
    return (
      <div className="fea-card fea-empty fea-err">
        {err}
        <button type="button" className="fea-btn-sm" onClick={load} style={{ marginLeft: 10 }}>Повторить</button>
      </div>
    );
  }
  if (!data) return null;

  const bal = data.balances || {};
  const all = data.allTime || {};
  const byStatus = data.clients?.byStatus || {};

  const statusCards = [
    { key: 'pending_review', hint: 'ждут проверки' },
    { key: 'approved', hint: 'работают' },
    { key: 'new', hint: 'не завершили KYC' },
    { key: 'rejected', hint: 'отклонены' },
    { key: 'blocked', hint: 'в блоке' },
  ];

  return (
    <>
      <div className="fea-dash-grid">
        <div className="fea-dash-card fea-dash-card--gold">
          <span className="fea-dash-label">Золото у клиентов</span>
          <span className="fea-dash-value mono-nums">{formatGramsShort(bal.totalGoldGrams)}</span>
          <span className="fea-dash-sub mono-nums">
            {bal.goldValueRub != null ? `${formatMoneyRub(bal.goldValueRub)} по курсу ${formatMoneyRub(bal.ratePerGram)}/г` : 'курс недоступен'}
          </span>
        </div>
        <div className="fea-dash-card">
          <span className="fea-dash-label">Рублёвые балансы</span>
          <span className="fea-dash-value mono-nums">{formatMoneyRub(bal.totalRubBalance)}</span>
          <span className="fea-dash-sub">свободные деньги клиентов</span>
        </div>
        <div className="fea-dash-card">
          <span className="fea-dash-label">Продано золота</span>
          <span className="fea-dash-value mono-nums">{formatGramsShort(all.soldGrams)}</span>
          <span className="fea-dash-sub mono-nums">{formatMoneyRub(all.soldRub)} за всё время</span>
        </div>
        <div className="fea-dash-card">
          <span className="fea-dash-label">Выкуплено обратно</span>
          <span className="fea-dash-value mono-nums">{formatGramsShort(all.boughtBackGrams)}</span>
          <span className="fea-dash-sub mono-nums">{formatMoneyRub(all.boughtBackRub)} выплачено на балансы</span>
        </div>
        <div className="fea-dash-card">
          <span className="fea-dash-label">Пополнения</span>
          <span className="fea-dash-value mono-nums">{formatMoneyRub(all.depositsRub)}</span>
          <span className="fea-dash-sub">зачислено модераторами</span>
        </div>
        <div className="fea-dash-card fea-dash-card--fee">
          <span className="fea-dash-label">Комиссии заработано</span>
          <span className="fea-dash-value mono-nums">{formatMoneyRub(all.feesRub)}</span>
          <span className="fea-dash-sub mono-nums">{(all.opsCount ?? 0).toLocaleString('ru-RU')} операций всего</span>
        </div>
      </div>

      <div className="fea-card">
        <div className="fea-head" style={{ marginBottom: 10 }}>
          <h2 className="fea-title">Статусы аккаунтов</h2>
          <button type="button" className="fea-btn-sm" onClick={() => onOpenClients?.('')}>Все клиенты · {data.clients?.total ?? 0}</button>
        </div>
        <div className="fea-status-grid">
          {statusCards.map((s) => (
            <button key={s.key} type="button" className="fea-status-card" onClick={() => onOpenClients?.(s.key)}>
              <span className={`fea-dot fea-dot--${s.key}`} aria-hidden />
              <span className="fea-status-num mono-nums">{byStatus[s.key] ?? 0}</span>
              <span className="fea-status-name">{STATUS_LABEL[s.key]}</span>
              <span className="fea-status-hint">{s.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** Заявки на вывод средств — пока без A7/ПСБ выплата ручная, но заявки настоящие. */
function WithdrawalsPanel({ toast }) {
  const [status, setStatus] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const out = await api.fintechAdminWithdrawals(status || undefined);
      setRequests(out.requests || []);
      setTotal(out.total || 0);
    } catch (e) {
      setErr(e?.message || 'Не удалось загрузить заявки на вывод');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  async function decide(id, decision) {
    const reason = decision === 'rejected' ? window.prompt('Причина отклонения заявки:', '') : null;
    if (decision === 'rejected' && reason == null) return;
    if (decision === 'rejected' && !reason.trim()) {
      toast?.('Укажите причину отклонения', 'error');
      return;
    }
    setBusyId(id);
    try {
      await api.fintechAdminDecideWithdrawal(id, decision, reason || undefined);
      toast?.(decision === 'rejected' ? 'Заявка отклонена, деньги вернулись клиенту' : decision === 'paid' ? 'Заявка отмечена оплаченной' : 'Заявка принята в обработку', 'success');
      await load();
    } catch (e) {
      toast?.(e?.message || 'Ошибка', 'error');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="fea-card">
      <div className="fea-head">
        <h2 className="fea-title">Заявки на вывод · {total}</h2>
      </div>
      <div className="fea-tabs">
        {WITHDRAWAL_STATUS_TABS.map((t) => (
          <button
            key={t.key || 'all'}
            type="button"
            className={`fea-tab${status === t.key ? ' fea-tab--on' : ''}`}
            onClick={() => setStatus(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="fea-empty"><span className="fea-spinner" /> Загрузка…</div>}
      {err && !loading && <div className="fea-empty fea-err">{err}</div>}
      {!loading && !err && requests.length === 0 && <div className="fea-empty">Заявок нет</div>}

      {!loading && requests.length > 0 && (
        <div className="fea-docs">
          {requests.map((r) => (
            <div key={r.id} className="fea-doc-row" style={{ alignItems: 'flex-start' }}>
              <div className="fea-doc-main">
                <span style={{ fontWeight: 700 }}>
                  {r.client?.fullName || 'Без имени'} · +7 {r.client?.phone}
                </span>
                <span className="mono-nums">
                  {formatMoneyRub(r.rubAmount)}{r.feeRub ? ` (комиссия ${formatMoneyRub(r.feeRub)}, к выплате ${formatMoneyRub(r.netRub)})` : ''}
                </span>
                <span className="fea-muted">{r.payoutDetails}</span>
                <span className="fea-muted">{formatDateTime(r.createdAt)}</span>
                {r.status === 'rejected' && r.rejectReason && <span style={{ color: 'var(--crimson)', fontSize: '0.8rem' }}>{r.rejectReason}</span>}
                <span className={`fea-badge fea-badge--${r.status}`} style={{ marginTop: 4 }}>{WITHDRAWAL_STATUS_LABEL[r.status] || r.status}</span>
              </div>
              {(r.status === 'pending' || r.status === 'approved') && (
                <div className="fea-doc-actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  {r.status === 'pending' && (
                    <button type="button" className="fea-btn-sm fea-btn-sm--ok" disabled={busyId === r.id} onClick={() => decide(r.id, 'approved')}>
                      В обработку
                    </button>
                  )}
                  <button type="button" className="fea-btn-sm fea-btn-sm--ok" disabled={busyId === r.id} onClick={() => decide(r.id, 'paid')}>
                    Отметить оплаченной
                  </button>
                  <button type="button" className="fea-btn-sm fea-btn-sm--bad" disabled={busyId === r.id} onClick={() => decide(r.id, 'rejected')}>
                    Отклонить
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Комиссии и лимиты биржи — раньше правились только в базе, теперь из админки. */
function SettingsPanelFintech({ toast }) {
  const [values, setValues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const out = await api.fintechAdminSettings();
      setValues(out);
    } catch (e) {
      setErr(e?.message || 'Не удалось загрузить настройки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function setField(key, v) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const patch = {};
      for (const f of SETTINGS_FIELDS) {
        const v = Number(String(values[f.key]).replace(',', '.'));
        if (!Number.isFinite(v) || v < 0) {
          toast?.(`Некорректное значение: ${f.label}`, 'error');
          setSaving(false);
          return;
        }
        patch[f.key] = v;
      }
      const out = await api.fintechAdminUpdateSettings(patch);
      setValues(out);
      toast?.('Настройки сохранены', 'success');
    } catch (e2) {
      toast?.(e2?.message || 'Не удалось сохранить настройки', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="fea-card fea-empty"><span className="fea-spinner" /> Загрузка…</div>;
  if (err) return <div className="fea-card fea-empty fea-err">{err}</div>;
  if (!values) return null;

  return (
    <div className="fea-card">
      <div className="fea-head">
        <h2 className="fea-title">Комиссии и лимиты биржи</h2>
      </div>
      <p className="fea-muted" style={{ margin: '0 0 14px' }}>
        Применяются сразу ко всем новым сделкам и заявкам на вывод. Источник курса золота — тот же, что у калькулятора скупки.
      </p>
      <form onSubmit={save} className="fea-settings-form">
        {SETTINGS_FIELDS.map((f) => (
          <label key={f.key} className="fea-settings-field">
            <span className="fea-settings-label">{f.label}</span>
            <input
              className="fea-input"
              inputMode="decimal"
              value={values[f.key] ?? ''}
              onChange={(e) => setField(f.key, e.target.value)}
            />
            <span className="fea-muted" style={{ fontSize: '0.74rem' }}>{f.hint}</span>
          </label>
        ))}
        <button type="submit" className="fea-btn" disabled={saving} style={{ maxWidth: 220 }}>
          {saving ? 'Сохраняем…' : 'Сохранить настройки'}
        </button>
      </form>
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`fea-badge fea-badge--${status}`}>
      <span className={`fea-dot fea-dot--${status}`} aria-hidden />
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function ClientDetailPanel({ clientId, toast, isSuperAdmin = false, onChanged, onDeleted, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyDoc, setBusyDoc] = useState('');
  const [busyDecision, setBusyDecision] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [topupAmount, setTopupAmount] = useState('');
  const [topupComment, setTopupComment] = useState('');
  const [topupBusy, setTopupBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [docPreview, setDocPreview] = useState(null); // { url, label, isPdf }

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const out = await api.fintechAdminClientDetail(clientId);
      setDetail(out);
    } catch (e) {
      setErr(e?.message || 'Не удалось загрузить клиента');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  async function viewDoc(docId, label) {
    try {
      const out = await api.fintechAdminDocSignedUrl(docId);
      if (!out.url) return;
      // Просмотр в окне на странице; PDF браузер показывает через iframe.
      const isPdf = /\.pdf(\?|$)/i.test(out.url);
      setDocPreview({ url: out.url, label: label || 'Документ', isPdf });
    } catch (e) {
      toast?.(e?.message || 'Не удалось открыть документ', 'error');
    }
  }

  async function reviewDoc(docId, decision) {
    setBusyDoc(docId);
    try {
      const reason = decision === 'rejected' ? window.prompt('Причина отклонения документа:', '') : null;
      if (decision === 'rejected' && reason == null) { setBusyDoc(''); return; }
      await api.fintechAdminReviewDoc(docId, decision, reason || undefined);
      await load();
      toast?.('Документ обновлён', 'success');
    } catch (e) {
      toast?.(e?.message || 'Ошибка', 'error');
    } finally {
      setBusyDoc('');
    }
  }

  async function decideClient(decision) {
    if (decision !== 'approved' && !rejectReason.trim()) {
      toast?.('Укажите причину', 'error');
      return;
    }
    setBusyDecision(true);
    try {
      await api.fintechAdminDecideClient(clientId, decision, rejectReason.trim() || undefined);
      setRejectReason('');
      await load();
      onChanged?.();
      toast?.('Статус клиента обновлён', 'success');
    } catch (e) {
      toast?.(e?.message || 'Ошибка', 'error');
    } finally {
      setBusyDecision(false);
    }
  }

  async function deleteClient() {
    const name = detail?.fullName || `+7 ${detail?.phone || ''}`;
    const hasAssets = Number(detail?.portfolio?.goldGrams) > 0 || Number(detail?.portfolio?.rubBalance) > 0;
    const warn = hasAssets
      ? '\n\nВНИМАНИЕ: у клиента ненулевой баланс — журнал и балансы будут удалены безвозвратно.'
      : '';
    const answer = window.prompt(
      `Удалить клиента «${name}» полностью?\nЖурнал операций, балансы и KYC-документы будут стёрты.${warn}\n\nВведите УДАЛИТЬ для подтверждения:`,
      '',
    );
    if (answer == null) return;
    if (answer.trim().toUpperCase() !== 'УДАЛИТЬ') {
      toast?.('Удаление отменено — подтверждение не совпало', 'info');
      return;
    }
    setDeleteBusy(true);
    try {
      await api.fintechAdminDeleteClient(clientId);
      toast?.('Клиент удалён', 'success');
      onDeleted?.();
    } catch (e) {
      toast?.(e?.message || 'Не удалось удалить клиента', 'error');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function submitTopup(e) {
    e.preventDefault();
    const v = parseFloat(String(topupAmount).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      toast?.('Укажите сумму пополнения', 'error');
      return;
    }
    if (!topupComment.trim()) {
      toast?.('Укажите комментарий (номер платежа)', 'error');
      return;
    }
    setTopupBusy(true);
    try {
      await api.fintechAdminTopup(clientId, v, topupComment.trim());
      setTopupAmount('');
      setTopupComment('');
      await load();
      onChanged?.();
      toast?.('Баланс пополнен', 'success');
    } catch (e) {
      toast?.(e?.message || 'Ошибка', 'error');
    } finally {
      setTopupBusy(false);
    }
  }

  if (loading) return <div className="fea-card fea-empty"><span className="fea-spinner" /> Загрузка…</div>;
  if (err) return <div className="fea-card fea-empty fea-err">{err}</div>;
  if (!detail) return null;

  return (
    <>
      <div className="fea-card fea-card--accent">
        <button type="button" className="fea-close" onClick={onClose} aria-label="Закрыть">✕</button>
        <div className="fea-side-label">Клиент</div>
        <div className="fea-client-name">{detail.fullName || 'Без имени'}</div>
        <div className="fea-client-meta">+7 {detail.phone} {detail.email ? `· ${detail.email}` : ''}</div>
        <StatusBadge status={detail.status} />
        {detail.rejectReason && <p className="fea-reject-note">{detail.rejectReason}</p>}
      </div>

      <div className="fea-card">
        <div className="fea-card__title">Портфель</div>
        <div className="fea-rows">
          <div className="fea-row-kv"><span>Рублёвый баланс</span><span className="mono-nums">{formatMoneyRub(detail.portfolio?.rubBalance)}</span></div>
          <div className="fea-row-kv"><span>Золото</span><span className="mono-nums">{formatGrams(detail.portfolio?.goldGrams)}</span></div>
          <div className="fea-row-kv"><span>Стоимость портфеля</span><span className="mono-nums">{formatMoneyRub(detail.portfolio?.marketValueRub)}</span></div>
          <div className="fea-row-kv"><span>Вложено</span><span className="mono-nums">{formatMoneyRub(detail.portfolio?.investedRub)}</span></div>
        </div>
      </div>

      <div className="fea-card">
        <div className="fea-card__title">Документы</div>
        <p className="fea-muted" style={{ margin: '0 0 12px' }}>
          Нажмите на превью или «Открыть», чтобы увеличить фото для проверки.
        </p>
        <div className="fea-docs">
          {(detail.documents || []).length === 0 && <p className="fea-muted">Документы не загружены</p>}
          {(detail.documents || []).map((d) => (
            <KycDocCard
              key={d.id}
              doc={d}
              busy={busyDoc === d.id}
              onView={() => viewDoc(d.id, DOC_LABEL[d.docType] || d.docType)}
              onApprove={() => reviewDoc(d.id, 'approved')}
              onReject={() => reviewDoc(d.id, 'rejected')}
            />
          ))}
        </div>
      </div>

      {detail.status !== 'approved' && detail.status !== 'blocked' && (
        <div className="fea-card">
          <div className="fea-card__title">Решение по клиенту</div>
          <textarea
            className="fea-textarea"
            placeholder="Причина отклонения (для «Отклонить»)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="fea-decision-actions">
            <button type="button" className="fea-btn fea-btn--ok" disabled={busyDecision} onClick={() => decideClient('approved')}>Подтвердить</button>
            <button type="button" className="fea-btn fea-btn--bad" disabled={busyDecision} onClick={() => decideClient('rejected')}>Отклонить</button>
          </div>
        </div>
      )}

      {detail.status === 'approved' && (
        <div className="fea-card">
          <div className="fea-card__title">Блокировка</div>
          <textarea className="fea-textarea" placeholder="Причина блокировки" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <button type="button" className="fea-btn fea-btn--bad" disabled={busyDecision} onClick={() => decideClient('blocked')}>Заблокировать клиента</button>
        </div>
      )}

      {detail.status === 'blocked' && (
        <div className="fea-card">
          <div className="fea-card__title">Разблокировка</div>
          <p className="fea-muted" style={{ margin: '0 0 10px' }}>
            Клиент заблокирован{detail.rejectReason ? `: ${detail.rejectReason}` : ''}. Разблокировка вернёт статус «Подтверждён» и доступ к покупке золота.
          </p>
          <button type="button" className="fea-btn fea-btn--ok" disabled={busyDecision} onClick={() => decideClient('approved')}>
            Разблокировать клиента
          </button>
        </div>
      )}

      <div className="fea-card">
        <div className="fea-card__title">Ручное пополнение</div>
        <form onSubmit={submitTopup} className="fea-topup-form">
          <input
            className="fea-input"
            inputMode="decimal"
            placeholder="Сумма, ₽"
            value={topupAmount}
            onChange={(e) => setTopupAmount(e.target.value)}
          />
          <input
            className="fea-input"
            placeholder="Комментарий (номер платежа)"
            value={topupComment}
            onChange={(e) => setTopupComment(e.target.value)}
          />
          <button type="submit" className="fea-btn" disabled={topupBusy}>{topupBusy ? 'Пополняем…' : 'Пополнить'}</button>
        </form>
      </div>

      <div className="fea-card">
        <div className="fea-card__title">История операций</div>
        {(detail.ledger || []).length === 0 && <p className="fea-muted">Операций пока нет</p>}
        {(detail.ledger || []).map((e) => (
          <div key={e.id} className="fea-ledger-row">
            <div>
              <div className="fea-ledger-type">{ENTRY_LABEL[e.entryType] || e.entryType}</div>
              <div className="fea-muted">{formatDateTime(e.createdAt)}</div>
            </div>
            <div className="fea-ledger-nums">
              {!!e.rubDelta && <span className={e.rubDelta > 0 ? 'fea-pos' : 'fea-neg'}>{e.rubDelta > 0 ? '+' : ''}{formatMoneyRub(e.rubDelta)}</span>}
              {!!e.goldGramsDelta && <span className={e.goldGramsDelta > 0 ? 'fea-pos' : 'fea-neg'}>{e.goldGramsDelta > 0 ? '+' : ''}{formatGrams(e.goldGramsDelta)}</span>}
            </div>
          </div>
        ))}
      </div>

      {isSuperAdmin && (
        <div className="fea-card fea-card--danger">
          <div className="fea-card__title">Опасная зона</div>
          <p className="fea-muted" style={{ margin: '0 0 10px' }}>
            Полное удаление клиента: журнал операций, балансы и KYC-документы будут стёрты безвозвратно.
          </p>
          <button type="button" className="fea-btn fea-btn--bad" disabled={deleteBusy} onClick={deleteClient}>
            {deleteBusy ? 'Удаляем…' : 'Удалить клиента'}
          </button>
        </div>
      )}

      {docPreview && <DocPreviewModal preview={docPreview} onClose={() => setDocPreview(null)} />}
    </>
  );
}

/** Карточка KYC-документа с превью фото для проверки. */
function KycDocCard({ doc, busy, onView, onApprove, onReject }) {
  const [thumb, setThumb] = useState(null);
  const label = DOC_LABEL[doc.docType] || doc.docType;

  useEffect(() => {
    let cancelled = false;
    api.fintechAdminDocSignedUrl(doc.id)
      .then((out) => {
        if (cancelled || !out?.url) return;
        const isPdf = /\.pdf(\?|$)/i.test(out.url);
        setThumb({ url: out.url, isPdf });
      })
      .catch(() => { /* превью не критично — останется кнопка Открыть */ });
    return () => { cancelled = true; };
  }, [doc.id]);

  return (
    <div className="fea-doc-card">
      <button type="button" className="fea-doc-thumb" onClick={onView} title="Открыть для проверки">
        {thumb?.url && !thumb.isPdf ? (
          <img src={thumb.url} alt={label} />
        ) : (
          <span className="fea-doc-thumb-ph">{thumb?.isPdf ? 'PDF' : '…'}</span>
        )}
      </button>
      <div className="fea-doc-card-main">
        <div className="fea-doc-main">
          <span>{label}</span>
          <span className={`fea-badge fea-badge--${doc.status}`}>
            {doc.status === 'approved' ? 'Одобрено' : doc.status === 'rejected' ? 'Отклонено' : 'На проверке'}
          </span>
        </div>
        <div className="fea-doc-actions">
          <button type="button" className="fea-btn-sm" onClick={onView}>Открыть</button>
          {doc.status !== 'approved' && (
            <button type="button" className="fea-btn-sm fea-btn-sm--ok" disabled={busy} onClick={onApprove}>Одобрить</button>
          )}
          {doc.status !== 'rejected' && (
            <button type="button" className="fea-btn-sm fea-btn-sm--bad" disabled={busy} onClick={onReject}>Отклонить</button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Просмотр KYC-документа в окне поверх страницы (Ruslan: «окошечко на странице»). */
function DocPreviewModal({ preview, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fea-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={preview.label}>
      <div className="fea-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fea-modal-head">
          <span className="fea-modal-title">{preview.label}</span>
          <div className="fea-modal-head-actions">
            <a className="fea-btn-sm" href={preview.url} target="_blank" rel="noopener noreferrer">В новой вкладке</a>
            <button type="button" className="fea-btn-sm" onClick={onClose}>Закрыть ✕</button>
          </div>
        </div>
        <div className="fea-modal-body">
          {preview.isPdf ? (
            <iframe src={preview.url} title={preview.label} className="fea-modal-frame" />
          ) : (
            <img src={preview.url} alt={preview.label} className="fea-modal-img" />
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.fea-card {
  background: var(--bg-panel-solid); border: 1px solid var(--stroke-soft); border-radius: 16px;
  padding: 18px; margin-bottom: 14px; position: relative;
}
.fea-card--accent { background: linear-gradient(160deg, var(--accent-soft), transparent); border-color: var(--accent-soft); }
.fea-card--danger { border-color: color-mix(in srgb, var(--crimson) 35%, transparent); }
.fea-card__title { font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 12px; }

/* ── Переключатель Дашборд / Клиенты ── */
.fea-view-tabs { display: flex; gap: 6px; margin-bottom: 14px; }
.fea-view-tab {
  padding: 9px 18px; border-radius: 10px; border: 1px solid var(--stroke-soft);
  background: var(--bg-panel-solid); color: var(--text-muted);
  font-size: 0.86rem; font-weight: 700; cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.fea-view-tab--on { background: var(--accent-soft); border-color: var(--accent); color: var(--text-strong); }

/* ── Дашборд биржи ── */
.fea-dash-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
@media (max-width: 1100px) { .fea-dash-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .fea-dash-grid { grid-template-columns: 1fr; } }
.fea-dash-card {
  position: relative; overflow: hidden;
  background: var(--bg-panel-solid); border: 1px solid var(--stroke-soft); border-radius: 16px;
  padding: 16px 18px; display: flex; flex-direction: column; gap: 4px;
}
.fea-dash-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--accent), transparent);
  opacity: 0.75;
}
.fea-dash-card--gold {
  background: linear-gradient(150deg, var(--accent-soft), transparent 65%);
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
}
.fea-dash-card--gold .fea-dash-value { color: var(--text-strong); }
.fea-dash-card--fee::before { background: linear-gradient(90deg, var(--emerald), transparent); }
.fea-dash-label { font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); }
.fea-dash-value { font-size: 1.5rem; font-weight: 800; color: var(--text-strong); letter-spacing: -0.02em; white-space: nowrap; }
.fea-dash-sub { font-size: 0.76rem; color: var(--text-muted); }

/* ── Статусы аккаунтов (наглядно) ── */
.fea-status-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 1100px) { .fea-status-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 560px) { .fea-status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.fea-status-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: 12px 14px; border-radius: 12px; border: 1px solid var(--stroke-soft);
  background: var(--surface); cursor: pointer; text-align: left;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
}
.fea-status-card:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,0.10); }
.fea-status-num { font-size: 1.35rem; font-weight: 800; color: var(--text-strong); }
.fea-status-name { font-size: 0.78rem; font-weight: 700; color: var(--text); }
.fea-status-hint { font-size: 0.68rem; color: var(--text-dim); }

.fea-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.fea-dot--new { background: #8e949c; }
.fea-dot--pending_review { background: #f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,0.18); }
.fea-dot--approved { background: var(--emerald); box-shadow: 0 0 0 3px color-mix(in srgb, var(--emerald) 20%, transparent); }
.fea-dot--rejected { background: var(--crimson); }
.fea-dot--blocked { background: var(--crimson); box-shadow: 0 0 0 3px color-mix(in srgb, var(--crimson) 20%, transparent); }

.fea-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.fea-title { font-size: 1.15rem; font-weight: 700; margin: 0; color: var(--text-strong); }
.fea-search { flex: 1; min-width: 220px; max-width: 320px; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--stroke); background: var(--input-bg, transparent); color: var(--text); font-size: 0.88rem; outline: none; }

.fea-tabs { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
.fea-tab { padding: 8px 14px; border-radius: 9px; border: 1px solid var(--stroke-soft); background: transparent; color: var(--text-muted); font-size: 0.82rem; font-weight: 600; cursor: pointer; }
.fea-tab--on { background: var(--accent-soft); border-color: var(--accent); color: var(--text-strong); }

.fea-empty { text-align: center; padding: 32px; color: var(--text-muted); display: flex; align-items: center; justify-content: center; gap: 8px; }
.fea-err { color: var(--crimson); }
.fea-muted { color: var(--text-dim); font-size: 0.82rem; }

.fea-table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid var(--stroke-soft); }
.fea-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.86rem; }
.fea-table thead th { text-align: left; padding: 10px 14px; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); border-bottom: 1px solid var(--stroke-strong); background: var(--surface); white-space: nowrap; }
.fea-table thead th.num { text-align: right; }
.fea-table tbody td { padding: 10px 14px; border-bottom: 1px solid var(--stroke-soft); color: var(--text); white-space: nowrap; }
.fea-table tbody td.num { text-align: right; }
.fea-row { cursor: pointer; transition: background 0.14s; }
.fea-row:hover { background: var(--surface); }
.fea-row--on { background: var(--accent-soft); }

.fea-badge { font-size: 0.68rem; font-weight: 700; padding: 3px 9px; border-radius: 999px; display: inline-flex; align-items: center; gap: 5px; }
.fea-badge--new { background: rgba(142,148,156,0.16); color: var(--text-muted); }
.fea-badge--pending_review, .fea-badge--pending { background: rgba(251,191,36,0.14); color: #d97706; }
.fea-badge--approved { background: var(--emerald-soft); color: var(--emerald); }
.fea-badge--rejected { background: var(--crimson-soft); color: var(--crimson); }
.fea-badge--blocked { background: var(--crimson-soft); color: var(--crimson); }
.fea-badge--paid { background: var(--emerald-soft); color: var(--emerald); }

.fea-settings-form { display: flex; flex-direction: column; gap: 16px; max-width: 420px; }
.fea-settings-field { display: flex; flex-direction: column; gap: 4px; }
.fea-settings-label { font-size: 0.82rem; font-weight: 700; color: var(--text); }

.fea-close { position: absolute; top: 12px; right: 12px; width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--stroke); background: transparent; color: var(--text-muted); cursor: pointer; }
.fea-side-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); font-weight: 700; margin-bottom: 6px; }
.fea-side-big { font-size: 2rem; font-weight: 700; color: var(--text-strong); }
.fea-side-sub { font-size: 0.82rem; color: var(--text-muted); margin-top: 6px; }
.fea-client-name { font-size: 1.1rem; font-weight: 700; color: var(--text-strong); margin-bottom: 2px; }
.fea-client-meta { font-size: 0.82rem; color: var(--text-muted); margin-bottom: 8px; }
.fea-reject-note { font-size: 0.8rem; color: var(--crimson); margin-top: 8px; }

.fea-rows { display: flex; flex-direction: column; gap: 8px; }
.fea-row-kv { display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text); }
.fea-row-kv span:first-child { color: var(--text-muted); }

.fea-docs { display: flex; flex-direction: column; gap: 10px; }
.fea-doc-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px; border-radius: 10px; border: 1px solid var(--stroke-soft); flex-wrap: wrap; }
.fea-doc-main { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; }
.fea-doc-actions { display: flex; gap: 6px; }
.fea-btn-sm { padding: 6px 10px; border-radius: 7px; border: 1px solid var(--stroke); background: transparent; color: var(--text); font-size: 0.76rem; font-weight: 600; cursor: pointer; }
.fea-btn-sm--ok { border-color: var(--emerald); color: var(--emerald); }
.fea-btn-sm--bad { border-color: var(--crimson); color: var(--crimson); }
.fea-btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }

.fea-textarea { width: 100%; min-height: 64px; border-radius: 10px; border: 1px solid var(--stroke); background: var(--input-bg, transparent); color: var(--text); padding: 10px; font-size: 0.85rem; margin-bottom: 10px; resize: vertical; box-sizing: border-box; }
.fea-decision-actions { display: flex; gap: 8px; }
.fea-btn { padding: 10px 16px; border-radius: 9px; border: none; background: var(--accent); color: #fff; font-weight: 700; font-size: 0.85rem; cursor: pointer; flex: 1; }
.fea-btn--ok { background: var(--emerald); }
.fea-btn--bad { background: var(--crimson); }
.fea-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.fea-topup-form { display: flex; flex-direction: column; gap: 8px; }
.fea-input { padding: 10px 12px; border-radius: 9px; border: 1px solid var(--stroke); background: var(--input-bg, transparent); color: var(--text); font-size: 0.85rem; box-sizing: border-box; }

.fea-ledger-row { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid var(--stroke-soft); font-size: 0.82rem; }
.fea-ledger-row:last-child { border-bottom: none; }
.fea-ledger-type { font-weight: 600; color: var(--text); }
.fea-ledger-nums { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.fea-pos { color: var(--emerald); font-weight: 600; }
.fea-neg { color: var(--crimson); font-weight: 600; }

.fea-spinner { width: 1em; height: 1em; border-radius: 50%; border: 2px solid currentColor; border-top-color: transparent; display: inline-block; animation: feaSpin 0.7s linear infinite; }
@keyframes feaSpin { to { transform: rotate(360deg); } }

.fea-modal-backdrop {
  position: fixed; inset: 0; z-index: 90;
  background: rgba(8, 9, 12, 0.72);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  animation: cgFadeIn 160ms ease;
}
.fea-modal {
  background: var(--bg-panel-solid);
  border: 1px solid var(--stroke);
  border-radius: 16px;
  max-width: min(920px, 94vw);
  max-height: 92vh;
  width: 100%;
  display: flex; flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5);
}
.fea-modal-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--stroke-soft);
  flex-shrink: 0;
}
.fea-modal-title { font-weight: 700; font-size: 0.9rem; color: var(--text-strong); }
.fea-modal-head-actions { display: flex; gap: 8px; align-items: center; }
.fea-modal-head-actions a { text-decoration: none; display: inline-flex; align-items: center; }
.fea-modal-body { flex: 1; overflow: auto; display: flex; align-items: center; justify-content: center; background: var(--surface); min-height: 240px; }
.fea-modal-img { max-width: 100%; max-height: calc(92vh - 60px); object-fit: contain; display: block; }
.fea-modal-frame { width: 100%; height: calc(92vh - 60px); border: none; }

.fea-doc-card {
  display: flex; gap: 12px; align-items: stretch;
  padding: 10px; border-radius: 12px;
  border: 1px solid var(--stroke-soft); background: var(--surface);
}
.fea-doc-thumb {
  flex-shrink: 0; width: 96px; height: 96px; padding: 0; border: none;
  border-radius: 10px; overflow: hidden; cursor: pointer;
  background: var(--bg-panel-solid); border: 1px solid var(--stroke);
  display: flex; align-items: center; justify-content: center;
}
.fea-doc-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fea-doc-thumb:hover { outline: 2px solid var(--accent); outline-offset: 1px; }
.fea-doc-thumb-ph { font-size: 0.75rem; font-weight: 700; color: var(--text-dim); }
.fea-doc-card-main { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; }
`;
