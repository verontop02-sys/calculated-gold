import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fintechApi, getFintechToken, setFintechToken, onFintechSessionExpired } from './api.js';
import { openFintechStatementReport } from './fintechStatementReport.js';

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
    try {
      const p = await fintechApi.profile();
      setProfile(p);
      setPhase('app');
      setLoadErr('');
    } catch (e) {
      if (e?.status === 401) {
        setFintechToken('');
        setPhase('login');
      } else {
        setLoadErr(e?.message || 'Не удалось загрузить кабинет');
        setPhase('app');
      }
    }
  }, []);

  useEffect(() => {
    if (getFintechToken()) {
      loadProfile();
      return;
    }
    // Телефон уже подтверждён SMS-кодом в общем кабинете (клиент вошёл на /kabinet) —
    // не спрашиваем код повторно, тихо выпускаем fintech-сессию тем же номером.
    if (clientToken) {
      fintechApi
        .sessionFromClient(clientToken)
        .then(() => loadProfile())
        .catch(() => setPhase('login'));
      return;
    }
    setPhase('login');
  }, [loadProfile, clientToken]);

  // Сессия могла истечь не только при первой загрузке, но и в середине работы
  // (покупка, загрузка документа, обновление ledger) — в этом случае тихо возвращаем на вход.
  useEffect(() => onFintechSessionExpired(() => {
    setProfile(null);
    setPhase('login');
  }), []);

  // Пока документы на проверке — тихо обновляем статус, чтобы не заставлять жать «Обновить».
  useEffect(() => {
    if (profile?.status !== 'pending_review') return undefined;
    const id = setInterval(() => { void loadProfile(); }, 20_000);
    return () => clearInterval(id);
  }, [profile?.status, loadProfile]);

  if (phase === 'login') {
    return <FintechLogin onDone={loadProfile} />;
  }

  if (phase === 'checking') {
    return <div className="cpx-center"><span className="cpx-spinner" /> Загрузка…</div>;
  }

  if (loadErr) {
    return (
      <div className="cpx-card">
        <p className="cpx-err">{loadErr}</p>
        <button type="button" className="cpx-btn cpx-btn--sm" onClick={loadProfile}>Повторить</button>
      </div>
    );
  }

  if (!profile) return null;

  if (profile.status === 'new' || profile.status === 'rejected') {
    return <FintechOnboarding profile={profile} onUpdated={loadProfile} />;
  }
  if (profile.status === 'pending_review') {
    return <FintechPendingReview profile={profile} onRefresh={loadProfile} />;
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
            <input value={fullName} onChange={(e) => { setFullName(e.target.value); setInfoSaved(false); }} placeholder="Иванов Иван Иванович" />
          </label>
          <label className="cpx-field">
            <span className="cpx-field-label">Email (для выписок)</span>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setInfoSaved(false); }} placeholder="you@example.com" />
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
  const [points, setPoints] = useState(null); // null = loading, [] = error/empty
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
          <ResponsiveContainer width="100%" height={300}>
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

// ── AI-ассистент (Stage 10: Grok) ────────────────────────────────────────────
function AssistantCard() {
  const [data, setData] = useState(null); // { source, answer, forecast }
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

// ── Дашборд после одобрения ─────────────────────────────────────────────────
function FintechDashboard({ profile }) {
  const [portfolio, setPortfolio] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('rub'); // 'rub' | 'grams'
  const [amount, setAmount] = useState('');
  const [buying, setBuying] = useState(false);
  const [buyErr, setBuyErr] = useState('');
  const [buyOk, setBuyOk] = useState('');
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

  const estimate = useMemo(() => {
    const v = parseFloat(String(amount).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0 || !portfolio?.currentRatePerGram) return null;
    // Реальная комиссия приходит с сервера вместе с портфелем — расчёт совпадает с покупкой.
    const feeMult = 1 + (Number(portfolio?.buyFeePercent) || 0) / 100;
    if (mode === 'rub') {
      return { grams: v / (portfolio.currentRatePerGram * feeMult) };
    }
    return { rub: v * portfolio.currentRatePerGram * feeMult };
  }, [amount, mode, portfolio?.currentRatePerGram, portfolio?.buyFeePercent]);

  async function submitBuy(e) {
    e.preventDefault();
    setBuyErr('');
    setBuyOk('');
    const v = parseFloat(String(amount).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      setBuyErr('Укажите сумму или вес больше нуля');
      return;
    }
    setBuying(true);
    try {
      const payload = mode === 'rub'
        ? { rubAmount: v, idempotencyKey: crypto.randomUUID() }
        : { grams: v, idempotencyKey: crypto.randomUUID() };
      const out = await fintechApi.buy(payload);
      setBuyOk(`Куплено ${formatGrams(out.gramsBought)} за ${formatMoney(out.rubSpent)}`);
      setAmount('');
      await load();
    } catch (e2) {
      setBuyErr(e2?.message || 'Не удалось выполнить покупку');
    } finally {
      setBuying(false);
    }
  }

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

  const firstName = String(profile?.fullName || '').trim().split(/\s+/)[1] || String(profile?.fullName || '').trim().split(/\s+/)[0] || '';

  return (
    <div className="cpx-finx">
      <div className="cpx-fin-greeting">
        <div>
          <h2 className="cpx-fin-greeting-title">{firstName ? `${firstName}, ваш портфель` : 'Ваш портфель'}</h2>
          <p className="cpx-fin-greeting-sub">Reaktivo Invest · золотой счёт от 1 грамма</p>
        </div>
        <button type="button" className="cpx-fin-pdf-btn" disabled={pdfBusy} onClick={downloadStatement}>
          {pdfBusy ? <><span className="cpx-spinner" /> Готовим…</> : 'Выписка PDF'}
        </button>
      </div>

      <div className="cpx-fin-kpis">
        <div className="cpx-fin-kpi cpx-fin-kpi--hero">
          <span className="cpx-fin-kpi-label">Золото на счёте</span>
          <span className="cpx-fin-kpi-value">{formatGrams(portfolio?.goldGrams)}</span>
        </div>
        <div className="cpx-fin-kpi">
          <span className="cpx-fin-kpi-label">Стоимость портфеля</span>
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

      <div className="cpx-fin-layout">
        <div className="cpx-fin-main">
          <GoldChartCard currentRate={portfolio?.currentRatePerGram} rateUpdatedAt={portfolio?.rateUpdatedAt} />
        </div>

        <aside className="cpx-fin-side">
          <div className="cpx-card cpx-fin-buy-card">
            <h2 className="cpx-fin-side-title">Купить золото</h2>
            <p className="cpx-fin-side-sub">
              От 1 г или на любую сумму
              {portfolio?.buyFeePercent != null ? ` · комиссия ${portfolio.buyFeePercent}%` : ''}
            </p>
            <form onSubmit={submitBuy} className="cpx-form cpx-fin-buy-form">
              <div className="cpx-fin-mode-switch">
                <button type="button" className={`cpx-fin-mode-btn${mode === 'rub' ? ' cpx-fin-mode-btn--on' : ''}`} onClick={() => { setMode('rub'); setAmount(''); }}>В ₽</button>
                <button type="button" className={`cpx-fin-mode-btn${mode === 'grams' ? ' cpx-fin-mode-btn--on' : ''}`} onClick={() => { setMode('grams'); setAmount(''); }}>В г</button>
              </div>
              <label className="cpx-field">
                <span className="cpx-field-label">{mode === 'rub' ? 'Сумма, ₽' : 'Вес, г'}</span>
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={mode === 'rub' ? '10000' : '1.5'}
                />
              </label>
              {estimate && (
                <p className="cpx-fin-estimate">
                  {mode === 'rub' ? `≈ ${formatGrams(estimate.grams)}` : `≈ ${formatMoney(estimate.rub)}`}
                </p>
              )}
              {buyErr && <p className="cpx-err">{buyErr}</p>}
              {buyOk && <p className="cpx-fin-ok">{buyOk}</p>}
              <button type="submit" className="cpx-btn" disabled={buying}>
                {buying ? <><span className="cpx-spinner" /> Покупаем…</> : 'Купить'}
              </button>
            </form>
          </div>

          <div className="cpx-card cpx-fin-topup-hint">
            <span className="cpx-fin-topup-icon" aria-hidden>ℹ</span>
            <p>Пополнение — переводом по реквизитам. Баланс обновит модератор в течение рабочего дня.</p>
          </div>
        </aside>
      </div>

      <div className="cpx-fin-layout cpx-fin-layout--lower">
        <div className="cpx-fin-main">
          <AssistantCard />
        </div>
        <aside className="cpx-fin-side">
          <div className="cpx-card cpx-fin-history-card">
            <h2 className="cpx-fin-side-title">История операций</h2>
            {ledger.length === 0 && <p className="cpx-muted" style={{ margin: 0 }}>Операций пока нет.</p>}
            <div className="cpx-fin-ledger-list">
              {ledger.slice(0, 12).map((e) => (
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
          </div>
        </aside>
      </div>
    </div>
  );
}
