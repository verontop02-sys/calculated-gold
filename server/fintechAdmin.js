/**
 * Модераторские операции fintech-кабинета: список клиентов, проверка KYC-документов,
 * решение по статусу клиента, ручное пополнение баланса, просмотр ledger.
 *
 * Доступ — только admin/super_admin (гейт в server/index.js через requireUserManager).
 * Аудит решений по KYC — прямо в fintech_kyc_documents (reviewed_by/reviewed_at/reject_reason)
 * и fintech_clients (reject_reason), отдельная таблица журнала не нужна на этом этапе.
 */
import { manualTopup as manualTopupOp, getClientPortfolio, getClientLedger } from './fintechLedger.js';
import { sendFintechDecisionEmailIfConfigured } from './emailDealReceipt.js';

export async function listFintechClients(supabase, { status, q, limit = 50, offset = 0 } = {}) {
  let query = supabase
    .from('fintech_clients')
    .select('id, phone_normalized, email, full_name, status, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
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
