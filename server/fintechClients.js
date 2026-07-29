/**
 * Клиентский fintech-кабинет: регистрация по телефону+SMS, профиль, KYC-документы.
 *
 * Отдельная сущность от scrap_customers/scrap_deals — это другая бизнес-линия
 * (инвестиции в золото, а не скупка лома). Вход переиспользует OTP-примитивы
 * clientPortal.js, но создаёт fintech_clients самостоятельно (без требования,
 * что телефон уже встречался в сделках).
 *
 * Сессия — отдельный stateless HMAC-токен (typ: 'fintech'), несовместимый
 * с токеном кабинета скупки — токены разных модулей нельзя перепутать.
 */
import crypto from 'crypto';
import { sendDealConfirmationSms } from './smsSend.js';
import { assertClientAccessAllowed } from './registrationGate.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REQUIRED_DOC_TYPES = ['passport_main', 'selfie'];
const DOC_TYPE_LABELS = {
  passport_main: 'паспорт (разворот с фото)',
  passport_registration: 'паспорт (страница с регистрацией)',
  selfie: 'селфи с паспортом',
};

function secretPepper() {
  const p = (process.env.FIELD_DEAL_CODE_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-only').trim();
  return p.slice(0, 64);
}

function hashOtp(code) {
  return crypto.createHmac('sha256', secretPepper()).update(String(code).trim()).digest('hex');
}

function generateOtp6() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function normalizeFintechPhone(v) {
  const digits = String(v || '').replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) return digits.slice(1);
  if (digits.length === 10) return digits;
  return '';
}

function maskPhone(normalized) {
  const d = String(normalized || '');
  return d.length >= 4 ? `+7 ••• ••• ${d.slice(-4).slice(0, 2)} ${d.slice(-2)}` : '+7 •••';
}

// ── KV-хелперы (app_kv), тот же паттерн, что в clientPortal.js/deviceTrust.js ──
async function kvGet(supabase, key) {
  const { data, error } = await supabase.from('app_kv').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}
async function kvSet(supabase, key, value) {
  const { error } = await supabase.from('app_kv').upsert({ key, value }, { onConflict: 'key' });
  if (error) throw error;
}
async function kvDel(supabase, key) {
  await supabase.from('app_kv').delete().eq('key', key);
}
function otpKey(phoneNormalized) {
  return `fintech_otp:${phoneNormalized}`;
}

// ── Stateless HMAC-токен сессии fintech-кабинета ────────────────────────────
function signFintechToken(clientId, phoneNormalized) {
  const payload = { typ: 'fintech', cid: clientId, ph: phoneNormalized, exp: Date.now() + TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secretPepper()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyFintechToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secretPepper()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload?.typ !== 'fintech' || !payload?.cid || !payload?.exp) return null;
  if (Date.now() > Number(payload.exp)) return null;
  return { clientId: String(payload.cid), phoneNormalized: String(payload.ph || '') };
}

// ── Регистрация / вход по телефону ──────────────────────────────────────────
async function getOrCreateClient(supabase, phoneNormalized) {
  const { data: existing, error: selErr } = await supabase
    .from('fintech_clients')
    .select('id, status')
    .eq('phone_normalized', phoneNormalized)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing;

  // Защита от гонки: между early-check выше и этим insert телефон всё ещё не должен
  // проскочить создание аккаунта, если регистрация закрыта и номер не в списке.
  await assertClientAccessAllowed(supabase, phoneNormalized);

  const { data: created, error: insErr } = await supabase
    .from('fintech_clients')
    .insert({ phone_normalized: phoneNormalized, status: 'new' })
    .select('id, status')
    .single();
  if (insErr) throw insErr;
  return created;
}

export async function requestFintechCode(supabase, { phone, origin }) {
  const phoneNormalized = normalizeFintechPhone(phone);
  if (!phoneNormalized) {
    const err = new Error('Укажите корректный номер телефона (РФ, 10 цифр)');
    err.status = 400;
    throw err;
  }

  // Отсекаем новые номера до отправки SMS — не тратим лимит и сразу даём понятный ответ.
  await assertClientAccessAllowed(supabase, phoneNormalized);

  const existing = await kvGet(supabase, otpKey(phoneNormalized));
  if (existing?.sentAt && Date.now() - new Date(existing.sentAt).getTime() < OTP_RESEND_COOLDOWN_MS) {
    const err = new Error('Код уже отправлен. Подождите минуту перед повторной отправкой.');
    err.status = 429;
    throw err;
  }

  const code = generateOtp6();
  await kvSet(supabase, otpKey(phoneNormalized), {
    codeHash: hashOtp(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    attempts: 0,
    sentAt: new Date().toISOString(),
  });

  const base = String(origin || process.env.PUBLIC_APP_ORIGIN || '').trim().replace(/\/$/, '');
  const link = base ? ` Кабинет: ${base}/invest` : '';
  const text = `REAKTIVO код ${code}.${link}`;

  let smsOk = true;
  try {
    await sendDealConfirmationSms({ to: `+7${phoneNormalized}`, text });
  } catch (e) {
    smsOk = false;
    if (e?.status === 402) throw e;
  }

  const out = { ok: true, phoneMasked: maskPhone(phoneNormalized), smsOk };
  // Только для локальной приёмки: FINTECH_OTP_RETURN_CODE=1 возвращает код в ответе (в prod НЕ включать!).
  if (process.env.FINTECH_OTP_RETURN_CODE === '1') out.debugCode = code;
  return out;
}

/**
 * Клиент уже подтвердил этот номер телефона SMS-кодом в общем кабинете (клиент-портал,
 * калькулятор/сделки) — тот же человек, тот же телефон. Чтобы не заставлять его вводить
 * SMS-код повторно при первом открытии вкладки «Инвестиции», молча выпускаем fintech-сессию
 * на основании уже верифицированного clientApi-токена (без нового OTP).
 */
export async function exchangeClientSessionForFintech(supabase, { phoneNormalized }) {
  const norm = normalizeFintechPhone(phoneNormalized);
  if (!norm) {
    const err = new Error('Некорректный номер телефона');
    err.status = 400;
    throw err;
  }
  const client = await getOrCreateClient(supabase, norm);
  return {
    ok: true,
    token: signFintechToken(client.id, norm),
    phoneMasked: maskPhone(norm),
    status: client.status,
  };
}

export async function verifyFintechCode(supabase, { phone, code }) {
  const phoneNormalized = normalizeFintechPhone(phone);
  if (!phoneNormalized) {
    const err = new Error('Укажите корректный номер телефона');
    err.status = 400;
    throw err;
  }
  const codeDigits = String(code || '').replace(/\D/g, '');
  if (codeDigits.length !== 6) {
    const err = new Error('Введите 6 цифр из СМС');
    err.status = 400;
    throw err;
  }

  const stored = await kvGet(supabase, otpKey(phoneNormalized));
  if (!stored?.codeHash) {
    const err = new Error('Код не запрашивался или истёк. Запросите новый.');
    err.status = 400;
    throw err;
  }
  if (Date.now() > new Date(stored.expiresAt).getTime()) {
    await kvDel(supabase, otpKey(phoneNormalized));
    const err = new Error('Код истёк. Запросите новый.');
    err.status = 400;
    throw err;
  }
  if ((stored.attempts || 0) >= OTP_MAX_ATTEMPTS) {
    await kvDel(supabase, otpKey(phoneNormalized));
    const err = new Error('Слишком много попыток. Запросите новый код.');
    err.status = 429;
    throw err;
  }
  if (hashOtp(codeDigits) !== stored.codeHash) {
    await kvSet(supabase, otpKey(phoneNormalized), { ...stored, attempts: (stored.attempts || 0) + 1 });
    const left = OTP_MAX_ATTEMPTS - ((stored.attempts || 0) + 1);
    const err = new Error(left > 0 ? `Неверный код. Осталось попыток: ${left}` : 'Неверный код. Запросите новый.');
    err.status = 400;
    throw err;
  }

  await kvDel(supabase, otpKey(phoneNormalized));
  const client = await getOrCreateClient(supabase, phoneNormalized);
  return {
    ok: true,
    token: signFintechToken(client.id, phoneNormalized),
    phoneMasked: maskPhone(phoneNormalized),
    status: client.status,
  };
}

// ── Профиль клиента ──────────────────────────────────────────────────────────
export async function getClientProfile(supabase, clientId) {
  const { data: client, error } = await supabase
    .from('fintech_clients')
    .select('id, phone_normalized, email, full_name, status, reject_reason, created_at')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!client) {
    const err = new Error('Клиент не найден');
    err.status = 404;
    throw err;
  }

  const { data: docs, error: docsErr } = await supabase
    .from('fintech_kyc_documents')
    .select('id, doc_type, status, reject_reason, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (docsErr) throw docsErr;

  return {
    id: client.id,
    phoneMasked: maskPhone(client.phone_normalized),
    // Полный номер собственной сессии — чтобы кабинет мог сверить владельца
    // fintech-токена с владельцем клиентской сессии (fix «чужой кабинет»).
    phoneNormalized: client.phone_normalized,
    email: client.email,
    fullName: client.full_name,
    status: client.status,
    rejectReason: client.reject_reason,
    createdAt: client.created_at,
    documents: (docs || []).map((d) => ({
      id: d.id,
      docType: d.doc_type,
      status: d.status,
      rejectReason: d.reject_reason,
      createdAt: d.created_at,
    })),
  };
}

export async function updateClientContactInfo(supabase, clientId, { fullName, email }) {
  const patch = { updated_at: new Date().toISOString() };
  if (fullName != null) patch.full_name = String(fullName).trim().slice(0, 200) || null;
  if (email != null) {
    const e = String(email).trim().slice(0, 200);
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      const err = new Error('Некорректный email');
      err.status = 400;
      throw err;
    }
    patch.email = e || null;
  }
  const { error } = await supabase.from('fintech_clients').update(patch).eq('id', clientId);
  if (error) throw error;
  return { ok: true };
}

// ── KYC-документы ─────────────────────────────────────────────────────────────
const MAX_DOC_BYTES = 8 * 1024 * 1024;

export async function uploadKycDocument(supabase, { clientId, docType, base64, mimeType }) {
  if (!['passport_main', 'passport_registration', 'selfie'].includes(docType)) {
    const err = new Error('Некорректный тип документа');
    err.status = 400;
    throw err;
  }
  const raw = String(base64 || '');
  if (!raw) {
    const err = new Error('Файл не передан');
    err.status = 400;
    throw err;
  }
  const buf = Buffer.from(raw.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!buf.length || buf.length > MAX_DOC_BYTES) {
    const err = new Error('Файл слишком большой (максимум 8 МБ) или повреждён');
    err.status = 400;
    throw err;
  }

  const ext = /png/i.test(mimeType) ? 'png' : /pdf/i.test(mimeType) ? 'pdf' : /webp/i.test(mimeType) ? 'webp' : 'jpg';
  const path = `${clientId}/${docType}-${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('kyc-documents')
    .upload(path, buf, { contentType: mimeType || 'image/jpeg', upsert: true });
  if (upErr) throw new Error(`Ошибка загрузки документа: ${upErr.message}`);

  const { data: doc, error: insErr } = await supabase
    .from('fintech_kyc_documents')
    .insert({ client_id: clientId, doc_type: docType, storage_path: path, status: 'pending' })
    .select('id, doc_type, status, created_at')
    .single();
  if (insErr) throw insErr;

  // Статус клиента НЕ переключаем здесь: пока не загружены все обязательные документы
  // и не нажата явная «Отправить на проверку» (submitForReview), заявка не должна улетать
  // модератору. Снимаем только старую причину отказа, чтобы не путать клиента при новой попытке.
  await supabase
    .from('fintech_clients')
    .update({ reject_reason: null, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .eq('status', 'rejected');

  return { id: doc.id, docType: doc.doc_type, status: doc.status, createdAt: doc.created_at };
}

export async function submitForReview(supabase, clientId) {
  // ФИО обязательно — без него модератору не с чем сверять паспорт.
  const { data: clientRow, error: cliErr } = await supabase
    .from('fintech_clients')
    .select('full_name')
    .eq('id', clientId)
    .maybeSingle();
  if (cliErr) throw cliErr;
  if (!String(clientRow?.full_name || '').trim()) {
    const err = new Error('Укажите ФИО в данных для регистрации — оно нужно для сверки с паспортом');
    err.status = 400;
    throw err;
  }

  const { data: docs, error } = await supabase
    .from('fintech_kyc_documents')
    .select('doc_type')
    .eq('client_id', clientId)
    .neq('status', 'rejected');
  if (error) throw error;
  const types = new Set((docs || []).map((d) => d.doc_type));
  const missing = REQUIRED_DOC_TYPES.filter((t) => !types.has(t));
  if (missing.length) {
    const err = new Error(`Загрузите документы: ${missing.map((t) => DOC_TYPE_LABELS[t] || t).join(', ')}`);
    err.status = 400;
    throw err;
  }
  const { error: upErr } = await supabase
    .from('fintech_clients')
    .update({ status: 'pending_review', updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .in('status', ['new', 'rejected']);
  if (upErr) throw upErr;
  return { ok: true, status: 'pending_review' };
}
