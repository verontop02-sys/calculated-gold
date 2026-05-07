import crypto from 'crypto';
import { firstFilledContractRow } from './scrapDealFirstRow.js';
import { buildScrapContractPdfBuffer } from './scrapContractPdf.js';
import { sendDealConfirmationSms } from './smsSend.js';
import { sendDealReceiptEmailIfConfigured } from './emailDealReceipt.js';

function normalizeScrapPhoneDigits(v) {
  const digits = String(v || '').replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return digits.slice(1);
  }
  if (digits.length === 10) return digits;
  return '';
}

function scrapCustomerPhonePayload(phoneRaw) {
  const raw = phoneRaw != null && String(phoneRaw).trim() ? String(phoneRaw).trim() : null;
  if (!raw) return { phone: null, phone_normalized: null };
  const n = normalizeScrapPhoneDigits(raw);
  if (n.length === 10) return { phone: `+7${n}`, phone_normalized: n };
  return { phone: raw, phone_normalized: null };
}

function parseCellNumber(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

async function resolveCustomerIdByPhone(supabase, phone) {
  const n = normalizeScrapPhoneDigits(phone);
  if (!n) return null;
  const { data: hit } = await supabase.from('scrap_customers').select('id').eq('phone_normalized', n).maybeSingle();
  if (hit?.id) return hit.id;
  const { data } = await supabase.from('scrap_customers').select('id, phone');
  for (const row of data || []) {
    if (row?.id && normalizeScrapPhoneDigits(row.phone) === n) return row.id;
  }
  return null;
}

export async function insertScrapDealRow(supabase, { operatorUserId, body, totalRub }) {
  const customerRaw = body?.customerId;
  let customerId =
    customerRaw && /^[0-9a-f-]{36}$/i.test(String(customerRaw)) ? String(customerRaw) : null;
  const phone = String(body?.phone || '').trim() || null;
  const phoneNorm = normalizeScrapPhoneDigits(phone) || null;
  if (!customerId && phone) {
    const resolved = await resolveCustomerIdByPhone(supabase, phone);
    if (resolved) customerId = resolved;
  }
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  const r0 = firstFilledContractRow(rows) || {};
  const probeStr = String(r0?.probe || '').replace(/\D/g, '');
  const firstProbe = probeStr ? parseInt(probeStr, 10) : null;
  const firstWg = parseCellNumber(r0?.weightGross ?? r0?.weight_gross);
  const firstWn = parseCellNumber(r0?.weightNet ?? r0?.weight_net);
  const { data, error } = await supabase
    .from('scrap_deals')
    .insert({
      customer_id: customerId,
      operator_id: operatorUserId,
      contract_no: String(body?.contractNo || '').trim() || null,
      total_rub: totalRub,
      seller_name: String(body?.sellerName || '').trim() || null,
      phone,
      phone_normalized: phoneNorm,
      rows,
      first_probe: Number.isFinite(firstProbe) ? firstProbe : null,
      first_weight_gross: firstWg,
      first_weight_net: firstWn,
      appraiser_name: String(body?.appraiserName || '').trim() || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data?.id || null;
}

function codePepper() {
  const p = (process.env.FIELD_DEAL_CODE_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-only').trim();
  return p.slice(0, 64);
}

function hashOtp(code) {
  return crypto.createHmac('sha256', codePepper()).update(String(code).trim()).digest('hex');
}

function generateOtp6() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function ttlMs() {
  const s = parseInt(String(process.env.FIELD_DEAL_CODE_TTL_SEC || '600'), 10);
  return (Number.isFinite(s) && s > 60 && s < 3600 ? s : 600) * 1000;
}

function maxAttempts() {
  const n = parseInt(String(process.env.FIELD_DEAL_MAX_ATTEMPTS || '5'), 10);
  return Number.isFinite(n) && n >= 3 && n <= 15 ? n : 5;
}

function isManagerRole(role) {
  const r = String(role || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u00a0-]+/g, '_');
  return r === 'admin' || r === 'super_admin';
}

async function audit(supabase, sessionId, eventType, actorType, actorId, detail = {}) {
  await supabase.from('field_deal_audit_events').insert({
    session_id: sessionId,
    event_type: eventType,
    actor_type: actorType,
    actor_id: actorId,
    detail,
  });
}

function publicToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function phoneLast4(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length >= 4 ? d.slice(-4) : '****';
}

export async function createFieldDealSession(supabase, { reqUser, requesterRole, body }) {
  const sellerName = String(body?.sellerName || '').trim();
  if (!sellerName) {
    const err = new Error('Укажите ФИО продавца');
    err.status = 400;
    throw err;
  }
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  let totalRub = body?.totalRub != null ? Math.round(Number(body.totalRub)) : NaN;
  if (!Number.isFinite(totalRub)) {
    totalRub = 0;
    for (const r of rows) {
      const raw = r?.priceRub;
      const p =
        typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(/\s/g, '').replace(',', '.'));
      if (Number.isFinite(p)) totalRub += Math.round(p);
    }
  }
  if (!Number.isFinite(totalRub) || totalRub <= 0) {
    const err = new Error('Укажите итоговую сумму или стоимость по строкам');
    err.status = 400;
    throw err;
  }
  const { phone, phone_normalized } = scrapCustomerPhonePayload(body.phone);
  if (!phone || !phone_normalized) {
    const err = new Error('Укажите корректный телефон для СМС (РФ, 10 цифр)');
    err.status = 400;
    throw err;
  }

  let courierId = String(reqUser.id);
  const rawCourier = body?.courierId ? String(body.courierId).trim() : '';
  if (rawCourier && /^[0-9a-f-]{36}$/i.test(rawCourier)) {
    if (!isManagerRole(requesterRole)) {
      const err = new Error('Назначать курьера может только руководитель (admin / super_admin)');
      err.status = 403;
      throw err;
    }
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', rawCourier).maybeSingle();
    if (!prof?.role) {
      const err = new Error('Указанный курьер не найден в профилях');
      err.status = 400;
      throw err;
    }
    courierId = rawCourier;
  }

  let customerId =
    body?.customerId && /^[0-9a-f-]{36}$/i.test(String(body.customerId)) ? String(body.customerId) : null;
  if (!customerId) {
    const resolved = await resolveCustomerIdByPhone(supabase, phone);
    if (resolved) customerId = resolved;
  }

  const payload = {
    contractNo: String(body?.contractNo || '').trim(),
    sellerName,
    passportLine: String(body?.passportLine || '').trim(),
    address: String(body?.address || '').trim(),
    phone,
    appraiserName: String(body?.appraiserName || '').trim(),
    customerId: customerId || undefined,
    rows: rows.map((r) => ({
      itemName: String(r?.itemName || '').trim(),
      metal: String(r?.metal || '').trim(),
      probe: String(r?.probe || '').trim(),
      weightGross: String(r?.weightGross || '').trim(),
      weightNet: String(r?.weightNet || '').trim(),
      priceRub: r?.priceRub,
    })),
    totalRub,
  };

  const code = generateOtp6();
  const codeHash = hashOtp(code);
  const expires = new Date(Date.now() + ttlMs()).toISOString();
  const token = publicToken();
  const creatorEmail = String(reqUser.email || '').trim() || null;

  const { data: row, error } = await supabase
    .from('field_deal_sessions')
    .insert({
      public_token: token,
      status: 'pending',
      created_by: reqUser.id,
      creator_email: creatorEmail,
      courier_id: courierId,
      customer_id: customerId,
      phone,
      phone_normalized,
      payload,
      total_rub: totalRub,
      code_hash: codeHash,
      code_expires_at: expires,
      attempt_count: 0,
      max_attempts: maxAttempts(),
    })
    .select('id')
    .maybeSingle();

  if (error) throw error;
  const sessionId = row?.id;
  const smsDigits = `+7${phone_normalized}`;
  const text = `REAKTIVO: код подтверждения сделки ${code}. Никому не сообщайте. Действует ${Math.round(ttlMs() / 60000)} мин.`;

  await audit(supabase, sessionId, 'session_created', 'panel_user', reqUser.id, {
    totalRub,
    courierId,
  });

  try {
    await sendDealConfirmationSms({ to: smsDigits, text });
    await audit(supabase, sessionId, 'sms_sent', 'system', null, { provider: 'queued' });
  } catch (e) {
    await supabase.from('field_deal_sessions').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', sessionId);
    await audit(supabase, sessionId, 'sms_failed', 'system', null, { error: e?.message || String(e) });
    throw e;
  }

  return {
    sessionId,
    publicToken: token,
    expiresAt: expires,
    smsTo: phoneLast4(phone),
    /** Только для dev / внутренней приёмки: в prod не возвращать. */
    devCodePreview: process.env.FIELD_DEAL_RETURN_CODE === '1' ? code : undefined,
  };
}

export async function getPublicFieldDealSession(supabase, token) {
  const t = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(t)) {
    const err = new Error('Некорректная ссылка');
    err.status = 400;
    throw err;
  }
  const { data: s, error } = await supabase
    .from('field_deal_sessions')
    .select(
      'id, status, total_rub, phone, code_expires_at, attempt_count, max_attempts, payload, courier_id, created_at'
    )
    .eq('public_token', t)
    .maybeSingle();
  if (error) throw error;
  if (!s) {
    const err = new Error('Сессия не найдена');
    err.status = 404;
    throw err;
  }
  const now = Date.now();
  const expMs = new Date(s.code_expires_at).getTime();
  let status = s.status;
  if (status === 'pending' && now > expMs) {
    status = 'expired';
    await supabase.from('field_deal_sessions').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', s.id);
    await audit(supabase, s.id, 'expired', 'system', null, {});
  }
  const payload = s.payload || {};
  return {
    status,
    totalRub: s.total_rub,
    sellerName: String(payload.sellerName || '').trim() || 'Продавец',
    phoneLast4: phoneLast4(s.phone),
    attemptsUsed: s.attempt_count,
    attemptsMax: s.max_attempts,
    expiresAt: s.code_expires_at,
    canEnterCode: status === 'pending' && now <= expMs && s.attempt_count < s.max_attempts,
  };
}

export async function verifyFieldDealSession(supabase, { token, code, clientIp }) {
  const t = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(t)) {
    const err = new Error('Некорректная ссылка');
    err.status = 400;
    throw err;
  }
  const codeStr = String(code || '').replace(/\D/g, '');
  if (codeStr.length !== 6) {
    const err = new Error('Введите 6 цифр кода из СМС');
    err.status = 400;
    throw err;
  }

  const { data: s, error } = await supabase
    .from('field_deal_sessions')
    .select(
      'id, status, total_rub, phone, code_expires_at, attempt_count, max_attempts, code_hash, payload, courier_id, created_by, customer_id'
    )
    .eq('public_token', t)
    .maybeSingle();
  if (error) throw error;
  if (!s) {
    const err = new Error('Сессия не найдена');
    err.status = 404;
    throw err;
  }

  const now = Date.now();
  const expMs = new Date(s.code_expires_at).getTime();
  if (s.status !== 'pending') {
    const err = new Error(s.status === 'confirmed' ? 'Сделка уже подтверждена' : 'Сессия недоступна');
    err.status = 409;
    throw err;
  }
  if (now > expMs) {
    await supabase.from('field_deal_sessions').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', s.id);
    await audit(supabase, s.id, 'expired', 'client', null, {});
    const err = new Error('Код истёк, запросите новую ссылку у сотрудника');
    err.status = 410;
    throw err;
  }

  if ((s.attempt_count || 0) >= (s.max_attempts || 5)) {
    await supabase.from('field_deal_sessions').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', s.id);
    await audit(supabase, s.id, 'locked_out', 'client', null, { attempts: s.attempt_count });
    const err = new Error('Превышено число попыток. Обратитесь к сотруднику за новой ссылкой');
    err.status = 429;
    throw err;
  }

  const expectedHex = hashOtp(codeStr);
  const got = Buffer.from(String(s.code_hash || ''), 'hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const ok = got.length === expectedBuf.length && got.length > 0 && crypto.timingSafeEqual(got, expectedBuf);
  if (!ok) {
    const nextAttempt = (s.attempt_count || 0) + 1;
    await supabase
      .from('field_deal_sessions')
      .update({
        attempt_count: nextAttempt,
        last_client_ip: clientIp ? String(clientIp).slice(0, 45) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', s.id);
    await audit(supabase, s.id, 'verify_fail', 'client', null, { attempt: nextAttempt });
    if (nextAttempt >= (s.max_attempts || 5)) {
      await supabase.from('field_deal_sessions').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', s.id);
      await audit(supabase, s.id, 'locked_out', 'client', null, { attempts: nextAttempt });
    }
    const err = new Error('Неверный код');
    err.status = 401;
    throw err;
  }

  const body = {
    ...s.payload,
    customerId: s.customer_id || s.payload?.customerId,
    phone: s.phone,
  };
  const operatorId = s.courier_id || s.created_by;

  let dealId;
  try {
    dealId = await insertScrapDealRow(supabase, { operatorUserId: operatorId, body, totalRub: s.total_rub });
  } catch (e) {
    await supabase.from('field_deal_sessions').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', s.id);
    await audit(supabase, s.id, 'deal_insert_failed', 'system', null, { error: e?.message || String(e) });
    throw e;
  }

  await supabase
    .from('field_deal_sessions')
    .update({
      status: 'confirmed',
      scrap_deal_id: dealId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', s.id);

  await audit(supabase, s.id, 'confirmed', 'client', null, { scrap_deal_id: dealId });

  let customerEmail = null;
  if (s.customer_id) {
    const { data: cu } = await supabase.from('scrap_customers').select('full_name').eq('id', s.customer_id).maybeSingle();
    void cu;
  }

  try {
    const { data: deal } = await supabase
      .from('scrap_deals')
      .select('id, customer_id, contract_no, total_rub, seller_name, phone, "rows", appraiser_name, created_at')
      .eq('id', dealId)
      .maybeSingle();
    if (deal) {
      let passportLine = '—';
      let address = '—';
      let sellerName = (deal.seller_name && String(deal.seller_name).trim()) || '—';
      if (deal.customer_id) {
        const { data: cu } = await supabase
          .from('scrap_customers')
          .select('full_name, passport_line, address, phone')
          .eq('id', deal.customer_id)
          .maybeSingle();
        if (cu) {
          if (cu.full_name) sellerName = String(cu.full_name).trim();
          passportLine = (cu.passport_line && String(cu.passport_line).trim()) || '—';
          address = (cu.address && String(cu.address).trim()) || '—';
          customerEmail = null;
        }
      }
      const rows = Array.isArray(deal.rows) ? deal.rows : [];
      const issueFromDeal = deal.created_at
        ? new Date(deal.created_at).toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'Europe/Moscow',
          })
        : '';
      const buf = await buildScrapContractPdfBuffer({
        contractNo: deal.contract_no || '',
        sellerName,
        passportLine,
        address,
        phone: deal.phone || '',
        appraiserName:
          deal.appraiser_name != null && String(deal.appraiser_name).trim() !== ''
            ? deal.appraiser_name
            : '________________',
        rows,
        totalRub: deal.total_rub,
        issueDate: issueFromDeal,
      });
      const { data: uWrap, error: uErr } = await supabase.auth.admin.getUserById(s.created_by);
      if (uErr) console.warn('[field deal email]', uErr.message);
      const to = uWrap?.user?.email;
      if (to) {
        await sendDealReceiptEmailIfConfigured({
          toEmail: to,
          subject: 'Подтверждённая сделка: квитанция (PDF)',
          pdfBuffer: buf,
          filename: `dogovor-${String(dealId).slice(0, 8)}.pdf`,
        });
      }
    }
  } catch (e) {
    console.error('[field deal email/pdf]', e?.message || e);
  }

  return { ok: true, dealId };
}

export async function listFieldDealSessionsForManager(supabase, { limit = 40, offset = 0 }) {
  const lim = Math.min(100, Math.max(1, limit));
  const off = Math.max(0, offset);
  const { data, error, count } = await supabase
    .from('field_deal_sessions')
    .select(
      'id, public_token, status, total_rub, phone_normalized, creator_email, created_at, updated_at, attempt_count, max_attempts, scrap_deal_id, code_expires_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(off, off + lim - 1);
  if (error) throw error;
  return { rows: data || [], total: count ?? 0 };
}

export async function cancelFieldDealSession(supabase, { sessionId, reqUser, isManager }) {
  const id = String(sessionId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    const err = new Error('Некорректный id');
    err.status = 400;
    throw err;
  }
  const { data: s } = await supabase.from('field_deal_sessions').select('id, status, created_by').eq('id', id).maybeSingle();
  if (!s) {
    const err = new Error('Сессия не найдена');
    err.status = 404;
    throw err;
  }
  if (s.status !== 'pending') {
    const err = new Error('Отменить можно только ожидающую подтверждения');
    err.status = 409;
    throw err;
  }
  if (s.created_by !== reqUser.id && !isManager) {
    const err = new Error('Недостаточно прав');
    err.status = 403;
    throw err;
  }
  await supabase.from('field_deal_sessions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id);
  await audit(supabase, id, 'cancelled', 'panel_user', reqUser.id, {});
  return { ok: true };
}
