/**
 * Мобильный сотрудника: код подтверждения входа с нового устройства
 * уходит SMS на этот номер (не на почту).
 *
 * Источник истины — user_metadata.phone (10 цифр). Auth.phone пишем, если
 * провайдер телефона в Supabase включён; profiles.phone_normalized — кэш.
 */

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
