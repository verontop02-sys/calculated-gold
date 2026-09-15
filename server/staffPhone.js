/**
 * Мобильный сотрудника: код подтверждения входа с нового устройства
 * уходит SMS на этот номер (не на почту).
 *
 * Перед сохранением номера (регистрация сотрудника или смена телефона)
 * тот же 6-значный код должен прийти SMS на этот номер — иначе любой мог бы
 * привязать чужой телефон.
 *
 * Источник истины — user_metadata.phone (10 цифр). Auth.phone пишем, если
 * провайдер телефона в Supabase включён; profiles.phone_normalized — кэш.
 */
import crypto from 'crypto';
import { sendDealConfirmationSms } from './smsSend.js';

export function normalizeStaffPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  let ten = '';
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    ten = digits.slice(1);
  } else if (digits.length === 10) {
    ten = digits;
  }
  if (ten.length === 10 && ten.startsWith('9')) return ten;
  return '';
}

export function parseStaffPhone(raw) {
  const normalized = normalizeStaffPhone(raw);
  if (!normalized) {
    return { ok: false, error: 'Укажите российский мобильный: +7 9XX XXX-XX-XX' };
  }
  return { ok: true, normalized };
}

export function maskStaffPhone(normalized) {
  const d = String(normalized || '');
  if (d.length < 4) return 'телефон';
  return `+7 ••• •••-${d.slice(-4, -2)}-${d.slice(-2)}`;
}

export function formatStaffPhonePretty(normalized) {
  const d = String(normalized || '');
  if (d.length !== 10) return '';
  return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
}

export function staffPhoneE164(normalized) {
  const d = normalizeStaffPhone(normalized);
  return d ? `+7${d}` : '';
}

function phoneFromAuthUser(u) {
  if (!u) return '';
  return normalizeStaffPhone(u.phone) || normalizeStaffPhone(u.user_metadata?.phone);
}

export async function readStaffPhoneNormalized(supabase, user) {
  const fromGiven = phoneFromAuthUser(user);
  if (fromGiven) return fromGiven;
  if (!user?.id) return '';
  try {
    const { data } = await supabase.auth.admin.getUserById(user.id);
    const fromAdmin = phoneFromAuthUser(data?.user);
    if (fromAdmin) return fromAdmin;
  } catch (e) {
    console.warn('[staff phone read auth]', e?.message || e);
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('phone_normalized')
    .eq('id', user.id)
    .maybeSingle();
  if (error) return '';
  return normalizeStaffPhone(data?.phone_normalized);
}

export async function saveStaffPhone(supabase, uid, normalizedOrNull) {
  const normalized = normalizedOrNull ? normalizeStaffPhone(normalizedOrNull) : '';
  if (normalizedOrNull && !normalized) {
    const err = new Error('Укажите российский мобильный: +7 9XX XXX-XX-XX');
    err.status = 400;
    throw err;
  }

  const { data: got, error: gErr } = await supabase.auth.admin.getUserById(uid);
  if (gErr) throw gErr;
  const meta = { ...(got.user?.user_metadata || {}) };
  if (normalized) meta.phone = normalized;
  else delete meta.phone;

  const patch = { user_metadata: meta };
  if (normalized) {
    patch.phone = `+7${normalized}`;
    patch.phone_confirm = true;
  }

  const { error: uErr } = await supabase.auth.admin.updateUserById(uid, patch);
  if (uErr) {
    const msg = String(uErr.message || '');
    if (normalized && /phone/i.test(msg)) {
      const { error: mErr } = await supabase.auth.admin.updateUserById(uid, { user_metadata: meta });
      if (mErr) throw mErr;
    } else {
      throw uErr;
    }
  }

  const { error: pErr } = await supabase
    .from('profiles')
    .update({
      phone_normalized: normalized || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', uid);
  if (pErr && !/phone_normalized|schema cache|column|could not find/i.test(pErr.message || '')) {
    console.warn('[staff phone profiles]', pErr.message);
  }

  return normalized;
}

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function secretPepper() {
  const p = (process.env.FIELD_DEAL_CODE_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-only').trim();
  return p.slice(0, 64);
}

function hmac(value) {
  return crypto.createHmac('sha256', secretPepper()).update(String(value)).digest('hex');
}

export function staffPhoneOtpHash(codeDigits) {
  return hmac(String(codeDigits || '').replace(/\D/g, ''));
}

function generateOtp6() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

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

export function staffPhoneBindOtpKey(requesterId, phoneNormalized) {
  return `staff_phone_bind:${requesterId}:${phoneNormalized}`;
}

export function evaluateStaffPhoneBindAttempt(stored, codeDigits, now = Date.now()) {
  const digits = String(codeDigits || '').replace(/\D/g, '');
  if (digits.length !== 6) {
    return { ok: false, status: 400, message: 'Введите 6 цифр из СМС' };
  }
  if (!stored?.codeHash) {
    return { ok: false, status: 400, message: 'Код не запрашивался или истёк. Запросите новый.' };
  }
  if (now > new Date(stored.expiresAt).getTime()) {
    return { ok: false, status: 400, message: 'Код истёк. Запросите новый.', expired: true };
  }
  if ((stored.attempts || 0) >= OTP_MAX_ATTEMPTS) {
    return { ok: false, status: 429, message: 'Слишком много попыток. Запросите новый код.', locked: true };
  }
  if (staffPhoneOtpHash(digits) !== stored.codeHash) {
    const attempts = (stored.attempts || 0) + 1;
    const left = OTP_MAX_ATTEMPTS - attempts;
    return {
      ok: false,
      status: 400,
      message: left > 0 ? `Неверный код. Осталось попыток: ${left}` : 'Неверный код. Запросите новый.',
      nextStored: { ...stored, attempts },
      locked: left <= 0,
    };
  }
  return { ok: true };
}

function fail(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

/** SMS на номер, который сотрудник хочет привязать (регистрация / смена телефона). */
export async function requestStaffPhoneBindCode(supabase, { requesterId, phone }) {
  if (!requesterId) fail('Нет пользователя');
  const parsed = parseStaffPhone(phone);
  if (!parsed.ok) fail(parsed.error);

  const destMasked = maskStaffPhone(parsed.normalized);
  const key = staffPhoneBindOtpKey(requesterId, parsed.normalized);
  const existing = await kvGet(supabase, key);
  if (existing?.sentAt && Date.now() - new Date(existing.sentAt).getTime() < OTP_RESEND_COOLDOWN_MS) {
    return {
      ok: true,
      codeSent: true,
      cooldown: true,
      channel: 'sms',
      destMasked: existing.destMasked || destMasked,
      phoneMasked: existing.destMasked || destMasked,
    };
  }

  const code = generateOtp6();
  await kvSet(supabase, key, {
    codeHash: hmac(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    attempts: 0,
    sentAt: new Date().toISOString(),
    destMasked,
    phoneNormalized: parsed.normalized,
  });

  try {
    await sendDealConfirmationSms({
      to: staffPhoneE164(parsed.normalized),
      text: `REAKTIVO PRO: ${code} — код подтверждения номера. Никому не сообщайте. 10 мин.`,
    });
  } catch (e) {
    await kvDel(supabase, key);
    const err = new Error(
      e?.publicMessage || 'Не удалось отправить SMS с кодом. Попробуйте ещё раз через минуту.'
    );
    err.status = e?.status || 502;
    throw err;
  }

  const out = {
    ok: true,
    codeSent: true,
    channel: 'sms',
    destMasked,
    phoneMasked: destMasked,
  };
  if (process.env.DEVICE_TRUST_RETURN_CODE === '1' || process.env.STAFF_PHONE_OTP_RETURN_CODE === '1') {
    out.debugCode = code;
  }
  return out;
}

/** Проверяет SMS-код. При успехе OTP сгорает, возвращает нормализованный номер. */
export async function consumeStaffPhoneBindCode(supabase, { requesterId, phone, code }) {
  if (!requesterId) fail('Нет пользователя');
  const parsed = parseStaffPhone(phone);
  if (!parsed.ok) fail(parsed.error);

  const key = staffPhoneBindOtpKey(requesterId, parsed.normalized);
  const stored = await kvGet(supabase, key);
  const result = evaluateStaffPhoneBindAttempt(stored, code);
  if (!result.ok) {
    if (result.expired || result.locked) await kvDel(supabase, key);
    else if (result.nextStored) await kvSet(supabase, key, result.nextStored);
    fail(result.message, result.status);
  }
  await kvDel(supabase, key);
  return parsed.normalized;
}
