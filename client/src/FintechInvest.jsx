import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fintechApi, getFintechToken, setFintechToken, onFintechSessionExpired } from './api.js';
import { openFintechStatementReport } from './fintechStatementReport.js';
import { WorldClocksCard } from './WorldClocks.jsx';

const DOC_LABELS = {
  passport_main: 'Паспорт (разворот с фото)',
  passport_registration: 'Паспорт (страница с регистрацией)',
  selfie: 'Селфи с паспортом',
};

const ENTRY_LABELS = {
  deposit_rub: 'Пополнение',
  withdraw_rub: 'Вывод',
  buy_gold: 'Покупка золота',
  sell_gold: 'Продажа золота',
  fee: 'Комиссия',
  correction: 'Корректировка',
};

function formatMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(n));
}
function formatGrams(n) {
  if (n == null || !Number.isFinite(Number(n))) return '0.0000 г';
  return `${Number(n).toFixed(4)} г`;
}
function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatPhoneInput(raw) {
  const d = String(raw || '').replace(/\D/g, '').replace(/^8/, '7').replace(/^7/, '');
  return d.slice(0, 10);
}

/**
 * Инвестиции в золото — отдельный fintech-модуль внутри общего /kabinet.
 * Своя сессия (телефон+SMS), отдельная от кабинета скупки: разные бизнес-линии.
 * Дизайн переиспользует общие cpx-* стили кабинета (см. ClientPortal.jsx) —
 * никакой отдельной темы/CSS-блока здесь нет, чтобы вкладка не выглядела чужой.
 */
export function FintechInvest({ clientToken = '' }) {
  const [phase, setPhase] = useState('checking'); // checking | login | app
  const [profile, setProfile] = useState(null);
  const [loadErr, setLoadErr] = useState('');

  const loadProfile = useCallback(async () => {
    const p = await fintechApi.profile();
    setProfile(p);
    setPhase('app');
    setLoadErr('');
    return p;
  }, []);

  /** Тихий вход: есть клиентская сессия кабинета → выпускаем fintech-токен без SMS. */
  const ensureSession = useCallback(async () => {
    if (getFintechToken()) {
      try {
        await loadProfile();
        return true;
      } catch (e) {
        // Стейл-токен: ниже попробуем обмен из client-сессии.
        if (e?.status !== 401) {
          setLoadErr(e?.message || 'Не удалось загрузить кабинет');
          setPhase('app');
          return false;
        }
        setFintechToken('');
      }
    }
    if (clientToken) {
      try {
        await fintechApi.sessionFromClient(clientToken);
        await loadProfile();
        return true;
      } catch {
        /* покажем форму входа */
      }
    }
    setPhase('login');
    return false;
  }, [clientToken, loadProfile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureSession();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [ensureSession]);

  // 401 от фонового запроса: сначала пробуем восстановить сессию из кабинета, не выкидывая на SMS.
  useEffect(() => onFintechSessionExpired(() => {
    if (clientToken) {
      fintechApi
        .sessionFromClient(clientToken)
        .then(() => loadProfile())
        .catch(() => {
          setProfile(null);
          setPhase('login');
        });
      return;
    }
    setProfile(null);
    setPhase('login');
  }), [clientToken, loadProfile]);

  // Пока документы на проверке — тихо обновляем статус, чтобы не заставлять жать «Обновить».
  useEffect(() => {
    if (profile?.status !== 'pending_review') return undefined;
    const id = setInterval(() => { void loadProfile().catch(() => {}); }, 20_000);
    return () => clearInterval(id);
  }, [profile?.status, loadProfile]);

  if (phase === 'login') {
    return <FintechLogin onDone={() => { void ensureSession(); }} />;
  }

  if (phase === 'checking') {
    return <div className="cpx-center"><span className="cpx-spinner" /> Загрузка…</div>;
  }

  if (loadErr) {
    return (
      <div className="cpx-card">
        <p className="cpx-err">{loadErr}</p>
        <button type="button" className="cpx-btn cpx-btn--sm" onClick={() => { void ensureSession(); }}>Повторить</button>
      </div>
    );
  }

  if (!profile) return null;

  if (profile.status === 'new' || profile.status === 'rejected') {
    return <FintechOnboarding profile={profile} onUpdated={() => { void loadProfile().catch(() => {}); }} />;
  }
  if (profile.status === 'pending_review') {
    return <FintechPendingReview profile={profile} onRefresh={() => loadProfile()} />;
  }
  if (profile.status === 'blocked') {
    return (
      <div className="cpx-card">
        <p className="cpx-err">Доступ к инвестициям заблокирован. Обратитесь к менеджеру Reaktivo.</p>
      </div>
    );
  }
  return <FintechDashboard profile={profile} />;
}

// ── Вход (телефон + SMS-код) — 1 в 1 с главным логином кабинета ────────────
function FintechLogin({ onDone }) {
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [phoneMasked, setPhoneMasked] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [smsWarn, setSmsWarn] = useState('');

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const id = setInterval(() => setResendIn((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  async function requestCode(e) {
    e?.preventDefault?.();
    setErr('');
    if (phone.length !== 10) {
      setErr('Введите номер телефона полностью');
      return;
    }
    setBusy(true);
    try {
      const out = await fintechApi.requestCode(`7${phone}`);
      setPhoneMasked(out.phoneMasked || '');
      setSmsWarn(out.smsOk === false ? 'СМС не удалось отправить. Подождите немного и нажмите «Отправить код ещё раз» — либо свяжитесь с менеджером.' : '');
      setStep('code');
      setResendIn(60);
    } catch (e2) {
      setErr(e2?.message || 'Не удалось отправить код');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e) {
    e?.preventDefault?.();
    setErr('');
    const c = code.replace(/\D/g, '');
    if (c.length !== 6) {
      setErr('Введите 6 цифр из СМС');
      return;
    }
    setBusy(true);
    try {
      await fintechApi.verify(`7${phone}`, c);
      onDone?.();
    } catch (e2) {
      setErr(e2?.message || 'Неверный код');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cpx-card cpx-login">
      <h1 className="cpx-title">Инвестиции в золото</h1>
      <p className="cpx-sub">
        Отдельный вход — свой код защищает доступ к деньгам, даже если сессия кабинета скупки уже открыта на этом телефоне.
      </p>

      {step === 'phone' && (
        <form onSubmit={requestCode} className="cpx-form">
          <label className="cpx-field">
            <span className="cpx-field-label">Номер телефона</span>
            <div className="cpx-phone">
              <span className="cpx-phone-prefix">+7</span>
              <input
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                placeholder="9990000000"
                autoFocus
              />
            </div>
          </label>
          {err && <p className="cpx-err">{err}</p>}
          <button type="submit" className="cpx-btn" disabled={busy}>
            {busy ? <><span className="cpx-spinner" /> Отправляем…</> : 'Получить код'}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verifyCode} className="cpx-form">
          <p className="cpx-code-hint">Код отправлен на {phoneMasked || 'ваш номер'}. Введите 6 цифр из SMS.</p>
          {smsWarn && <p className="cpx-err" style={{ color: 'var(--warn-dot)' }}>{smsWarn}</p>}
          <label className="cpx-field">
            <span className="cpx-field-label">Код из SMS</span>
            <input
              className="cpx-code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              autoFocus
            />
          </label>
          {err && <p className="cpx-err">{err}</p>}
          <button type="submit" className="cpx-btn" disabled={busy}>
            {busy ? <><span className="cpx-spinner" /> Проверяем…</> : 'Войти'}
          </button>
          <div className="cpx-code-actions">
            <button type="button" className="cpx-link" onClick={() => { setStep('phone'); setCode(''); setErr(''); setSmsWarn(''); }}>
              Изменить номер
            </button>
            <button type="button" className="cpx-link" disabled={resendIn > 0 || busy} onClick={requestCode}>
              {resendIn > 0 ? `Отправить ещё раз через ${resendIn}с` : 'Отправить код ещё раз'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Регистрация: контакты + загрузка документов ─────────────────────────────
function FintechOnboarding({ profile, onUpdated }) {
  const [fullName, setFullName] = useState(profile.fullName || '');
  const [email, setEmail] = useState(profile.email || '');
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);
  const [err, setErr] = useState('');
  const [uploading, setUploading] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const lastSavedRef = useRef({ fullName: profile.fullName || '', email: profile.email || '' });

  /** Тихое автосохранение при уходе из поля — имя не потеряется, даже если
   *  клиент не нажал «Сохранить» (в админке пропадает «Без имени»). */
  async function autoSaveInfo() {
    const name = fullName.trim();
    const mail = email.trim();
    if (!name && !mail) return;
    if (lastSavedRef.current.fullName === name && lastSavedRef.current.email === mail) return;
    try {
      await fintechApi.updateProfile(name, mail);
      lastSavedRef.current = { fullName: name, email: mail };
      setInfoSaved(true);
    } catch {
      /* best-effort: явное сохранение остаётся кнопкой или при submit */
    }
  }

  const docsByType = useMemo(() => {
    const map = new Map();
    for (const d of profile.documents || []) {
      if (!map.has(d.docType) || new Date(d.createdAt) > new Date(map.get(d.docType).createdAt)) {
        map.set(d.docType, d);
      }
    }
    return map;
  }, [profile.documents]);

  async function saveInfo(e) {
    e?.preventDefault?.();
    setSavingInfo(true);
    setErr('');
    try {
      await fintechApi.updateProfile(fullName, email);
      lastSavedRef.current = { fullName: fullName.trim(), email: email.trim() };
      setInfoSaved(true);
    } catch (e2) {
      setErr(e2?.message || 'Не удалось сохранить данные');
    } finally {
      setSavingInfo(false);
    }
  }

  async function handleUpload(docType, file) {
    if (!file) return;
    setErr('');
    setUploading(docType);
    try {
      const dataUrl = await fileToBase64(file);
      await fintechApi.uploadKycDoc(docType, dataUrl, file.type);
      await onUpdated?.();
    } catch (e2) {
      setErr(e2?.message || 'Не удалось загрузить файл');
    } finally {
      setUploading('');
    }
  }

  const hasRequired = docsByType.has('passport_main') && docsByType.has('selfie')
    && docsByType.get('passport_main').status !== 'rejected'
    && docsByType.get('selfie').status !== 'rejected';

  const missingSteps = [];
  if (!fullName.trim()) missingSteps.push('укажите ФИО');
  if (!docsByType.has('passport_main') || docsByType.get('passport_main').status === 'rejected') missingSteps.push('загрузите паспорт (разворот с фото)');
  if (!docsByType.has('selfie') || docsByType.get('selfie').status === 'rejected') missingSteps.push('загрузите селфи с паспортом');

  async function submit() {
    setSubmitting(true);
    setErr('');
    try {
      if (!fullName.trim()) {
        setErr('Укажите ФИО — оно нужно модератору для сверки с паспортом');
        return;
      }
      // ФИО/email могли быть введены, но не сохранены кнопкой — сохраняем сами,
      // чтобы заявка не улетела «Без имени».
      await fintechApi.updateProfile(fullName, email);
      lastSavedRef.current = { fullName: fullName.trim(), email: email.trim() };
      setInfoSaved(true);
      await fintechApi.submitForReview();
      await onUpdated?.();
    } catch (e2) {
      setErr(e2?.message || 'Не удалось отправить на проверку');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {profile.status === 'rejected' && profile.rejectReason && (
        <div className="cpx-card cpx-fin-banner">
          <span className="cpx-fin-banner-title">Заявка отклонена</span>
          <p className="cpx-sub" style={{ margin: 0 }}>{profile.rejectReason}</p>
          <p className="cpx-muted" style={{ marginTop: 8 }}>Загрузите документы ещё раз — заявка автоматически уйдёт на повторную проверку.</p>
        </div>
      )}

      <div className="cpx-card">
        <h2 className="cpx-h2">Данные для регистрации</h2>
        <p className="cpx-sub">Заполните ФИО и email — они понадобятся для выписок и связи по заявке.</p>
        <form onSubmit={saveInfo} className="cpx-fin-form-row">
          <label className="cpx-field">
            <span className="cpx-field-label">ФИО</span>
            <input value={fullName} onChange={(e) => { setFullName(e.target.value); setInfoSaved(false); }} onBlur={autoSaveInfo} placeholder="Иванов Иван Иванович" />
          </label>
          <label className="cpx-field">
            <span className="cpx-field-label">Email (для выписок)</span>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setInfoSaved(false); }} onBlur={autoSaveInfo} placeholder="you@example.com" />
          </label>
          <button type="submit" className="cpx-btn cpx-btn--sm" disabled={savingInfo}>
            {savingInfo ? <span className="cpx-spinner" /> : infoSaved ? 'Сохранено ✓' : 'Сохранить'}
          </button>
        </form>
      </div>

      <div className="cpx-card">
        <h2 className="cpx-h2">Документы (KYC)</h2>
        <p className="cpx-sub">Загрузите фото или скан — модератор проверит их вручную.</p>
        <div className="cpx-fin-docs">
          {Object.keys(DOC_LABELS).map((docType) => {
            const doc = docsByType.get(docType);
            return (
              <DocUploadRow
                key={docType}
                docType={docType}
                label={DOC_LABELS[docType]}
                required={docType !== 'passport_registration'}
                doc={doc}
                uploading={uploading === docType}
                onUpload={(file) => handleUpload(docType, file)}
              />
            );
          })}
        </div>
        {err && <p className="cpx-err">{err}</p>}
        <button type="button" className="cpx-btn" disabled={!hasRequired || !fullName.trim() || submitting} onClick={submit}>
          {submitting ? <><span className="cpx-spinner" /> Отправляем…</> : 'Отправить на проверку'}
        </button>
        {missingSteps.length > 0 && (
          <p className="cpx-fin-hint">Чтобы отправить заявку: {missingSteps.join(', ')}.</p>
        )}
      </div>
    </>
  );
}

function DocUploadRow({ docType, label, required, doc, uploading, onUpload }) {
  const inputRef = useRef(null);
  const status = doc?.status;
  return (
    <div className="cpx-fin-doc-row">
      <div className="cpx-fin-doc-main">
        <span className="cpx-fin-doc-label">{label}{required ? '' : ' (опционально)'}</span>
        {status && (
          <span className={`cpx-fin-badge cpx-fin-badge--${status}`}>
            {status === 'approved' ? 'Одобрено' : status === 'rejected' ? 'Отклонено' : 'На проверке'}
          </span>
        )}
        {status === 'rejected' && doc?.rejectReason && <span className="cpx-fin-doc-reason">{doc.rejectReason}</span>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f); }}
      />
      <button type="button" className="cpx-fin-doc-btn" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? <span className="cpx-spinner" /> : status ? 'Загрузить ещё раз' : 'Загрузить'}
      </button>
    </div>
  );
}

// ── Ожидание проверки ───────────────────────────────────────────────────────
function FintechPendingReview({ profile, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    try { await onRefresh?.(); } finally { setRefreshing(false); }
  }
  return (
    <div className="cpx-card cpx-center" style={{ color: 'var(--cpx-ink)', flexDirection: 'column', textAlign: 'center', padding: '36px 20px' }}>
      <span className="cpx-fin-pending-icon" aria-hidden>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      </span>
      <h2 className="cpx-h2">Документы на проверке</h2>
      <p className="cpx-sub">Модератор Reaktivo проверяет ваши документы. Обычно это занимает до 1 рабочего дня.</p>
      <div className="cpx-fin-doc-status-list">
        {(profile.documents || []).map((d) => (
          <div key={d.id} className="cpx-fin-doc-status-row">
            <span>{DOC_LABELS[d.docType] || d.docType}</span>
            <span className={`cpx-fin-badge cpx-fin-badge--${d.status}`}>
              {d.status === 'approved' ? 'Одобрено' : d.status === 'rejected' ? 'Отклонено' : 'На проверке'}
            </span>
          </div>
        ))}
      </div>
      <button type="button" className="cpx-btn cpx-btn--sm" disabled={refreshing} onClick={refresh}>
        {refreshing ? <span className="cpx-spinner" /> : 'Обновить статус'}
      </button>
    </div>
  );
}
// ── График курса золота ─────────────────────────────────────────────────────
const CHART_RANGES = [
  { key: '1m', label: '1М', days: 31 },
  { key: '3m', label: '3М', days: 92 },
  { key: '6m', label: '6М', days: 183 },
  { key: '1y', label: '1Г', days: 366 },
];

function formatChartDate(iso, rangeKey) {
  try {
    const d = new Date(`${iso}T00:00:00`);
    if (rangeKey === '1y' || rangeKey === '6m') {
      return d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
    }
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}

function GoldChartCard({ currentRate, rateUpdatedAt }) {
  const [points, setPoints] = useState(null);
  const [range, setRange] = useState('3m');

  useEffect(() => {
    let alive = true;
    fintechApi
      .goldHistory(366)
      .then((out) => { if (alive) setPoints(out.points || []); })
      .catch(() => { if (alive) setPoints([]); });
    return () => { alive = false; };
  }, []);

  const visible = useMemo(() => {
    if (!points?.length) return [];
    const days = CHART_RANGES.find((r) => r.key === range)?.days || 92;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    return points.filter((p) => p.date >= cutoff);
  }, [points, range]);

  const delta = useMemo(() => {
    if (visible.length < 2) return null;
    const first = visible[0].price;
    const last = visible[visible.length - 1].price;
    if (!first) return null;
    return Math.round(((last - first) / first) * 1000) / 10;
  }, [visible]);

  const yDomain = useMemo(() => {
    if (!visible.length) return ['auto', 'auto'];
    const values = visible.map((p) => p.price);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.08, max * 0.004);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [visible]);

  return (
    <div className="cpx-card cpx-fin-chart-card">
      <div className="cpx-fin-chart-head">
        <div className="cpx-fin-chart-titles">
          <span className="cpx-fin-kpi-label">Курс золота · Мосбиржа GLDRUBF</span>
          <div className="cpx-fin-chart-rate">
            <span className="cpx-fin-chart-price">{currentRate != null ? formatMoney(currentRate) : '—'}<span className="cpx-fin-chart-per"> / г</span></span>
            {delta != null && (
              <span className={`cpx-fin-chart-delta ${delta >= 0 ? 'cpx-fin-pos' : 'cpx-fin-neg'}`}>
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString('ru-RU')}% за {CHART_RANGES.find((r) => r.key === range)?.label?.toLowerCase()}
              </span>
            )}
          </div>
          {rateUpdatedAt && <span className="cpx-fin-chart-upd">обновлено {formatDateTime(rateUpdatedAt)}</span>}
        </div>
        <div className="cpx-fin-range">
          {CHART_RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`cpx-fin-range-btn${range === r.key ? ' cpx-fin-range-btn--on' : ''}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cpx-fin-chart-body">
        {points === null && <div className="cpx-muted" style={{ padding: '40px 0', justifyContent: 'center' }}><span className="cpx-spinner" /> Загружаем график…</div>}
        {points !== null && visible.length === 0 && <div className="cpx-muted" style={{ padding: '40px 0', justifyContent: 'center' }}>История курса временно недоступна</div>}
        {visible.length > 1 && (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={visible} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="finGoldFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-soft)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatChartDate(v, range)}
                tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={42}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(v) => `${Math.round(v).toLocaleString('ru-RU')}`}
                tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-panel-solid)',
                  border: '1px solid var(--stroke)',
                  borderRadius: 10,
                  fontSize: 12,
                  color: 'var(--text)',
                }}
                labelStyle={{ color: 'var(--text-muted)', marginBottom: 4 }}
                formatter={(v) => [`${Number(v).toLocaleString('ru-RU')} ₽/г`, 'Курс']}
                labelFormatter={(v) => new Date(`${v}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="var(--accent)"
                strokeWidth={2.2}
                fill="url(#finGoldFill)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ── AI-ассистент ────────────────────────────────────────────────────────────
function AssistantCard() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const [err, setErr] = useState('');

  const ask = useCallback(async (q) => {
    setBusy(true);
    setErr('');
    try {
      const out = await fintechApi.assistant(q);
      setData(out);
      if (q) setQuestion('');
    } catch (e) {
      setErr(e?.message || 'Ассистент временно недоступен');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { ask(''); }, [ask]);

  function submitQuestion(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    ask(q);
  }

  const scenarios = data?.forecast?.scenarios || [];

  return (
    <div className="cpx-card cpx-fin-ai-card">
      <div className="cpx-fin-ai-head">
        <div className="cpx-fin-ai-title-wrap">
          <span className="cpx-fin-ai-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 0 1 4 4c1.5.5 3 2 3 4a4 4 0 0 1-1 2.65A4 4 0 0 1 16 19a4 4 0 0 1-8 0 4 4 0 0 1-2-6.35A4 4 0 0 1 5 10c0-2 1.5-3.5 3-4a4 4 0 0 1 4-4z" />
              <path d="M9 13a3 3 0 0 0 6 0" />
            </svg>
          </span>
          <h2 className="cpx-fin-ai-heading">AI-ассистент</h2>
          <span className={`cpx-fin-ai-badge${data?.source === 'grok' ? ' cpx-fin-ai-badge--grok' : ''}`}>
            {data?.source === 'grok' ? 'Grok' : 'Анализ'}
          </span>
        </div>
        <button type="button" className="cpx-link" disabled={busy} onClick={() => ask('')}>Обновить</button>
      </div>

      {busy && !data && <p className="cpx-muted"><span className="cpx-spinner" /> Анализируем портфель…</p>}
      {err && <p className="cpx-err">{err}</p>}

      {data?.answer && (
        <div className={`cpx-fin-ai-answer${busy ? ' cpx-fin-ai-answer--busy' : ''}`}>{data.answer}</div>
      )}

      {scenarios.length > 0 && (
        <div className="cpx-fin-ai-forecast">
          <div className="cpx-fin-ai-forecast-title">
            {data?.forecast?.accumulation
              ? `Прогноз при покупке ${data.forecast.monthlyGrams} г / мес · горизонт 5 лет`
              : 'Прогноз стоимости · горизонт 5 лет'}
          </div>
          <div className="cpx-fin-ai-scenarios">
            {scenarios.map((s) => {
              const y5 = s.values?.find((v) => v.years === 5) || s.values?.[s.values.length - 1];
              return (
                <div key={s.key} className={`cpx-fin-ai-scenario${s.key === 'hist' ? ' cpx-fin-ai-scenario--accent' : ''}`}>
                  <span className="cpx-fin-ai-scenario-label">{s.label}</span>
                  <span className="cpx-fin-ai-scenario-value">{formatMoney(y5?.valueRub)}</span>
                  <span className="cpx-fin-ai-scenario-meta">
                    {[1, 3].map((y) => {
                      const row = s.values?.find((v) => v.years === y);
                      return row ? `${y}г: ${formatMoney(row.valueRub)}` : null;
                    }).filter(Boolean).join(' · ')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <form onSubmit={submitQuestion} className="cpx-fin-ai-ask">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Спросите: что будет, если покупать по 5 г в месяц?"
          maxLength={500}
          disabled={busy}
        />
        <button type="submit" className="cpx-fin-ai-ask-btn" disabled={busy || !question.trim()}>
          {busy ? <span className="cpx-spinner" /> : 'Спросить'}
        </button>
      </form>
      <p className="cpx-fin-ai-disclaimer">Прогноз на исторических данных, не инвестиционная рекомендация.</p>
    </div>
  );
}

// ── Калькулятор упущенной выгоды (официальный курс ЦБ) ──────────────────────
function MissedBenefitCard({ compact = false, onOpenFull }) {
  const [points, setPoints] = useState(null);
  const [investRub, setInvestRub] = useState(3_000_000);
  const [buyYear, setBuyYear] = useState(2010);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    fintechApi
      .cbrGoldHistory()
      .then((out) => {
        if (!alive) return;
        const pts = out.points || [];
        setPoints(pts);
        if (pts.length) {
          const years = pts.map((p) => p.year);
          const mid = years[Math.floor(years.length / 2)] || 2010;
          setBuyYear((y) => (years.includes(y) ? y : mid));
        }
      })
      .catch((e) => {
        if (alive) {
          setPoints([]);
          setErr(e?.message || 'История ЦБ временно недоступна');
        }
      });
    return () => { alive = false; };
  }, []);

  const yearBounds = useMemo(() => {
    if (!points?.length) return { min: 2000, max: new Date().getFullYear() };
    return { min: points[0].year, max: points[points.length - 1].year };
  }, [points]);

  const result = useMemo(() => {
    if (!points?.length || !investRub) return null;
    const past = [...points].reverse().find((p) => p.year <= buyYear) || points[0];
    const now = points[points.length - 1];
    if (!past?.price || !now?.price) return null;
    const grams = investRub / past.price;
    const todayValue = grams * now.price;
    const profit = todayValue - investRub;
    const pct = investRub > 0 ? (profit / investRub) * 100 : 0;
    return {
      pastPrice: past.price,
      nowPrice: now.price,
      pastYear: past.year,
      grams,
      todayValue,
      profit,
      pct,
    };
  }, [points, investRub, buyYear]);

  const chartData = useMemo(() => {
    if (!points?.length) return [];
    return points.map((p) => ({ year: String(p.year), price: p.price }));
  }, [points]);

  if (compact) {
    return (
      <div className="cpx-card cpx-fin-benefit-compact">
        <div className="cpx-fin-benefit-compact-head">
          <div>
            <span className="cpx-fin-kpi-label">Упущенная выгода</span>
            <h3 className="cpx-fin-side-title" style={{ margin: '2px 0 0' }}>Сколько вы могли заработать?</h3>
          </div>
          <button type="button" className="cpx-link" onClick={onOpenFull}>Открыть →</button>
        </div>
        {result ? (
          <div className="cpx-fin-benefit-compact-res">
            <span className="cpx-fin-pos">+{formatMoney(result.profit)}</span>
            <span className="cpx-fin-kpi-pct cpx-fin-pos">+{Math.round(result.pct).toLocaleString('ru-RU')}%</span>
          </div>
        ) : (
          <p className="cpx-muted" style={{ margin: 0 }}>{points === null ? 'Считаем…' : 'Нет данных'}</p>
        )}
        <p className="cpx-fin-ai-disclaimer">Анализ по курсу ЦБ РФ, не инвестиционное предложение.</p>
      </div>
    );
  }

  return (
    <div className="cpx-card cpx-fin-benefit-card">
      <div className="cpx-fin-chart-head">
        <div>
          <span className="cpx-fin-pill">Рост золота по данным ЦБ РФ</span>
          <h2 className="cpx-fin-side-title" style={{ marginTop: 8 }}>Калькулятор упущенной выгоды</h2>
          <p className="cpx-fin-side-sub">Сколько вы могли заработать, купив золото раньше?</p>
        </div>
      </div>

      {err && <p className="cpx-err">{err}</p>}
      {points === null && <p className="cpx-muted"><span className="cpx-spinner" /> Загружаем историю ЦБ…</p>}

      {chartData.length > 1 && (
        <div className="cpx-fin-chart-body" style={{ marginBottom: 16 }}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="finCbrFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-soft)" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
              <YAxis
                tickFormatter={(v) => `${Math.round(v).toLocaleString('ru-RU')}`}
                tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-panel-solid)',
                  border: '1px solid var(--stroke)',
                  borderRadius: 10,
                  fontSize: 12,
                  color: 'var(--text)',
                }}
                formatter={(v) => [`${Number(v).toLocaleString('ru-RU')} ₽/г`, 'ЦБ']}
              />
              <Area type="monotone" dataKey="price" stroke="var(--accent)" strokeWidth={2} fill="url(#finCbrFill)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <p className="cpx-fin-ai-disclaimer">*по официальным данным ЦБ РФ</p>
        </div>
      )}

      <div className="cpx-fin-sliders">
        <label className="cpx-fin-slider">
          <div className="cpx-fin-slider-head">
            <span>Сумма вложений в золото</span>
            <strong>{formatMoney(investRub)}</strong>
          </div>
          <input
            type="range"
            min={100_000}
            max={10_000_000}
            step={50_000}
            value={investRub}
            onChange={(e) => setInvestRub(Number(e.target.value))}
          />
          <div className="cpx-fin-slider-ends"><span>100 000 ₽</span><span>10 000 000 ₽</span></div>
        </label>
        <label className="cpx-fin-slider">
          <div className="cpx-fin-slider-head">
            <span>Год приобретения золота</span>
            <strong>{buyYear}</strong>
          </div>
          <input
            type="range"
            min={yearBounds.min}
            max={yearBounds.max}
            step={1}
            value={Math.min(yearBounds.max, Math.max(yearBounds.min, buyYear))}
            onChange={(e) => setBuyYear(Number(e.target.value))}
            disabled={!points?.length}
          />
          <div className="cpx-fin-slider-ends"><span>{yearBounds.min}</span><span>{yearBounds.max}</span></div>
        </label>
      </div>

      {result && (
        <div className="cpx-fin-benefit-result">
          <div className="cpx-fin-benefit-result-box">
            <span className="cpx-fin-kpi-label">Вы могли бы заработать</span>
            <div className="cpx-fin-benefit-nums">
              <span className="cpx-fin-benefit-profit cpx-fin-pos">+ {formatMoney(result.profit)}</span>
              <span className="cpx-fin-benefit-pct cpx-fin-pos">+{Math.round(result.pct).toLocaleString('ru-RU')}%</span>
            </div>
            <p className="cpx-fin-ai-disclaimer">*без учёта уплаты НДФЛ и комиссий</p>
          </div>
          <div className="cpx-fin-benefit-today">
            <span className="cpx-fin-kpi-label">Сегодня у вас было бы</span>
            <span className="cpx-fin-benefit-today-val">{formatMoney(result.todayValue)}</span>
          </div>
        </div>
      )}
      <p className="cpx-fin-ai-disclaimer" style={{ marginTop: 12 }}>
        Материалы носят иллюстративный характер и не являются индивидуальной инвестиционной рекомендацией или обещанием доходности. Прошлый рост не гарантирует будущий результат.
      </p>
    </div>
  );
}

function LedgerList({ ledger, limit = 12 }) {
  if (!ledger.length) return <p className="cpx-muted" style={{ margin: 0 }}>Операций пока нет.</p>;
  return (
    <div className="cpx-fin-ledger-list">
      {ledger.slice(0, limit).map((e) => (
        <div key={e.id} className="cpx-fin-ledger-row">
          <div className="cpx-fin-ledger-main">
            <span className="cpx-fin-ledger-type">{ENTRY_LABELS[e.entryType] || e.entryType}</span>
            <span className="cpx-fin-ledger-date">{formatDateTime(e.createdAt)}</span>
          </div>
          <div className="cpx-fin-ledger-right">
            {!!e.rubDelta && <span className={e.rubDelta > 0 ? 'cpx-fin-pos' : 'cpx-fin-neg'}>{e.rubDelta > 0 ? '+' : ''}{formatMoney(e.rubDelta)}</span>}
            {!!e.goldGramsDelta && <span className={e.goldGramsDelta > 0 ? 'cpx-fin-pos' : 'cpx-fin-neg'}>{e.goldGramsDelta > 0 ? '+' : ''}{formatGrams(e.goldGramsDelta)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Покупка: состав заказа ──────────────────────────────────────────────────
function BuyPanel({ portfolio, onDone }) {
  const [mode, setMode] = useState('grams');
  const [amount, setAmount] = useState('50');
  const [buying, setBuying] = useState(false);
  const [buyErr, setBuyErr] = useState('');
  const [buyOk, setBuyOk] = useState('');

  const rate = Number(portfolio?.currentRatePerGram) || 0;
  const feePct = Number(portfolio?.buyFeePercent) || 0;
  const feeMult = 1 + feePct / 100;
  const minG = Number(portfolio?.minPurchaseGrams) || 1;
  const rubBal = Number(portfolio?.rubBalance) || 0;

  const quote = useMemo(() => {
    const v = parseFloat(String(amount).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0 || !rate) return null;
    let grams;
    let rubGross;
    if (mode === 'rub') {
      rubGross = Math.round(v * 100) / 100;
      grams = rubGross / (rate * feeMult);
    } else {
      grams = v;
      rubGross = Math.round(grams * rate * feeMult * 100) / 100;
    }
    grams = Math.round(grams * 1e6) / 1e6;
    const rubNet = Math.round(grams * rate * 100) / 100;
    const feeRub = Math.round((rubGross - rubNet) * 100) / 100;
    return { grams, rubGross, rubNet, feeRub };
  }, [amount, mode, rate, feeMult]);

  async function submitBuy(e) {
    e.preventDefault();
    setBuyErr('');
    setBuyOk('');
    const v = parseFloat(String(amount).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      setBuyErr('Укажите сумму или вес больше нуля');
      return;
    }
    if (quote && quote.grams < minG) {
      setBuyErr(`Минимальная покупка — ${minG} г`);
      return;
    }
    if (quote && quote.rubGross > rubBal) {
      setBuyErr('Недостаточно средств на рублёвом балансе. Пополните счёт.');
      return;
    }
    setBuying(true);
    try {
      const payload = mode === 'rub'
        ? { rubAmount: v, idempotencyKey: crypto.randomUUID() }
        : { grams: v, idempotencyKey: crypto.randomUUID() };
      const out = await fintechApi.buy(payload);
      setBuyOk(`Куплено ${formatGrams(out.gramsBought)} за ${formatMoney(out.rubSpent)}`);
      setAmount(mode === 'grams' ? '50' : '10000');
      await onDone?.();
    } catch (e2) {
      setBuyErr(e2?.message || 'Не удалось выполнить покупку');
    } finally {
      setBuying(false);
    }
  }

  function stepGrams(dir) {
    const step = 50;
    const cur = parseFloat(String(amount).replace(',', '.')) || 0;
    const next = Math.max(minG, Math.round((cur + dir * step) * 1000) / 1000);
    setMode('grams');
    setAmount(String(next));
  }

  return (
    <div className="cpx-fin-buy-panel">
      <div className="cpx-card cpx-fin-buy-card">
        <h2 className="cpx-fin-side-title">Купить золото</h2>
        <p className="cpx-fin-side-sub">
          От {minG} г · курс {rate ? formatMoney(rate) : '—'} / г
          {feePct ? ` · комиссия ${feePct}%` : ''}
        </p>

        <form onSubmit={submitBuy} className="cpx-form cpx-fin-buy-form">
          {mode === 'grams' ? (
            <div className="cpx-fin-stepper">
              <button type="button" className="cpx-fin-stepper-btn" onClick={() => stepGrams(-1)} aria-label="Меньше">−</button>
              <div className="cpx-fin-stepper-value">
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-label="Вес в граммах"
                />
                <span>г</span>
              </div>
              <button type="button" className="cpx-fin-stepper-btn" onClick={() => stepGrams(1)} aria-label="Больше">+</button>
            </div>
          ) : (
            <label className="cpx-field">
              <span className="cpx-field-label">Сумма, ₽</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10000" />
            </label>
          )}

          <div className="cpx-fin-mode-switch">
            <button
              type="button"
              className={`cpx-fin-mode-btn${mode === 'grams' ? ' cpx-fin-mode-btn--on' : ''}`}
              onClick={() => { setMode('grams'); setAmount('50'); }}
            >
              По весу
            </button>
            <button
              type="button"
              className={`cpx-fin-mode-btn${mode === 'rub' ? ' cpx-fin-mode-btn--on' : ''}`}
              onClick={() => { setMode('rub'); setAmount('10000'); }}
            >
              По сумме
            </button>
          </div>
          <p className="cpx-fin-step-hint">{mode === 'grams' ? 'шаг ±50 г · можно ввести вручную' : 'золото рассчитается по курсу автоматически'}</p>

          {quote && (
            <div className="cpx-fin-order">
              <div className="cpx-fin-order-title">Состав заказа</div>
              <div className="cpx-fin-order-row"><span>Номинал</span><strong>{formatGrams(quote.grams)}</strong></div>
              <div className="cpx-fin-order-row"><span>Цена без комиссии</span><strong>{formatMoney(quote.rubNet)}</strong></div>
              <div className="cpx-fin-order-row cpx-fin-order-row--accent">
                <span>Комиссия {feePct}%</span>
                <strong>{formatMoney(quote.feeRub)}</strong>
              </div>
              <div className="cpx-fin-order-total">
                <span>К оплате</span>
                <strong>{formatMoney(quote.rubGross)}</strong>
              </div>
              <div className="cpx-fin-order-bal">
                Доступно на балансе: {formatMoney(rubBal)}
                {quote.rubGross > rubBal && <span className="cpx-fin-neg"> · недостаточно</span>}
              </div>
            </div>
          )}

          {buyErr && <p className="cpx-err">{buyErr}</p>}
          {buyOk && <p className="cpx-fin-ok">{buyOk}</p>}
          <button type="submit" className="cpx-btn" disabled={buying || !quote}>
            {buying ? <><span className="cpx-spinner" /> Покупаем…</> : 'Подтвердить покупку'}
          </button>
        </form>
      </div>

      <div className="cpx-card cpx-fin-topup-hint">
        <span className="cpx-fin-topup-icon" aria-hidden>ℹ</span>
        <p>Пополнение рублёвого баланса — переводом по реквизитам. Модератор зачислит сумму в течение рабочего дня. Онлайн-оплата картой и СБП подключится после эквайринга Т-Банка.</p>
      </div>
    </div>
  );
}

// ── Продажа + заявка на вывод ───────────────────────────────────────────────
function SellPanel({ portfolio, onDone }) {
  const [grams, setGrams] = useState('');
  const [selling, setSelling] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [withdrawRub, setWithdrawRub] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');

  const rate = Number(portfolio?.currentRatePerGram) || 0;
  const feePct = Number(portfolio?.sellFeePercent) || 0;
  const feeMult = 1 - feePct / 100;
  const goldBal = Number(portfolio?.goldGrams) || 0;
  const rubBal = Number(portfolio?.rubBalance) || 0;
  const minG = Number(portfolio?.minSellGrams) || 1;

  const quote = useMemo(() => {
    const g = parseFloat(String(grams).replace(',', '.'));
    if (!Number.isFinite(g) || g <= 0 || !rate) return null;
    const gross = Math.round(g * rate * 100) / 100;
    const net = Math.round(g * rate * feeMult * 100) / 100;
    const fee = Math.round((gross - net) * 100) / 100;
    return { grams: g, gross, net, fee };
  }, [grams, rate, feeMult]);

  async function submitSell(e) {
    e.preventDefault();
    setErr('');
    setOk('');
    const g = parseFloat(String(grams).replace(',', '.'));
    if (!Number.isFinite(g) || g <= 0) {
      setErr('Укажите вес больше нуля');
      return;
    }
    if (g < minG) {
      setErr(`Минимальная продажа — ${minG} г`);
      return;
    }
    if (g > goldBal + 1e-9) {
      setErr('Недостаточно золота на счёте');
      return;
    }
    setSelling(true);
    try {
      const out = await fintechApi.sell({ grams: g, idempotencyKey: crypto.randomUUID() });
      setOk(`Продано ${formatGrams(out.gramsSold)} · на баланс ${formatMoney(out.rubReceived)}`);
      setGrams('');
      await onDone?.();
    } catch (e2) {
      setErr(e2?.message || 'Не удалось продать');
    } finally {
      setSelling(false);
    }
  }

  function requestWithdraw(e) {
    e.preventDefault();
    const v = parseFloat(String(withdrawRub).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      setWithdrawNote('Укажите сумму вывода');
      return;
    }
    if (v > rubBal) {
      setWithdrawNote('Сумма больше рублёвого баланса');
      return;
    }
    setWithdrawNote('Заявка сохранена. Вывод на карту/СБП откроется после подключения эквайринга и правил комиссий. A7/ПСБ пока не подключаем.');
    try {
      const key = 'cpx_fin_withdraw_drafts';
      const prev = JSON.parse(localStorage.getItem(key) || '[]');
      prev.unshift({ rub: v, at: new Date().toISOString(), status: 'awaiting_integration' });
      localStorage.setItem(key, JSON.stringify(prev.slice(0, 20)));
    } catch { /* ignore */ }
  }

  return (
    <div className="cpx-fin-sell-grid">
      <div className="cpx-card">
        <h2 className="cpx-fin-side-title">Продать золото</h2>
        <p className="cpx-fin-side-sub">
          На счёте {formatGrams(goldBal)} · курс {rate ? formatMoney(rate) : '—'} / г
          {feePct ? ` · комиссия продажи ${feePct}%` : ''}
        </p>
        <form onSubmit={submitSell} className="cpx-form cpx-fin-buy-form">
          <label className="cpx-field">
            <span className="cpx-field-label">Вес, г</span>
            <input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder={String(minG)} />
          </label>
          <button type="button" className="cpx-link" style={{ alignSelf: 'flex-start' }} onClick={() => setGrams(String(Math.floor(goldBal * 1e4) / 1e4))}>
            Продать всё
          </button>
          {quote && (
            <div className="cpx-fin-order">
              <div className="cpx-fin-order-title">Результат продажи</div>
              <div className="cpx-fin-order-row"><span>По курсу рынка</span><strong>{formatMoney(quote.gross)}</strong></div>
              <div className="cpx-fin-order-row"><span>Комиссия {feePct}%</span><strong>−{formatMoney(quote.fee)}</strong></div>
              <div className="cpx-fin-order-total"><span>На рублёвый баланс</span><strong>{formatMoney(quote.net)}</strong></div>
            </div>
          )}
          {err && <p className="cpx-err">{err}</p>}
          {ok && <p className="cpx-fin-ok">{ok}</p>}
          <button type="submit" className="cpx-btn" disabled={selling || !quote}>
            {selling ? <><span className="cpx-spinner" /> Продаём…</> : 'Продать на баланс'}
          </button>
        </form>
      </div>

      <div className="cpx-card">
        <h2 className="cpx-fin-side-title">Вывод средств</h2>
        <p className="cpx-fin-side-sub">
          Доступно {formatMoney(rubBal)}. Банковский вывод (карта / СБП) — после Т-Банка и таблицы комиссий. A7/ПСБ пока не подключаем.
        </p>
        <form onSubmit={requestWithdraw} className="cpx-form cpx-fin-buy-form">
          <label className="cpx-field">
            <span className="cpx-field-label">Сумма вывода, ₽</span>
            <input inputMode="decimal" value={withdrawRub} onChange={(e) => setWithdrawRub(e.target.value)} placeholder="5000" />
          </label>
          <div className="cpx-fin-status-row">
            <span className="cpx-fin-badge cpx-fin-badge--pending">Ожидает интеграции</span>
            <span className="cpx-muted" style={{ fontSize: '0.75rem' }}>Модерация → выплата</span>
          </div>
          {withdrawNote && <p className="cpx-fin-ok" style={{ color: 'var(--text-muted)' }}>{withdrawNote}</p>}
          <button type="submit" className="cpx-btn cpx-btn--sm">Оставить заявку</button>
        </form>
      </div>
    </div>
  );
}

const DASH_TABS = [
  { key: 'overview', label: 'Обзор' },
  { key: 'buy', label: 'Купить' },
  { key: 'sell', label: 'Продать' },
  { key: 'benefit', label: 'Выгода' },
];

// ── Дашборд после одобрения ─────────────────────────────────────────────────
function FintechDashboard({ profile }) {
  const [portfolio, setPortfolio] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [view, setView] = useState('overview');
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [p, l] = await Promise.all([fintechApi.portfolio(), fintechApi.ledger(100)]);
      setPortfolio(p);
      setLedger(l.entries || []);
    } catch (e) {
      setErr(e?.message || 'Не удалось загрузить портфель');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function downloadStatement() {
    setPdfBusy(true);
    try {
      await openFintechStatementReport({
        clientName: profile.fullName,
        phoneMasked: profile.phoneMasked,
        portfolio,
        entries: ledger,
      });
    } finally {
      setPdfBusy(false);
    }
  }

  if (loading) return <div className="cpx-card cpx-muted"><span className="cpx-spinner" /> Загружаем портфель…</div>;
  if (err) return <div className="cpx-card"><p className="cpx-err">{err}</p><button type="button" className="cpx-btn cpx-btn--sm" onClick={load}>Повторить</button></div>;

  const firstName = String(profile?.fullName || '').trim().split(/\s+/)[1]
    || String(profile?.fullName || '').trim().split(/\s+/)[0]
    || '';

  return (
    <div className="cpx-finx">
      <div className="cpx-fin-hero">
        <div className="cpx-fin-hero-main">
          <p className="cpx-fin-greeting-sub">Reaktivo Invest · золотой счёт</p>
          <h2 className="cpx-fin-hero-title">{firstName ? `${firstName}, ваш портфель` : 'Ваш портфель'}</h2>
          <div className="cpx-fin-hero-value">
            <span className="cpx-fin-hero-value-num">{formatMoney(portfolio?.marketValueRub)}</span>
            <span className={`cpx-fin-hero-pnl ${(portfolio?.pnlRub ?? 0) >= 0 ? 'cpx-fin-pos' : 'cpx-fin-neg'}`}>
              {portfolio?.pnlRub != null ? `${portfolio.pnlRub >= 0 ? '+' : ''}${formatMoney(portfolio.pnlRub)}` : '—'}
              {portfolio?.pnlPercent != null && ` (${portfolio.pnlPercent > 0 ? '+' : ''}${portfolio.pnlPercent}%)`}
            </span>
          </div>
          <p className="cpx-fin-hero-meta">
            {formatGrams(portfolio?.goldGrams)} · вложено {formatMoney(portfolio?.investedRub)} · кэш {formatMoney(portfolio?.rubBalance)}
          </p>
        </div>
        <div className="cpx-fin-hero-actions">
          <button type="button" className="cpx-btn cpx-btn--sm" onClick={() => setView('buy')}>Купить</button>
          <button type="button" className="cpx-fin-pdf-btn" onClick={() => setView('sell')}>Продать</button>
          <button type="button" className="cpx-fin-pdf-btn" disabled={pdfBusy} onClick={downloadStatement}>
            {pdfBusy ? <><span className="cpx-spinner" /> …</> : 'Выписка PDF'}
          </button>
        </div>
      </div>

      <div className="cpx-fin-kpis">
        <div className="cpx-fin-kpi cpx-fin-kpi--hero">
          <span className="cpx-fin-kpi-label">Золото на счёте</span>
          <span className="cpx-fin-kpi-value">{formatGrams(portfolio?.goldGrams)}</span>
        </div>
        <div className="cpx-fin-kpi">
          <span className="cpx-fin-kpi-label">Стоимость</span>
          <span className="cpx-fin-kpi-value">{formatMoney(portfolio?.marketValueRub)}</span>
        </div>
        <div className="cpx-fin-kpi">
          <span className="cpx-fin-kpi-label">Вложено</span>
          <span className="cpx-fin-kpi-value">{formatMoney(portfolio?.investedRub)}</span>
        </div>
        <div className={`cpx-fin-kpi ${(portfolio?.pnlRub ?? 0) >= 0 ? 'cpx-fin-kpi--pos' : 'cpx-fin-kpi--neg'}`}>
          <span className="cpx-fin-kpi-label">Доход</span>
          <span className="cpx-fin-kpi-value">
            {formatMoney(portfolio?.pnlRub)}
            {portfolio?.pnlPercent != null && <span className="cpx-fin-kpi-pct"> ({portfolio.pnlPercent > 0 ? '+' : ''}{portfolio.pnlPercent}%)</span>}
          </span>
        </div>
        <div className="cpx-fin-kpi">
          <span className="cpx-fin-kpi-label">Рублёвый баланс</span>
          <span className="cpx-fin-kpi-value">{formatMoney(portfolio?.rubBalance)}</span>
        </div>
      </div>

      <nav className="cpx-fin-tabs" aria-label="Разделы инвестиций">
        {DASH_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`cpx-fin-tab${view === t.key ? ' cpx-fin-tab--on' : ''}`}
            onClick={() => setView(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {view === 'overview' && (
        <>
          <WorldClocksCard delay="0ms" className="cpx-fin-clocks" />
          <div className="cpx-fin-layout">
            <div className="cpx-fin-main">
              <GoldChartCard currentRate={portfolio?.currentRatePerGram} rateUpdatedAt={portfolio?.rateUpdatedAt} />
              <AssistantCard />
            </div>
            <aside className="cpx-fin-side">
              <div className="cpx-card cpx-fin-quick">
                <h2 className="cpx-fin-side-title">Быстрые действия</h2>
                <div className="cpx-fin-quick-grid">
                  <button type="button" className="cpx-fin-quick-btn" onClick={() => setView('buy')}>
                    <strong>Купить золото</strong>
                    <span>от 1 г или на сумму</span>
                  </button>
                  <button type="button" className="cpx-fin-quick-btn" onClick={() => setView('sell')}>
                    <strong>Продать / вывод</strong>
                    <span>на баланс или заявкой</span>
                  </button>
                  <button type="button" className="cpx-fin-quick-btn" onClick={() => setView('benefit')}>
                    <strong>Упущенная выгода</strong>
                    <span>анализ по курсу ЦБ</span>
                  </button>
                </div>
              </div>
              <MissedBenefitCard compact onOpenFull={() => setView('benefit')} />
              <div className="cpx-card cpx-fin-history-card">
                <h2 className="cpx-fin-side-title">Последние операции</h2>
                <LedgerList ledger={ledger} limit={8} />
              </div>
            </aside>
          </div>
        </>
      )}

      {view === 'buy' && (
        <div className="cpx-fin-layout">
          <div className="cpx-fin-main">
            <GoldChartCard currentRate={portfolio?.currentRatePerGram} rateUpdatedAt={portfolio?.rateUpdatedAt} />
          </div>
          <aside className="cpx-fin-side">
            <BuyPanel portfolio={portfolio} onDone={load} />
          </aside>
        </div>
      )}

      {view === 'sell' && <SellPanel portfolio={portfolio} onDone={load} />}

      {view === 'benefit' && <MissedBenefitCard />}
    </div>
  );
}
