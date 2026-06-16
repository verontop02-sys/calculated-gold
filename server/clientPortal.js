/**
 * Клиентский кабинет: самостоятельный вход по телефону + SMS-код.
 *
 * Хранилище OTP — таблица app_kv (ключ client_otp:<phone>), без отдельной миграции.
 * Сессия — stateless HMAC-токен (подпись секретом сервера), срок 30 дней.
 * Доступ: войти может любой, чей телефон уже есть в scrap_deals.phone_normalized.
 */
import crypto from 'crypto';
import { sendDealConfirmationSms } from './smsSend.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

export function normalizeClientPhone(v) {
  const digits = String(v || '').replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return digits.slice(1);
  }
  if (digits.length === 10) return digits;
  return '';
}

function maskPhone(normalized) {
  const d = String(normalized || '');
  return d.length >= 4 ? `+7 ••• ••• ${d.slice(-4).slice(0, 2)} ${d.slice(-2)}` : '+7 •••';
}

// ── KV-хелперы на app_kv ───────────────────────────────────────────────────
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
  return `client_otp:${phoneNormalized}`;
}

// ── Stateless HMAC-токен сессии ─────────────────────────────────────────────
function signClientToken(phoneNormalized) {
  const payload = { ph: phoneNormalized, exp: Date.now() + TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secretPepper()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyClientToken(token) {
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
  if (!payload?.ph || !payload?.exp || Date.now() > Number(payload.exp)) return null;
  return { phoneNormalized: String(payload.ph) };
}

async function phoneExistsInDeals(supabase, phoneNormalized) {
  const { data, error } = await supabase
    .from('scrap_deals')
    .select('id')
    .eq('phone_normalized', phoneNormalized)
    .limit(1)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return !!data?.id;
}

// ── Запрос кода ─────────────────────────────────────────────────────────────
export async function requestClientCode(supabase, { phone, origin }) {
  const phoneNormalized = normalizeClientPhone(phone);
  if (!phoneNormalized) {
    const err = new Error('Укажите корректный номер телефона (РФ, 10 цифр)');
    err.status = 400;
    throw err;
  }

  const exists = await phoneExistsInDeals(supabase, phoneNormalized);
  if (!exists) {
    const err = new Error('По этому номеру сделок не найдено. Обратитесь к сотруднику.');
    err.status = 404;
    throw err;
  }

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
    maxAttempts: OTP_MAX_ATTEMPTS,
    sentAt: new Date().toISOString(),
  });

  const base = String(origin || process.env.PUBLIC_APP_ORIGIN || '').trim().replace(/\/$/, '');
  const link = base ? ` Кабинет: ${base}/kabinet` : '';
  const text = `REAKTIVO код ${code}.${link}`;

  let smsOk = true;
  try {
    await sendDealConfirmationSms({ to: `+7${phoneNormalized}`, text });
  } catch (e) {
    smsOk = false;
    if (e?.status === 402) throw e;
  }

  return { ok: true, phoneMasked: maskPhone(phoneNormalized), smsOk };
}

// ── Проверка кода ───────────────────────────────────────────────────────────
export async function verifyClientCode(supabase, { phone, code }) {
  const phoneNormalized = normalizeClientPhone(phone);
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
  if ((stored.attempts || 0) >= (stored.maxAttempts || OTP_MAX_ATTEMPTS)) {
    await kvDel(supabase, otpKey(phoneNormalized));
    const err = new Error('Слишком много попыток. Запросите новый код.');
    err.status = 429;
    throw err;
  }

  if (hashOtp(codeDigits) !== stored.codeHash) {
    await kvSet(supabase, otpKey(phoneNormalized), { ...stored, attempts: (stored.attempts || 0) + 1 });
    const left = (stored.maxAttempts || OTP_MAX_ATTEMPTS) - ((stored.attempts || 0) + 1);
    const err = new Error(left > 0 ? `Неверный код. Осталось попыток: ${left}` : 'Неверный код. Запросите новый.');
    err.status = 400;
    throw err;
  }

  await kvDel(supabase, otpKey(phoneNormalized));
  return {
    ok: true,
    token: signClientToken(phoneNormalized),
    phoneMasked: maskPhone(phoneNormalized),
  };
}

// ── Данные кабинета ─────────────────────────────────────────────────────────
function sanitizeDealRow(r) {
  return {
    itemName: String(r?.itemName || '').trim() || null,
    metal: String(r?.metal || '').trim() || null,
    probe: String(r?.probe || '').trim() || null,
    weightGross: r?.weightGross ?? r?.weight_gross ?? null,
    weightNet: r?.weightNet ?? r?.weight_net ?? null,
    priceRub: (() => {
      const raw = r?.priceRub;
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(/\s/g, '').replace(',', '.'));
      return Number.isFinite(n) ? Math.round(n) : null;
    })(),
  };
}

export async function getClientDeals(supabase, phoneNormalized) {
  const { data, error } = await supabase
    .from('scrap_deals')
    .select('id, contract_no, total_rub, created_at, first_probe, first_weight_gross, first_weight_net, rows')
    .eq('phone_normalized', phoneNormalized)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  const deals = (data || []).map((d) => ({
    id: d.id,
    contractNo: d.contract_no || null,
    totalRub: Number(d.total_rub) || 0,
    createdAt: d.created_at,
    firstProbe: d.first_probe ?? null,
    firstWeightGross: d.first_weight_gross ?? null,
    firstWeightNet: d.first_weight_net ?? null,
    rows: Array.isArray(d.rows) ? d.rows.map(sanitizeDealRow) : [],
  }));

  const totalRub = deals.reduce((s, d) => s + (d.totalRub || 0), 0);
  return {
    phoneMasked: maskPhone(phoneNormalized),
    dealsCount: deals.length,
    totalRub,
    deals,
  };
}
