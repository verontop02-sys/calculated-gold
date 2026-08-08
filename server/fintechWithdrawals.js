/**
 * Заявки на вывод средств fintech-кабинета.
 *
 * Пока нет интеграции с A7/ПСБ (см. ТЗ этапа 9), выплата — ручной процесс:
 * 1. Клиент подаёт заявку на сумму → деньги СРАЗУ списываются с рублёвого баланса
 *    через ledger (entry_type='withdraw_rub'), чтобы их нельзя было потратить
 *    повторно на покупку золота, пока заявка висит на модерации.
 * 2. Модератор переводит деньги клиенту вне системы (на карту/по реквизитам)
 *    и отмечает заявку «Оплачено» — либо отклоняет, тогда полная сумма
 *    возвращается клиенту компенсирующей записью (entry_type='correction').
 *
 * Комиссия за вывод и минимальная сумма — в тех же fintech_settings, что и
 * комиссии покупки/продажи (см. fintechLedger.js), чтобы всё настраивалось
 * из одного места в админке.
 */
import crypto from 'crypto';
import { getFintechSettings } from './fintechLedger.js';
import { sendFintechWithdrawalEmailIfConfigured } from './emailDealReceipt.js';

async function getApprovedClient(supabase, clientId) {
  const { data: client, error } = await supabase
    .from('fintech_clients')
    .select('id, status, email, full_name')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!client) {
    const err = new Error('Клиент не найден');
    err.status = 404;
    throw err;
  }
  if (client.status !== 'approved') {
    const err = new Error('Кабинет доступен после подтверждения документов модератором');
    err.status = 403;
    err.code = 'fintech_not_approved';
    throw err;
  }
  return client;
}

function buildPayoutDetails({ payoutDetails, payoutMethod, cardNumber, sbpPhone, recipientName }) {
  const raw = String(payoutDetails || '').trim();
  if (raw) return { details: raw.slice(0, 500), method: 'freeform', cardMasked: null, phone: null, recipientName: null };

  const method = payoutMethod === 'sbp' ? 'sbp' : 'card';
  const name = String(recipientName || '').trim().slice(0, 120);
  if (method === 'card') {
    const card = String(cardNumber || '').replace(/\D/g, '');
    if (card.length < 16 || card.length > 19) {
      const err = new Error('Введите номер карты полностью (16–19 цифр)');
      err.status = 400;
      throw err;
    }
    const grouped = card.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
    const masked = `${card.slice(0, 4)} ···· ···· ${card.slice(-4)}`;
    const details = [`Карта ${grouped}`, name ? `получатель ${name}` : null].filter(Boolean).join(' · ').slice(0, 500);
    return { details, method: 'card', cardMasked: masked, phone: null, recipientName: name || null };
  }

  const phone = String(sbpPhone || '').replace(/\D/g, '');
  if (phone.length < 10 || phone.length > 11) {
    const err = new Error('Введите телефон СБП в формате +7 XXX XXX-XX-XX');
    err.status = 400;
    throw err;
  }
  const norm = phone.length === 10 ? `7${phone}` : phone;
  const pretty = `+${norm[0]} ${norm.slice(1, 4)} ${norm.slice(4, 7)}-${norm.slice(7, 9)}-${norm.slice(9)}`;
  const details = [`СБП ${pretty}`, name ? `получатель ${name}` : null].filter(Boolean).join(' · ').slice(0, 500);
  return { details, method: 'sbp', cardMasked: null, phone: pretty, recipientName: name || null };
}

/** Подать заявку на вывод: списывает деньги с баланса и создаёт заявку в статусе pending. */
export async function requestWithdrawal(supabase, {
  clientId,
  rubAmount,
  payoutDetails,
  payoutMethod,
  cardNumber,
  sbpPhone,
  recipientName,
  idempotencyKey,
}) {
  await getApprovedClient(supabase, clientId);
  const settings = await getFintechSettings(supabase);

  const amount = Math.round(Number(rubAmount) * 100) / 100;
  const minRub = Number(settings.minWithdrawRub || 0) || 0;
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Укажите сумму вывода больше нуля');
    err.status = 400;
    throw err;
  }
  if (amount < minRub) {
    const err = new Error(`Минимальная сумма вывода — ${minRub.toLocaleString('ru-RU')} ₽`);
    err.status = 400;
    throw err;
  }
  const payout = buildPayoutDetails({ payoutDetails, payoutMethod, cardNumber, sbpPhone, recipientName });
  const details = payout.details;
  if (!details) {
    const err = new Error('Укажите реквизиты для перевода (карта или телефон СБП)');
    err.status = 400;
    throw err;
  }

  const feePct = Number(settings.withdrawFeePercent || 0) || 0;
  const feeRub = Math.round(amount * (feePct / 100) * 100) / 100;
  const netRub = Math.round((amount - feeRub) * 100) / 100;

  const key = idempotencyKey ? `withdraw_req:${clientId}:${idempotencyKey}` : `withdraw_req:${clientId}:${crypto.randomUUID()}`;

  // Списание сразу — иначе клиент мог бы потратить эти деньги на покупку золота,
  // пока заявка ждёт модерации (двойное расходование одной и той же суммы).
  const { data, error } = await supabase.rpc('fintech_record_ledger_entry', {
    p_client_id: clientId,
    p_entry_type: 'withdraw_rub',
    p_rub_delta: -amount,
    p_gold_grams_delta: 0,
    p_rate_rub_per_gram: null,
    p_fee_rub: feeRub,
    p_idempotency_key: key,
    p_created_by_type: 'client',
    p_created_by_id: clientId,
    p_detail: {
      payoutDetails: details,
      payoutMethod: payout.method,
      cardMasked: payout.cardMasked,
      sbpPhone: payout.phone,
      recipientName: payout.recipientName,
    },
    p_reversal_of: null,
  });
  if (error) {
    if (String(error.message || '').includes('insufficient_balance')) {
      const err = new Error('Недостаточно средств на рублёвом балансе');
      err.status = 400;
      throw err;
    }
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;

  const { data: request, error: reqErr } = await supabase
    .from('fintech_withdrawal_requests')
    .insert({
      client_id: clientId,
      rub_amount: amount,
      fee_rub: feeRub,
      net_rub: netRub,
      payout_details: details,
      status: 'pending',
      ledger_entry_id: row.entry_id,
    })
    .select('id, rub_amount, fee_rub, net_rub, status, payout_details, created_at')
    .single();
  if (reqErr) throw reqErr;

  return {
    ok: true,
    request: mapRequest(request),
    rubBalance: Number(row.rub_balance),
    goldGrams: Number(row.gold_grams),
  };
}

function mapRequest(r) {
  return {
    id: r.id,
    rubAmount: Number(r.rub_amount),
    feeRub: Number(r.fee_rub) || 0,
    netRub: Number(r.net_rub),
    payoutDetails: r.payout_details,
    status: r.status,
    rejectReason: r.reject_reason || null,
    decidedAt: r.decided_at || null,
    createdAt: r.created_at,
  };
}

/** Заявки клиента — для вкладки «Продать/Вывод» в кабинете. */
export async function getClientWithdrawals(supabase, clientId, { limit = 20 } = {}) {
  const { data, error } = await supabase
    .from('fintech_withdrawal_requests')
    .select('id, rub_amount, fee_rub, net_rub, payout_details, status, reject_reason, decided_at, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapRequest);
}

/** Список заявок для модерации (админка). */
export async function listWithdrawalRequests(supabase, { status, limit = 100, offset = 0 } = {}) {
  let query = supabase
    .from('fintech_withdrawal_requests')
    .select('id, client_id, rub_amount, fee_rub, net_rub, payout_details, status, reject_reason, decided_at, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (status) query = query.eq('status', status);
  else query = query.eq('status', 'pending');

  const { data, error, count } = await query;
  if (error) throw error;

  const ids = [...new Set((data || []).map((r) => r.client_id))];
  let clientsById = new Map();
  if (ids.length) {
    const { data: clients, error: cErr } = await supabase
      .from('fintech_clients')
      .select('id, full_name, phone_normalized, email')
      .in('id', ids);
    if (cErr) throw cErr;
    clientsById = new Map((clients || []).map((c) => [c.id, c]));
  }

  return {
    total: count || 0,
    requests: (data || []).map((r) => ({
      ...mapRequest(r),
      client: clientsById.has(r.client_id)
        ? {
            id: r.client_id,
            fullName: clientsById.get(r.client_id).full_name,
            phone: clientsById.get(r.client_id).phone_normalized,
            email: clientsById.get(r.client_id).email,
          }
        : { id: r.client_id },
    })),
  };
}

/**
 * Решение модератора по заявке: approved (принята в обработку), paid (деньги
 * переведены клиенту вне системы), rejected (сумма возвращается на баланс).
 */
export async function decideWithdrawal(supabase, { requestId, decision, staffId, rejectReason }) {
  if (!['approved', 'paid', 'rejected'].includes(decision)) {
    const err = new Error('Некорректное решение');
    err.status = 400;
    throw err;
  }

  const { data: request, error } = await supabase
    .from('fintech_withdrawal_requests')
    .select('id, client_id, rub_amount, status, ledger_entry_id')
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw error;
  if (!request) {
    const err = new Error('Заявка не найдена');
    err.status = 404;
    throw err;
  }
  if (request.status === 'paid' || request.status === 'rejected') {
    const err = new Error('Заявка уже закрыта');
    err.status = 400;
    throw err;
  }

  const patch = {
    status: decision,
    decided_by: staffId,
    decided_at: new Date().toISOString(),
  };

  if (decision === 'rejected') {
    const reason = String(rejectReason || '').trim();
    if (!reason) {
      const err = new Error('Укажите причину отклонения');
      err.status = 400;
      throw err;
    }
    patch.reject_reason = reason;

    // Возвращаем клиенту полную списанную сумму — компенсирующая запись, а не правка старой.
    const key = `withdraw_reject:${request.id}`;
    const { data: refund, error: refundErr } = await supabase.rpc('fintech_record_ledger_entry', {
      p_client_id: request.client_id,
      p_entry_type: 'correction',
      p_rub_delta: Number(request.rub_amount),
      p_gold_grams_delta: 0,
      p_rate_rub_per_gram: null,
      p_fee_rub: 0,
      p_idempotency_key: key,
      p_created_by_type: 'staff',
      p_created_by_id: staffId,
      p_detail: { reason: 'withdrawal_rejected', withdrawalRequestId: request.id },
      p_reversal_of: request.ledger_entry_id,
    });
    if (refundErr) throw refundErr;
    const refundRow = Array.isArray(refund) ? refund[0] : refund;
    patch.refund_ledger_entry_id = refundRow.entry_id;
  }

  const { error: updErr } = await supabase.from('fintech_withdrawal_requests').update(patch).eq('id', requestId);
  if (updErr) throw updErr;

  const { data: client } = await supabase
    .from('fintech_clients')
    .select('email, full_name')
    .eq('id', request.client_id)
    .maybeSingle();
  if (client?.email) {
    sendFintechWithdrawalEmailIfConfigured({
      toEmail: client.email,
      fullName: client.full_name,
      decision,
      rubAmount: Number(request.rub_amount),
      rejectReason: patch.reject_reason,
    }).catch((e) => console.warn('[fintech withdrawal email]', e?.message || e));
  }

  return { ok: true, status: decision };
}
