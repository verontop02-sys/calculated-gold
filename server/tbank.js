/**
 * Т-Банк (Tinkoff) интернет-эквайринг: Init → PaymentURL → Notification/GetState → deposit.
 *
 * Docs: https://developer.tbank.ru/eacq/api/init
 * Идемпотентность зачисления: ledger key `tbank:<PaymentId>`.
 *
 * Env: TBANK_TERMINAL_KEY, TBANK_PASSWORD
 * Optional: TBANK_API_URL (default https://securepay.tinkoff.ru/v2)
 */
import crypto from 'crypto';
import { depositFromAcquiring } from './fintechLedger.js';

const API = (process.env.TBANK_API_URL || 'https://securepay.tinkoff.ru/v2').replace(/\/$/, '');
const PURPOSE = 'fintech_topup';

export function tbankConfigured() {
  return Boolean(
    String(process.env.TBANK_TERMINAL_KEY || '').trim()
    && String(process.env.TBANK_PASSWORD || '').trim(),
  );
}

function terminalKey() {
  return String(process.env.TBANK_TERMINAL_KEY || '').trim();
}

function password() {
  return String(process.env.TBANK_PASSWORD || '').trim();
}

export function tbankMinTopupRub() {
  const n = Number(process.env.TBANK_MIN_TOPUP_RUB || process.env.YOOKASSA_MIN_TOPUP_RUB || 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function tbankMaxTopupRub() {
  const n = Number(process.env.TBANK_MAX_TOPUP_RUB || process.env.YOOKASSA_MAX_TOPUP_RUB || 5_000_000);
  return Number.isFinite(n) && n > 0 ? n : 5_000_000;
}

export function tbankIsDemo() {
  return /DEMO$/i.test(terminalKey());
}

/**
 * Подпись Token: корневые поля + Password, без вложенных объектов, сортировка ключей, SHA-256.
 */
export function tbankToken(params) {
  const data = { ...params, Password: password() };
  delete data.Token;
  const keys = Object.keys(data)
    .filter((k) => {
      const v = data[k];
      return v !== undefined && v !== null && typeof v !== 'object';
    })
    .sort();
  const concat = keys.map((k) => String(data[k])).join('');
  return crypto.createHash('sha256').update(concat, 'utf8').digest('hex');
}

function verifyIncomingToken(body) {
  if (!body || typeof body !== 'object') return false;
  const their = String(body.Token || '');
  if (!their) return false;
  const ours = tbankToken(body);
  try {
    return crypto.timingSafeEqual(Buffer.from(their, 'utf8'), Buffer.from(ours, 'utf8'));
  } catch {
    return their === ours;
  }
}

async function tbankFetch(methodPath, params) {
  if (!tbankConfigured()) {
    const err = new Error('Эквайринг Т-Банк не настроен (TBANK_TERMINAL_KEY / TBANK_PASSWORD)');
    err.status = 503;
    throw err;
  }
  const body = { ...params, TerminalKey: terminalKey() };
  body.Token = tbankToken(body);

  const res = await fetch(`${API}${methodPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Т-Банк HTTP ${res.status}`);
    err.status = 502;
    err.tbank = data;
    throw err;
  }
  if (data && data.Success === false) {
    const msg = data.Message || data.Details || `ErrorCode ${data.ErrorCode}`;
    const err = new Error(`Т-Банк: ${msg}`);
    err.status = 400;
    err.tbank = data;
    throw err;
  }
  return data;
}

export async function getTbankPaymentState(paymentId) {
  return tbankFetch('/GetState', { PaymentId: String(paymentId) });
}

function notificationUrl() {
  const fromEnv = String(process.env.TBANK_NOTIFICATION_URL || '').trim();
  if (fromEnv) return fromEnv;
  // VPS-прокси из РФ (основной)
  return 'https://api.reaktivo.pro/api/public/fintech/topup/webhook-tbank';
}

/**
 * Создать платёж Init → PaymentURL.
 */
export async function createTbankTopupPayment(supabase, {
  clientId,
  rubAmount,
  returnUrl,
  description,
}) {
  const amount = Math.round(Number(rubAmount) * 100) / 100;
  const min = tbankMinTopupRub();
  const max = tbankMaxTopupRub();
  if (!Number.isFinite(amount) || amount < min) {
    const err = new Error(`Минимальная сумма пополнения — ${min} ₽`);
    err.status = 400;
    throw err;
  }
  if (amount > max) {
    const err = new Error(`Максимальная сумма пополнения — ${max.toLocaleString('ru-RU')} ₽`);
    err.status = 400;
    throw err;
  }
  if (!returnUrl || !/^https?:\/\//i.test(String(returnUrl))) {
    const err = new Error('Некорректный return_url');
    err.status = 400;
    throw err;
  }

  const { data: client, error: cErr } = await supabase
    .from('fintech_clients')
    .select('id, status, email, full_name')
    .eq('id', clientId)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!client) {
    const err = new Error('Клиент не найден');
    err.status = 404;
    throw err;
  }
  if (client.status !== 'approved') {
    const err = new Error('Пополнение доступно после подтверждения документов');
    err.status = 403;
    err.code = 'fintech_not_approved';
    throw err;
  }

  const amountKopecks = Math.round(amount * 100);
  // OrderId ≤ 64: ft + uuid без дефисов (32) + 8 hex = 42 символа — надёжный разбор clientId без DATA.
  const orderId = `ft${String(clientId).replace(/-/g, '')}${crypto.randomBytes(4).toString('hex')}`;
  const successUrl = String(returnUrl);
  const failUrl = String(returnUrl).includes('?')
    ? `${returnUrl}&topup_fail=1`
    : `${returnUrl}?topup_fail=1`;

  const params = {
    Amount: amountKopecks,
    OrderId: orderId,
    Description: String(
      description || `Пополнение золотого счёта Reaktivo ${amount.toFixed(2)} ₽`,
    ).slice(0, 250),
    NotificationURL: notificationUrl(),
    SuccessURL: successUrl,
    FailURL: failUrl,
    DATA: {
      clientId: String(clientId),
      purpose: PURPOSE,
      rubAmount: amount.toFixed(2),
    },
  };

  const payment = await tbankFetch('/Init', params);
  const confirmationUrl = payment?.PaymentURL || null;
  const paymentId = payment?.PaymentId != null ? String(payment.PaymentId) : null;
  if (!confirmationUrl || !paymentId) {
    const err = new Error('Т-Банк не вернул ссылку на оплату');
    err.status = 502;
    err.tbank = payment;
    throw err;
  }

  return {
    paymentId,
    orderId,
    status: payment.Status || 'NEW',
    amountRub: amount,
    confirmationUrl,
    test: tbankIsDemo(),
    provider: 'tbank',
  };
}

function extractClientId(state) {
  const data = state?.DATA;
  if (data && typeof data === 'object') {
    const id = String(data.clientId || data.ClientId || '').trim();
    if (id) return id;
  }
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      const id = String(parsed.clientId || parsed.ClientId || '').trim();
      if (id) return id;
    } catch { /* ignore */ }
  }
  const orderId = String(state?.OrderId || '');
  // ft + 32 hex (uuid без дефисов) + 8 hex
  const m = /^ft([0-9a-f]{32})[0-9a-f]{8}$/i.exec(orderId);
  if (m) {
    const h = m[1];
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return '';
}

/**
 * Зачислить при Status CONFIRMED / AUTHORIZED (одностадийный — CONFIRMED).
 */
export async function creditTbankPaymentIfSucceeded(supabase, paymentIdOrState) {
  const state = typeof paymentIdOrState === 'string' || typeof paymentIdOrState === 'number'
    ? await getTbankPaymentState(paymentIdOrState)
    : paymentIdOrState;

  const paymentId = state?.PaymentId != null ? String(state.PaymentId) : '';
  if (!paymentId) {
    const err = new Error('Платёж не найден');
    err.status = 404;
    throw err;
  }

  // Перепроверяем у банка, если пришло только уведомление
  const verified = await getTbankPaymentState(paymentId);
  const status = String(verified.Status || '');
  if (status !== 'CONFIRMED') {
    return {
      ok: false,
      credited: false,
      status,
      paymentId,
      provider: 'tbank',
    };
  }

  const clientId = extractClientId(verified) || extractClientId(state);
  if (!clientId) {
    const err = new Error('В платеже нет clientId (DATA)');
    err.status = 400;
    throw err;
  }

  const kopecks = Number(verified.Amount);
  const paid = Number.isFinite(kopecks) ? Math.round(kopecks) / 100 : NaN;
  if (!Number.isFinite(paid) || paid <= 0) {
    const err = new Error('Некорректная сумма платежа');
    err.status = 400;
    throw err;
  }

  const out = await depositFromAcquiring(supabase, {
    clientId,
    rubAmount: paid,
    paymentId,
    provider: 'tbank',
    detail: {
      tbankPaymentId: paymentId,
      orderId: verified.OrderId || null,
      status,
      test: tbankIsDemo(),
      purpose: PURPOSE,
    },
  });

  return {
    ok: true,
    credited: !out.duplicate,
    duplicate: Boolean(out.duplicate),
    status: 'CONFIRMED',
    paymentId,
    provider: 'tbank',
    rubBalance: out.rubBalance,
    goldGrams: out.goldGrams,
    amountRub: paid,
    clientId,
  };
}

/**
 * NotificationURL: Т-Банк ждёт тело ответа ровно "OK".
 * Возвращает { httpBody: 'OK', ... } — роут должен слать text/plain.
 */
export async function handleTbankWebhook(supabase, body) {
  if (!body || typeof body !== 'object') {
    return { httpBody: 'OK', ignored: true };
  }
  if (!verifyIncomingToken(body)) {
    console.warn('[tbank webhook] bad token');
    // Всё равно OK, чтобы не крутили ретраи вечно на подпись — логируем.
    return { httpBody: 'OK', ignored: true, badToken: true };
  }
  const status = String(body.Status || '');
  if (status === 'CONFIRMED') {
    try {
      const result = await creditTbankPaymentIfSucceeded(supabase, body);
      return { httpBody: 'OK', ...result };
    } catch (e) {
      console.error('[tbank webhook credit]', e?.message || e);
      throw e;
    }
  }
  return { httpBody: 'OK', ignored: true, status };
}
