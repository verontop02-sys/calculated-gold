/**
 * Доверенные устройства сотрудников панели.
 *
 * Пароль знает Supabase Auth, но при первом входе с незнакомого устройства
 * дополнительно требуем одноразовый код из письма (Resend). Устройство
 * запоминается (panel_trusted_devices), дальше вход как обычно.
 *
 * OTP — в app_kv (ключ panel_device_otp:<userId>:<deviceHash>), как у клиентского кабинета.
 * Все события пишутся в panel_login_events — журнал входов (задел под этап 9).
 */
import crypto from 'crypto';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const TRUST_MEM_TTL_MS = 5 * 60 * 1000;

/** Проверку можно выключить одной переменной, если что-то пойдёт не так в бою. */
export function deviceTrustEnabled() {
  return process.env.DEVICE_TRUST_ENFORCE !== '0';
}

function secretPepper() {
  const p = (process.env.FIELD_DEAL_CODE_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-only').trim();
  return p.slice(0, 64);
}

function hmac(value) {
  return crypto.createHmac('sha256', secretPepper()).update(String(value)).digest('hex');
}

function generateOtp6() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Сырой токен устройства из заголовка → серверный хеш. Токен в БД не храним. */
export function deviceHashFromReq(req) {
  const raw = String(req.headers['x-device-token'] || '').trim();
  if (raw.length < 16 || raw.length > 200) return null;
  return hmac(raw);
}

export function maskEmail(email) {
  const s = String(email || '').trim();
  const at = s.indexOf('@');
  if (at < 1) return '•••';
  const name = s.slice(0, at);
  const domain = s.slice(at + 1);
  const nameMasked = name.length <= 2 ? `${name[0]}•` : `${name[0]}•••${name[name.length - 1]}`;
  const dotIdx = domain.lastIndexOf('.');
  const domainBase = dotIdx > 0 ? domain.slice(0, dotIdx) : domain;
  const tld = dotIdx > 0 ? domain.slice(dotIdx) : '';
  const domainMasked = domainBase.length <= 2 ? `${domainBase[0]}•` : `${domainBase[0]}•••`;
  return `${nameMasked}@${domainMasked}${tld}`;
}

// ── KV-хелперы (app_kv) ──────────────────────────────────────────────────────
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

function otpKey(userId, deviceHash) {
  return `panel_device_otp:${userId}:${deviceHash}`;
}

// ── Журнал входов ────────────────────────────────────────────────────────────
export async function logLoginEvent(supabase, { userId, email, eventType, ip, userAgent, deviceHash, detail }) {
  try {
    await supabase.from('panel_login_events').insert({
      user_id: userId || null,
      email: email || null,
      event_type: eventType,
      ip: ip ? String(ip).slice(0, 45) : null,
      user_agent: userAgent ? String(userAgent).slice(0, 300) : null,
      device_hash: deviceHash || null,
      detail: detail || {},
    });
  } catch (e) {
    console.warn('[login events]', e?.message || e);
  }
}

// ── Кэш доверия в памяти (чтобы не ходить в БД на каждый запрос) ────────────
const trustMem = new Map(); // `${userId}:${deviceHash}` -> ts

function trustMemKey(userId, deviceHash) {
  return `${userId}:${deviceHash}`;
}

export function rememberTrusted(userId, deviceHash) {
  trustMem.set(trustMemKey(userId, deviceHash), Date.now());
  if (trustMem.size > 5000) {
    const cutoff = Date.now() - TRUST_MEM_TTL_MS;
    for (const [k, ts] of trustMem) {
      if (ts < cutoff) trustMem.delete(k);
    }
  }
}

/** Доверено ли устройство пользователю. Кэш 5 мин + ленивое обновление last_seen_at. */
export async function isDeviceTrusted(supabase, userId, deviceHash) {
  if (!deviceHash) return false;
  const memTs = trustMem.get(trustMemKey(userId, deviceHash));
  if (memTs && Date.now() - memTs < TRUST_MEM_TTL_MS) return true;

  const { data, error } = await supabase
    .from('panel_trusted_devices')
    .select('id')
    .eq('user_id', userId)
    .eq('device_hash', deviceHash)
    .maybeSingle();
  if (error) {
    console.warn('[device trust]', error.message);
    // При сбое БД не запираем панель — пароль уже проверен Supabase Auth.
    return true;
  }
  if (!data?.id) return false;

  rememberTrusted(userId, deviceHash);
  void supabase
    .from('panel_trusted_devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {}, () => {});
  return true;
}

// ── Письмо с кодом ───────────────────────────────────────────────────────────
function buildCodeEmailHtml({ code, userAgent }) {
  const ua = String(userAgent || '').slice(0, 120);
  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Код входа REAKTIVO PRO</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:32px 0;">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(20,22,40,0.10);">
      <tr>
        <td style="background:linear-gradient(135deg,#ff2a2a 0%,#fe0000 55%,#c40000 100%);padding:26px 30px;text-align:center;">
          <p style="margin:0;font-size:21px;font-weight:800;color:#ffffff;letter-spacing:0.09em;">REAKTIVO <span style="opacity:0.85;">PRO</span></p>
          <p style="margin:6px 0 0;font-size:12px;color:#ffffff;opacity:0.85;">Подтверждение входа с нового устройства</p>
        </td>
      </tr>
      <tr>
        <td style="padding:26px 30px 8px;">
          <p style="margin:0;font-size:14px;color:#16181d;line-height:1.55;">
            Кто-то входит в панель Reaktivo.PRO с вашим паролем на новом устройстве.
            Если это вы — введите код ниже. Код действует 10 минут.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 30px;">
          <div style="background:#faf6f6;border:1px solid #f1dedd;border-radius:14px;padding:18px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9aa0aa;text-transform:uppercase;letter-spacing:0.1em;">Код подтверждения</p>
            <p style="margin:8px 0 0;font-size:34px;font-weight:800;color:#fe0000;letter-spacing:0.28em;font-family:monospace;">${code}</p>
          </div>
        </td>
      </tr>
      ${ua ? `<tr><td style="padding:0 30px 8px;"><p style="margin:0;font-size:12px;color:#9aa0aa;line-height:1.5;">Устройство: ${ua}</p></td></tr>` : ''}
      <tr>
        <td style="padding:8px 30px 24px;">
          <p style="margin:0;font-size:12.5px;color:#8a8f99;line-height:1.55;">
            Если вход выполняете не вы — <strong style="color:#16181d;">не сообщайте код никому</strong> и срочно смените пароль.
          </p>
        </td>
      </tr>
      <tr>
        <td style="background:#faf9fa;padding:14px 30px;border-top:1px solid #ecedf1;text-align:center;">
          <p style="margin:0;font-size:11px;color:#aab0ba;">Автоматическое письмо REAKTIVO PRO. Отвечать не нужно.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function emailConfigured() {
  return Boolean((process.env.RESEND_API_KEY || '').trim() && (process.env.DEAL_RECEIPT_EMAIL_FROM || '').trim());
}

async function sendCodeEmail({ toEmail, code, userAgent }) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  const from = (process.env.DEAL_RECEIPT_EMAIL_FROM || '').trim();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [toEmail],
      subject: `Код входа REAKTIVO PRO: ${code}`,
      html: buildCodeEmailHtml({ code, userAgent }),
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const err = new Error(j?.message || `Resend HTTP ${res.status}`);
    err.body = j;
    throw err;
  }
}

// ── Основные операции ────────────────────────────────────────────────────────

/**
 * Проверка устройства после входа по паролю.
 * Доверено → { trusted: true }. Нет → отправляем код и { trusted: false, codeSent }.
 */
export async function checkDeviceAndMaybeSendCode(supabase, { user, deviceHash, ip, userAgent }) {
  if (!deviceHash) {
    const err = new Error('Не передан токен устройства. Обновите страницу и войдите снова.');
    err.status = 400;
    throw err;
  }

  if (await isDeviceTrusted(supabase, user.id, deviceHash)) {
    return { trusted: true };
  }

  // Без настроенной почты коды слать некуда — не запираем сотрудников,
  // просто доверяем устройству и фиксируем это в журнале.
  if (!emailConfigured()) {
    await trustDevice(supabase, { user, deviceHash, ip, userAgent, detail: { auto: 'email_not_configured' } });
    return { trusted: true, autoTrusted: true };
  }

  const key = otpKey(user.id, deviceHash);
  const existing = await kvGet(supabase, key);
  if (existing?.sentAt && Date.now() - new Date(existing.sentAt).getTime() < OTP_RESEND_COOLDOWN_MS) {
    return { trusted: false, codeSent: true, emailMasked: maskEmail(user.email), cooldown: true };
  }

  const code = generateOtp6();
  await kvSet(supabase, key, {
    codeHash: hmac(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    attempts: 0,
    sentAt: new Date().toISOString(),
  });

  try {
    await sendCodeEmail({ toEmail: user.email, code, userAgent });
  } catch (e) {
    console.error('[device trust email]', e?.message || e);
    await kvDel(supabase, key);
    const err = new Error('Не удалось отправить письмо с кодом. Попробуйте ещё раз через минуту.');
    err.status = 502;
    throw err;
  }

  await logLoginEvent(supabase, {
    userId: user.id,
    email: user.email,
    eventType: 'device_code_sent',
    ip,
    userAgent,
    deviceHash,
  });

  const out = { trusted: false, codeSent: true, emailMasked: maskEmail(user.email) };
  // Только для локальной приёмки: DEVICE_TRUST_RETURN_CODE=1 возвращает код в ответе.
  if (process.env.DEVICE_TRUST_RETURN_CODE === '1') out.debugCode = code;
  return out;
}

/** Проверка кода из письма. Успех → устройство доверено. */
export async function verifyDeviceCode(supabase, { user, deviceHash, code, ip, userAgent }) {
  if (!deviceHash) {
    const err = new Error('Не передан токен устройства. Обновите страницу и войдите снова.');
    err.status = 400;
    throw err;
  }
  const codeDigits = String(code || '').replace(/\D/g, '');
  if (codeDigits.length !== 6) {
    const err = new Error('Введите 6 цифр из письма');
    err.status = 400;
    throw err;
  }

  const key = otpKey(user.id, deviceHash);
  const stored = await kvGet(supabase, key);
  const fail = async (message, status = 400) => {
    await logLoginEvent(supabase, {
      userId: user.id,
      email: user.email,
      eventType: 'device_code_failed',
      ip,
      userAgent,
      deviceHash,
      detail: { reason: message },
    });
    const err = new Error(message);
    err.status = status;
    throw err;
  };

  if (!stored?.codeHash) return fail('Код не запрашивался или истёк. Запросите новый.');
  if (Date.now() > new Date(stored.expiresAt).getTime()) {
    await kvDel(supabase, key);
    return fail('Код истёк. Запросите новый.');
  }
  if ((stored.attempts || 0) >= OTP_MAX_ATTEMPTS) {
    await kvDel(supabase, key);
    return fail('Слишком много попыток. Запросите новый код.', 429);
  }
  if (hmac(codeDigits) !== stored.codeHash) {
    await kvSet(supabase, key, { ...stored, attempts: (stored.attempts || 0) + 1 });
    const left = OTP_MAX_ATTEMPTS - ((stored.attempts || 0) + 1);
    return fail(left > 0 ? `Неверный код. Осталось попыток: ${left}` : 'Неверный код. Запросите новый.');
  }

  await kvDel(supabase, key);
  await trustDevice(supabase, { user, deviceHash, ip, userAgent });
  await logLoginEvent(supabase, {
    userId: user.id,
    email: user.email,
    eventType: 'device_code_verified',
    ip,
    userAgent,
    deviceHash,
  });
  return { trusted: true };
}

async function trustDevice(supabase, { user, deviceHash, ip, userAgent, detail }) {
  const label = String(userAgent || '').slice(0, 160) || null;
  const { error } = await supabase.from('panel_trusted_devices').upsert(
    {
      user_id: user.id,
      device_hash: deviceHash,
      label,
      created_ip: ip ? String(ip).slice(0, 45) : null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,device_hash' }
  );
  if (error) throw error;
  rememberTrusted(user.id, deviceHash);
  await logLoginEvent(supabase, {
    userId: user.id,
    email: user.email,
    eventType: 'device_trusted',
    ip,
    userAgent,
    deviceHash,
    detail: detail || {},
  });
}
