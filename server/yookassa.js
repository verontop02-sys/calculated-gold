/**
 * ЮKassa (тестовый / боевой магазин): создание платежа на пополнение
 * fintech-баланса и зачисление по webhook / явному confirm.
 *
 * Auth: Basic shopId:secretKey → https://api.yookassa.ru/v3
 * Идемпотентность зачисления: ledger key `yookassa:<paymentId>`.
 */
import crypto from 'crypto';
import { depositFromAcquiring } from './fintechLedger.js';

const API = 'https://api.yookassa.ru/v3';

export function yookassaConfigured() {
  return Boolean(String(process.env.YOOKASSA_SHOP_ID || '').trim() && String(process.env.YOOKASSA_SECRET_KEY || '').trim());
}

function shopId() {
  return String(process.env.YOOKASSA_SHOP_ID || '').trim();
}

function secretKey() {
  return String(process.env.YOOKASSA_SECRET_KEY || '').trim();
}

function minTopupRub() {
  const n = Number(process.env.YOOKASSA_MIN_TOPUP_RUB || 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function maxTopupRub() {
  const n = Number(process.env.YOOKASSA_MAX_TOPUP_RUB || 5_000_000);
  return Number.isFinite(n) && n > 0 ? n : 5_000_000;
}

function authHeader() {
  const token = Buffer.from(`${shopId()}:${secretKey()}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

async function yooFetch(path, { method = 'GET', body, idempotenceKey } = {}) {
  if (!yookassaConfigured()) {
    const err = new Error('Эквайринг ЮKassa не настроен (YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY)');
    err.status = 503;
    throw err;
  }
  const headers = {
    Authorization: authHeader(),
    'Content-Type': 'application/json',
  };
  if (idempotenceKey) headers['Idempotence-Key'] = String(idempotenceKey).slice(0, 64);

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const desc = data?.description || data?.message || text || res.statusText;
    const err = new Error(`ЮKassa: ${desc}`);
    err.status = res.status >= 400 && res.status < 500 ? 400 : 502;
    err.yookassa = data;
    throw err;
  }
  return data;
}

export async function getYooPayment(paymentId) {
  return yooFetch(`/payments/${encodeURIComponent(paymentId)}`);
}

/**
 * Создать платёж с redirect-confirmation. Клиент уходит на confirmation_url.
 */
export async function createTopupPayment(supabase, {
  clientId,
  rubAmount,
  returnUrl,
  description,
  customerEmail,
}) {
  const amount = Math.round(Number(rubAmount) * 100) / 100;
  const min = minTopupRub();
  const max = maxTopupRub();
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

  // Клиент должен быть approved — иначе деньги нельзя тратить на золото.
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

  const value = amount.toFixed(2);
  const idempotenceKey = crypto.randomUUID();
  const email = String(customerEmail || client.email || '').trim();

  const body = {
    amount: { value, currency: 'RUB' },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: String(returnUrl),
    },
    description: String(description || `Пополнение золотого счёта Reaktivo ${value} ₽`).slice(0, 128),
    metadata: {
      clientId: String(clientId),
      purpose: 'fintech_topup',
      rubAmount: value,
    },
  };

  // Чек 54-ФЗ — если в тестовом магазине включена фискализация; иначе ЮKassa проигнорирует/вернёт ошибку.
  // Для теста часто выключено: отправляем receipt только при YOOKASSA_SEND_RECEIPT=1.
  if (process.env.YOOKASSA_SEND_RECEIPT === '1' && email) {
    body.receipt = {
      customer: { email },
      items: [
        {
          description: 'Пополнение баланса Reaktivo Invest',
          quantity: '1.00',
          amount: { value, currency: 'RUB' },
          vat_code: Number(process.env.YOOKASSA_VAT_CODE || 1), // 1 = без НДС
          payment_mode: 'full_payment',
          payment_subject: 'service',
        },
      ],
    };
  }

  const payment = await yooFetch('/payments', { method: 'POST', body, idempotenceKey });
  const confirmationUrl = payment?.confirmation?.confirmation_url || null;
  if (!confirmationUrl) {
    const err = new Error('ЮKassa не вернула ссылку на оплату');
    err.status = 502;
    throw err;
  }

  return {
    paymentId: payment.id,
    status: payment.status,
    amountRub: amount,
    confirmationUrl,
    test: Boolean(payment.test),
  };
}

/**
 * Зачислить платёж на баланс, если succeeded. Безопасно вызывать повторно
 * (webhook + return URL confirm): ledger idempotency по payment.id.
 */
export async function creditYooPaymentIfSucceeded(supabase, paymentOrId) {
  const payment = typeof paymentOrId === 'string'
    ? await getYooPayment(paymentOrId)
    : paymentOrId;

  if (!payment?.id) {
    const err = new Error('Платёж не найден');
    err.status = 404;
    throw err;
  }

  // Всегда сверяем с API, если пришло из webhook — чтобы не зачислить поддельный payload.
  const verified = await getYooPayment(payment.id);
  if (verified.status !== 'succeeded') {
    return {
      ok: false,
      credited: false,
      status: verified.status,
      paymentId: verified.id,
    };
  }

  const meta = verified.metadata || {};
  const clientId = String(meta.clientId || '').trim();
  if (!clientId || meta.purpose !== 'fintech_topup') {
    const err = new Error('Платёж не относится к пополнению fintech');
    err.status = 400;
    throw err;
  }

  const paid = Number(verified.amount?.value);
  if (!Number.isFinite(paid) || paid <= 0) {
    const err = new Error('Некорректная сумма платежа');
    err.status = 400;
    throw err;
  }

  const out = await depositFromAcquiring(supabase, {
    clientId,
    rubAmount: paid,
    paymentId: verified.id,
    provider: 'yookassa',
    detail: {
      yookassaPaymentId: verified.id,
      paidAt: verified.captured_at || verified.created_at,
      test: Boolean(verified.test),
      method: verified.payment_method?.type || null,
    },
  });

  return {
    ok: true,
    credited: !out.duplicate,
    duplicate: Boolean(out.duplicate),
    status: 'succeeded',
    paymentId: verified.id,
    rubBalance: out.rubBalance,
    goldGrams: out.goldGrams,
    amountRub: paid,
  };
}

/** Обработка HTTP-уведомления ЮKassa. Всегда лучше отвечать 200 после обработки. */
export async function handleYooWebhook(supabase, body) {
  const event = body?.event;
  const object = body?.object;
  if (!event || !object?.id) {
    return { ok: true, ignored: true };
  }
  if (event === 'payment.succeeded') {
    const result = await creditYooPaymentIfSucceeded(supabase, object.id);
    return { ok: true, event, ...result };
  }
  // waiting_for_capture при capture:true почти не бывает; canceled — ничего не делаем.
  return { ok: true, event, ignored: true };
}
