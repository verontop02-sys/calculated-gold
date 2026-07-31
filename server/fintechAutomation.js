/**
 * Автоматизация fintech-биржи: ценовые коридоры (п.6 ТЗ) и регулярные инвестиции (п.7).
 *
 * Ценовые коридоры: клиент задаёт целевой курс и направление (купить когда курс упадёт
 * до X, продать когда вырастет до X). Фоновый тик (см. index.js) сравнивает целевой курс
 * с текущим и исполняет сделку автоматически. Защита от повторного исполнения — атомарный
 * переход active → triggered/failed через condition WHERE status = 'active' в UPDATE:
 * если тик запустится параллельно (не должно, но на всякий случай), вторая попытка
 * получит 0 обновлённых строк и просто пропустит алерт.
 *
 * Регулярные инвестиции: пока нет сохранённого платёжного токена эквайринга, подписка
 * выполняет покупку золота с уже пополненного рублёвого баланса клиента по расписанию.
 * Когда появится эквайринг — перед buyGold добавится шаг списания с карты по токену,
 * остальная механика (расписание, ретраи, история) не изменится.
 */
import { buyGold, sellGold } from './fintechLedger.js';
import { sendFintechAutomationEmailIfConfigured } from './emailDealReceipt.js';

const MAX_RECURRING_RETRY_DAYS = 5;

function round2(n) { return Math.round(Number(n) * 100) / 100; }
function round6(n) { return Math.round(Number(n) * 1e6) / 1e6; }

async function requireApprovedClient(supabase, clientId) {
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

function mapAlert(r) {
  return {
    id: r.id,
    direction: r.direction,
    targetRatePerGram: Number(r.target_rate_rub_per_gram),
    amountMode: r.amount_mode,
    amountValue: Number(r.amount_value),
    status: r.status,
    triggeredAt: r.triggered_at,
    triggeredRate: r.triggered_rate != null ? Number(r.triggered_rate) : null,
    errorMessage: r.error_message,
    createdAt: r.created_at,
  };
}

// ═══════════════════════════ Ценовые коридоры ═══════════════════════════════

const MAX_ACTIVE_ALERTS_PER_CLIENT = 10;

export async function createPriceAlert(supabase, { clientId, direction, targetRate, amountMode, amountValue }) {
  await requireApprovedClient(supabase, clientId);

  if (!['buy', 'sell'].includes(direction)) {
    const err = new Error('Некорректное направление (купить/продать)');
    err.status = 400;
    throw err;
  }
  if (!['grams', 'rub'].includes(amountMode)) {
    const err = new Error('Некорректная единица суммы');
    err.status = 400;
    throw err;
  }
  const rate = Number(targetRate);
  const amount = Number(amountValue);
  if (!Number.isFinite(rate) || rate <= 0) {
    const err = new Error('Укажите целевой курс больше нуля');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Укажите сумму/вес больше нуля');
    err.status = 400;
    throw err;
  }

  const { count, error: cntErr } = await supabase
    .from('fintech_price_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'active');
  if (cntErr) throw cntErr;
  if ((count || 0) >= MAX_ACTIVE_ALERTS_PER_CLIENT) {
    const err = new Error(`Можно держать активными не более ${MAX_ACTIVE_ALERTS_PER_CLIENT} условий одновременно`);
    err.status = 400;
    throw err;
  }

  const { data, error } = await supabase
    .from('fintech_price_alerts')
    .insert({
      client_id: clientId,
      direction,
      target_rate_rub_per_gram: round2(rate),
      amount_mode: amountMode,
      amount_value: amountMode === 'grams' ? round6(amount) : round2(amount),
      status: 'active',
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapAlert(data);
}

export async function listClientPriceAlerts(supabase, clientId, { limit = 30 } = {}) {
  const { data, error } = await supabase
    .from('fintech_price_alerts')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapAlert);
}

export async function cancelPriceAlert(supabase, { clientId, alertId }) {
  const { data, error } = await supabase
    .from('fintech_price_alerts')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', alertId)
    .eq('client_id', clientId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error('Условие не найдено или уже закрыто');
    err.status = 404;
    throw err;
  }
  return { ok: true };
}

/** Список активных условий для админского обзора автоматизации. */
export async function listActivePriceAlertsForStaff(supabase, { limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('fintech_price_alerts')
    .select('*, fintech_clients(full_name, phone_normalized)')
    .in('status', ['active', 'failed'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((r) => ({
    ...mapAlert(r),
    client: { fullName: r.fintech_clients?.full_name, phone: r.fintech_clients?.phone_normalized },
  }));
}

/**
 * Фоновый тик: сравнивает текущий курс с активными условиями и исполняет сделки.
 * Вызывается из index.js на каждое обновление курса — best-effort, ошибки не должны
 * ронять остальной бэкенд.
 */
export async function processPriceAlerts(supabase, currentRatePerGram) {
  const rate = Number(currentRatePerGram);
  if (!Number.isFinite(rate) || rate <= 0) return { checked: 0, executed: 0 };

  const { data: candidates, error } = await supabase
    .from('fintech_price_alerts')
    .select('id, client_id, direction, target_rate_rub_per_gram, amount_mode, amount_value')
    .eq('status', 'active')
    .or(`and(direction.eq.buy,target_rate_rub_per_gram.gte.${rate}),and(direction.eq.sell,target_rate_rub_per_gram.lte.${rate})`);
  if (error) { console.warn('[price alerts] select', error.message || error); return { checked: 0, executed: 0 }; }
  if (!candidates?.length) return { checked: 0, executed: 0 };

  let executed = 0;
  for (const alert of candidates) {
    try {
      const claimed = await claimAlert(supabase, alert.id);
      if (!claimed) continue;
      await executeAlert(supabase, alert, rate);
      executed += 1;
    } catch (e) {
      console.warn('[price alerts] execute', alert.id, e?.message || e);
    }
  }
  return { checked: candidates.length, executed };
}

async function claimAlert(supabase, alertId) {
  const { data, error } = await supabase
    .from('fintech_price_alerts')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', alertId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function executeAlert(supabase, alert, rate) {
  const idempotencyKey = `price_alert:${alert.id}`;
  let outcome;
  try {
    if (alert.direction === 'buy') {
      const payload = alert.amount_mode === 'rub'
        ? { clientId: alert.client_id, rubAmount: Number(alert.amount_value), idempotencyKey }
        : { clientId: alert.client_id, grams: Number(alert.amount_value), idempotencyKey };
      outcome = await buyGold(supabase, payload);
    } else {
      const payload = alert.amount_mode === 'rub'
        ? { clientId: alert.client_id, rubAmount: Number(alert.amount_value), idempotencyKey }
        : { clientId: alert.client_id, grams: Number(alert.amount_value), idempotencyKey };
      outcome = await sellGold(supabase, payload);
    }
    await supabase
      .from('fintech_price_alerts')
      .update({
        status: 'triggered',
        triggered_at: new Date().toISOString(),
        triggered_rate: rate,
        ledger_entry_id: outcome.entryId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', alert.id);
  } catch (e) {
    await supabase
      .from('fintech_price_alerts')
      .update({
        status: 'failed',
        error_message: (e?.message || 'Не удалось исполнить условие').slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('id', alert.id);
  }

  const { data: client } = await supabase
    .from('fintech_clients')
    .select('email, full_name')
    .eq('id', alert.client_id)
    .maybeSingle();
  if (client?.email) {
    sendFintechAutomationEmailIfConfigured({
      toEmail: client.email,
      fullName: client.full_name,
      kind: 'price_alert',
      ok: !!outcome,
      direction: alert.direction,
      rate,
    }).catch((e) => console.warn('[price alert email]', e?.message || e));
  }
}

// ═══════════════════════════ Регулярные инвестиции ══════════════════════════

function daysInMonth(year, monthIdx) {
  return new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
}

/** Ближайшая дата запуска (09:00 UTC ≈ 12:00 МСК) для day_of_month, не раньше `from`. */
function nextRunAt(dayOfMonth, from = new Date()) {
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();
  let day = Math.min(dayOfMonth, daysInMonth(year, month));
  let candidate = new Date(Date.UTC(year, month, day, 9, 0, 0));
  if (candidate <= from) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    day = Math.min(dayOfMonth, daysInMonth(year, month));
    candidate = new Date(Date.UTC(year, month, day, 9, 0, 0));
  }
  return candidate;
}

function mapSubscription(r) {
  return {
    id: r.id,
    rubAmount: Number(r.rub_amount),
    dayOfMonth: r.day_of_month,
    status: r.status,
    consecutiveFailures: r.consecutive_failures,
    lastRunAt: r.last_run_at,
    lastRunStatus: r.last_run_status,
    nextRunAt: r.next_run_at,
    createdAt: r.created_at,
  };
}

export async function getClientRecurringInvestment(supabase, clientId) {
  const { data, error } = await supabase
    .from('fintech_recurring_investments')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSubscription(data) : null;
}

/** Создаёт подписку или переоформляет отменённую/на паузе — на клиента ровно одна запись. */
export async function upsertRecurringInvestment(supabase, { clientId, rubAmount, dayOfMonth }) {
  await requireApprovedClient(supabase, clientId);

  const amount = round2(Number(rubAmount));
  const day = parseInt(dayOfMonth, 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Укажите сумму больше нуля');
    err.status = 400;
    throw err;
  }
  if (!Number.isInteger(day) || day < 1 || day > 28) {
    const err = new Error('Число месяца должно быть от 1 до 28 (чтобы не пропускать короткие месяцы)');
    err.status = 400;
    throw err;
  }

  const patch = {
    client_id: clientId,
    rub_amount: amount,
    day_of_month: day,
    status: 'active',
    consecutive_failures: 0,
    next_run_at: nextRunAt(day).toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('fintech_recurring_investments')
    .upsert(patch, { onConflict: 'client_id' })
    .select('*')
    .single();
  if (error) throw error;
  return mapSubscription(data);
}

export async function setRecurringStatus(supabase, { clientId, status }) {
  if (!['paused', 'active', 'cancelled'].includes(status)) {
    const err = new Error('Некорректный статус подписки');
    err.status = 400;
    throw err;
  }
  const { data: existing, error: selErr } = await supabase
    .from('fintech_recurring_investments')
    .select('id, day_of_month')
    .eq('client_id', clientId)
    .maybeSingle();
  if (selErr) throw selErr;
  if (!existing) {
    const err = new Error('Подписки пока нет');
    err.status = 404;
    throw err;
  }
  const patch = { status, updated_at: new Date().toISOString() };
  if (status === 'active') {
    patch.next_run_at = nextRunAt(existing.day_of_month).toISOString();
    patch.consecutive_failures = 0;
  }
  if (status === 'cancelled' || status === 'paused') patch.next_run_at = null;
  const { error } = await supabase.from('fintech_recurring_investments').update(patch).eq('client_id', clientId);
  if (error) throw error;
  return { ok: true, status };
}

export async function listRecurringRuns(supabase, clientId, { limit = 20 } = {}) {
  const { data, error } = await supabase
    .from('fintech_recurring_runs')
    .select('id, run_date, status, rub_amount, grams_bought, error_message, created_at')
    .eq('client_id', clientId)
    .order('run_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    runDate: r.run_date,
    status: r.status,
    rubAmount: Number(r.rub_amount),
    gramsBought: r.grams_bought != null ? Number(r.grams_bought) : null,
    errorMessage: r.error_message,
    createdAt: r.created_at,
  }));
}

/** Фоновый суточный тик: выполняет все подписки, чья next_run_at уже наступила. */
export async function processRecurringInvestments(supabase) {
  const now = new Date();
  const { data: due, error } = await supabase
    .from('fintech_recurring_investments')
    .select('*')
    .eq('status', 'active')
    .lte('next_run_at', now.toISOString());
  if (error) { console.warn('[recurring] select', error.message || error); return { checked: 0, ran: 0 }; }
  if (!due?.length) return { checked: 0, ran: 0 };

  let ran = 0;
  for (const sub of due) {
    try {
      await runRecurringOnce(supabase, sub, now);
      ran += 1;
    } catch (e) {
      console.warn('[recurring] run', sub.id, e?.message || e);
    }
  }
  return { checked: due.length, ran };
}

async function runRecurringOnce(supabase, sub, now) {
  const runDate = now.toISOString().slice(0, 10);

  // Claim дня: уникальный (subscription_id, run_date) не даст выполнить дважды,
  // даже если тик случайно запустится параллельно или сервер перезапустится в тот же день.
  const { data: claim, error: claimErr } = await supabase
    .from('fintech_recurring_runs')
    .insert({ subscription_id: sub.id, client_id: sub.client_id, run_date: runDate, status: 'running', rub_amount: sub.rub_amount })
    .select('id')
    .maybeSingle();
  if (claimErr) {
    if (claimErr.code === '23505') return; // уже обработано сегодня
    throw claimErr;
  }

  let result = null;
  let failMessage = null;
  try {
    result = await buyGold(supabase, {
      clientId: sub.client_id,
      rubAmount: Number(sub.rub_amount),
      idempotencyKey: `recurring:${sub.id}:${runDate}`,
    });
  } catch (e) {
    failMessage = e?.message || 'Не удалось выполнить автопокупку';
  }

  const ok = Boolean(result);
  await supabase
    .from('fintech_recurring_runs')
    .update({
      status: ok ? 'success' : 'failed',
      grams_bought: ok ? result.gramsBought : null,
      error_message: ok ? null : failMessage,
      ledger_entry_id: ok ? result.entryId || null : null,
    })
    .eq('id', claim.id);

  const failures = ok ? 0 : Number(sub.consecutive_failures || 0) + 1;
  const giveUp = !ok && failures >= MAX_RECURRING_RETRY_DAYS;

  const patch = {
    last_run_at: now.toISOString(),
    last_run_status: ok ? 'success' : 'failed',
    consecutive_failures: failures,
    updated_at: now.toISOString(),
  };
  if (ok) {
    patch.next_run_at = nextRunAt(sub.day_of_month, now).toISOString();
  } else if (giveUp) {
    // Пополните баланс и включите подписку заново — не долбим клиента бесконечно.
    patch.status = 'paused';
    patch.next_run_at = null;
  } else {
    // Повторная попытка завтра — деньги могли доложить на баланс в течение дня.
    const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
    patch.next_run_at = tomorrow.toISOString();
  }

  await supabase.from('fintech_recurring_investments').update(patch).eq('id', sub.id);

  const { data: client } = await supabase
    .from('fintech_clients')
    .select('email, full_name')
    .eq('id', sub.client_id)
    .maybeSingle();
  if (client?.email && (ok || giveUp)) {
    sendFintechAutomationEmailIfConfigured({
      toEmail: client.email,
      fullName: client.full_name,
      kind: 'recurring',
      ok,
      rubAmount: Number(sub.rub_amount),
      pausedAfterFailures: giveUp,
    }).catch((e) => console.warn('[recurring email]', e?.message || e));
  }
}
