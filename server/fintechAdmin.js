/**
 * Модераторские операции fintech-кабинета: список клиентов, проверка KYC-документов,
 * решение по статусу клиента, ручное пополнение баланса, просмотр ledger.
 *
 * Доступ — только admin/super_admin (гейт в server/index.js через requireUserManager).
 * Аудит решений по KYC — прямо в fintech_kyc_documents (reviewed_by/reviewed_at/reject_reason)
 * и fintech_clients (reject_reason), отдельная таблица журнала не нужна на этом этапе.
 */
import { manualTopup as manualTopupOp, getClientPortfolio, getClientLedger, getLiveGoldRatePerGram } from './fintechLedger.js';
import { sendFintechDecisionEmailIfConfigured } from './emailDealReceipt.js';

export async function listFintechClients(supabase, { status, q, limit = 50, offset = 0 } = {}) {
  let query = supabase
    .from('fintech_clients')
    .select('id, phone_normalized, email, full_name, status, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  // Блокированные — в отдельной «папке» (вкладка «Блокированы»), из общего списка скрыты.
  else query = query.neq('status', 'blocked');
  if (q) {
    const term = String(q).trim();
    if (term) query = query.or(`full_name.ilike.%${term}%,phone_normalized.ilike.%${term}%,email.ilike.%${term}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const ids = (data || []).map((c) => c.id);
  let balancesById = new Map();
  if (ids.length) {
    const { data: balances, error: balErr } = await supabase
      .from('fintech_balances')
      .select('client_id, rub_balance, gold_grams')
      .in('client_id', ids);
    if (balErr) throw balErr;
    balancesById = new Map((balances || []).map((b) => [b.client_id, b]));
  }

  return {
    total: count || 0,
    clients: (data || []).map((c) => {
      const bal = balancesById.get(c.id);
      return {
        id: c.id,
        phone: c.phone_normalized,
        email: c.email,
        fullName: c.full_name,
        status: c.status,
        createdAt: c.created_at,
        rubBalance: Number(bal?.rub_balance || 0),
        goldGrams: Number(bal?.gold_grams || 0),
      };
    }),
  };
}

export async function getClientDetailForStaff(supabase, clientId) {
  const { data: client, error } = await supabase
    .from('fintech_clients')
    .select('id, phone_normalized, email, full_name, status, reject_reason, created_at, updated_at')
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
    .select('id, doc_type, status, reject_reason, reviewed_by, reviewed_at, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (docsErr) throw docsErr;

  const [portfolio, ledger] = await Promise.all([
    getClientPortfolio(supabase, clientId),
    getClientLedger(supabase, clientId, { limit: 50 }),
  ]);

  return {
    id: client.id,
    phone: client.phone_normalized,
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
      reviewedAt: d.reviewed_at,
      createdAt: d.created_at,
    })),
    portfolio,
    ledger,
  };
}

/** Подписанная ссылка на документ — файлы приватные, прямого публичного доступа нет. */
export async function getKycDocumentSignedUrl(supabase, documentId) {
  const { data: doc, error } = await supabase
    .from('fintech_kyc_documents')
    .select('storage_path')
    .eq('id', documentId)
    .maybeSingle();
  if (error) throw error;
  if (!doc) {
    const err = new Error('Документ не найден');
    err.status = 404;
    throw err;
  }
  const { data: signed, error: signErr } = await supabase.storage
    .from('kyc-documents')
    .createSignedUrl(doc.storage_path, 300); // 5 минут
  if (signErr) throw signErr;
  return { url: signed?.signedUrl || null };
}

export async function reviewKycDocument(supabase, { documentId, status, staffId, rejectReason }) {
  if (!['approved', 'rejected'].includes(status)) {
    const err = new Error('Некорректный статус проверки');
    err.status = 400;
    throw err;
  }
  const patch = {
    status,
    reviewed_by: staffId,
    reviewed_at: new Date().toISOString(),
    reject_reason: status === 'rejected' ? (String(rejectReason || '').trim() || 'Не указана причина') : null,
  };
  const { error } = await supabase.from('fintech_kyc_documents').update(patch).eq('id', documentId);
  if (error) throw error;
  return { ok: true };
}

/** Финальное решение по клиенту — доступ к покупке golда открывается только со status='approved'. */
export async function decideClientStatus(supabase, { clientId, decision, staffId, rejectReason }) {
  if (!['approved', 'rejected', 'blocked'].includes(decision)) {
    const err = new Error('Некорректное решение');
    err.status = 400;
    throw err;
  }
  const patch = {
    status: decision,
    reject_reason: decision === 'approved' ? null : (String(rejectReason || '').trim() || 'Не указана причина'),
    updated_at: new Date().toISOString(),
  };
  const { data: client, error } = await supabase
    .from('fintech_clients')
    .update(patch)
    .eq('id', clientId)
    .select('email, full_name')
    .maybeSingle();
  if (error) throw error;

  // Письмо клиенту о решении — best-effort: сбой почты не должен ломать модерацию.
  if (client?.email) {
    const cabinetUrl = (process.env.PUBLIC_APP_ORIGIN || '').trim().replace(/\/$/, '');
    sendFintechDecisionEmailIfConfigured({
      toEmail: client.email,
      fullName: client.full_name,
      decision,
      rejectReason: patch.reject_reason,
      cabinetUrl: cabinetUrl ? `${cabinetUrl}/kabinet` : '',
    }).catch((e) => console.warn('[fintech decision email]', e?.message || e));
  }

  return { ok: true, status: decision, decidedBy: staffId };
}

export async function manualTopup(supabase, { clientId, rubAmount, staffId, comment, idempotencyKey }) {
  return manualTopupOp(supabase, { clientId, rubAmount, staffId, comment, idempotencyKey });
}

/**
 * Сводка биржи для админ-дашборда (правка Руслана: при входе в раздел — дашборд,
 * а не список на проверке; все данные по бирже, общий объём золота в весе и деньгах).
 *
 * Опциональный период from/to (Y-M-D) добавляет разрез оборотов за период —
 * его же использует главный дашборд для «продано золота».
 */
export async function getFintechAdminSummary(supabase, { from, to } = {}) {
  // Статусы клиентов.
  const { data: clientRows, error: cErr } = await supabase
    .from('fintech_clients')
    .select('status')
    .limit(10000);
  if (cErr) throw cErr;
  const clientsByStatus = { new: 0, pending_review: 0, approved: 0, rejected: 0, blocked: 0 };
  for (const r of clientRows || []) {
    if (clientsByStatus[r.status] != null) clientsByStatus[r.status] += 1;
  }
  const clientsTotal = (clientRows || []).length;

  // Балансы: сколько золота и рублей у клиентов суммарно.
  const { data: balances, error: bErr } = await supabase
    .from('fintech_balances')
    .select('rub_balance, gold_grams')
    .limit(10000);
  if (bErr) throw bErr;
  let totalRubBalance = 0;
  let totalGoldGrams = 0;
  for (const b of balances || []) {
    totalRubBalance += Number(b.rub_balance) || 0;
    totalGoldGrams += Number(b.gold_grams) || 0;
  }
  totalGoldGrams = Math.round(totalGoldGrams * 1e6) / 1e6;
  totalRubBalance = Math.round(totalRubBalance * 100) / 100;

  let rate = null;
  let rateSource = null;
  try {
    const live = await getLiveGoldRatePerGram(supabase);
    rate = live.rate;
    rateSource = live.source;
  } catch { /* курс не критичен для сводки */ }
  const goldValueRub = rate != null ? Math.round(totalGoldGrams * rate * 100) / 100 : null;

  // Обороты по журналу. На текущем объёме (сотни записей) агрегируем в JS.
  const { data: ledger, error: lErr } = await supabase
    .from('fintech_ledger_entries')
    .select('entry_type, rub_delta, gold_grams_delta, fee_rub, created_at')
    .order('created_at', { ascending: false })
    .limit(10000);
  if (lErr) throw lErr;

  const makeBucket = () => ({
    soldGrams: 0,       // золото, проданное нами клиентам (их buy_gold)
    soldRub: 0,
    boughtBackGrams: 0, // золото, выкупленное обратно (их sell_gold)
    boughtBackRub: 0,
    depositsRub: 0,
    withdrawalsRub: 0,
    feesRub: 0,
    opsCount: 0,
  });
  const acc = (bucket, r) => {
    bucket.opsCount += 1;
    bucket.feesRub += Number(r.fee_rub) || 0;
    const rub = Number(r.rub_delta) || 0;
    const grams = Number(r.gold_grams_delta) || 0;
    if (r.entry_type === 'buy_gold') {
      bucket.soldGrams += grams;
      bucket.soldRub += Math.abs(rub);
    } else if (r.entry_type === 'sell_gold') {
      bucket.boughtBackGrams += Math.abs(grams);
      bucket.boughtBackRub += rub;
    } else if (r.entry_type === 'deposit_rub') {
      bucket.depositsRub += rub;
    } else if (r.entry_type === 'withdraw_rub') {
      bucket.withdrawalsRub += Math.abs(rub);
    }
  };
  const round = (bucket) => {
    for (const k of Object.keys(bucket)) {
      bucket[k] = k.endsWith('Grams')
        ? Math.round(bucket[k] * 1e6) / 1e6
        : Math.round(bucket[k] * 100) / 100;
    }
    return bucket;
  };

  const allTime = makeBucket();
  const hasPeriod = Boolean(from || to);
  const period = makeBucket();
  const fromIso = from ? new Date(`${from}T00:00:00.000Z`).toISOString() : null;
  const toIso = to ? new Date(`${to}T23:59:59.999Z`).toISOString() : null;
  for (const r of ledger || []) {
    acc(allTime, r);
    if (hasPeriod) {
      const t = String(r.created_at || '');
      if (fromIso && t < fromIso) continue;
      if (toIso && t > toIso) continue;
      acc(period, r);
    }
  }

  return {
    clients: { total: clientsTotal, byStatus: clientsByStatus },
    balances: {
      totalRubBalance,
      totalGoldGrams,
      goldValueRub,
      ratePerGram: rate,
      rateSource,
    },
    allTime: round(allTime),
    period: hasPeriod ? { from: from || null, to: to || null, ...round(period) } : null,
  };
}

/**
 * Полное удаление клиента биржи (только супер-админ): журнал, балансы,
 * KYC-документы вместе с файлами в Storage, затем сам клиент.
 */
export async function deleteFintechClient(supabase, clientId) {
  const { data: client, error } = await supabase
    .from('fintech_clients')
    .select('id, full_name, phone_normalized')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!client) {
    const err = new Error('Клиент не найден');
    err.status = 404;
    throw err;
  }

  // Файлы KYC из приватного бакета — иначе останутся сиротами.
  const { data: docs } = await supabase
    .from('fintech_kyc_documents')
    .select('storage_path')
    .eq('client_id', clientId);
  const paths = (docs || []).map((d) => d.storage_path).filter(Boolean);
  if (paths.length) {
    const { error: rmErr } = await supabase.storage.from('kyc-documents').remove(paths);
    if (rmErr) console.warn('[fintech delete] storage remove', rmErr.message || rmErr);
  }

  for (const table of ['fintech_ledger_entries', 'fintech_kyc_documents', 'fintech_balances']) {
    const { error: dErr } = await supabase.from(table).delete().eq('client_id', clientId);
    if (dErr) throw dErr;
  }
  const { error: cliErr } = await supabase.from('fintech_clients').delete().eq('id', clientId);
  if (cliErr) throw cliErr;

  return { ok: true, deletedId: clientId, fullName: client.full_name || null };
}
