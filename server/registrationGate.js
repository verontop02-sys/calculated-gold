/**
 * Временный закрытый режим кабинетов (просьба 29.07):
 * лендинг открыт всем, но SMS-регистрация / вход новых номеров в /kabinet
 * и в fintech-кабинет — только для команды, пока не готовы к потоку клиентов.
 *
 *   FINTECH_REGISTRATION_OPEN=1 — снять ограничение для всех;
 *   FINTECH_ALLOWED_PHONES=9161234567,999… — тестовые номера (10 цифр, без 7/8).
 *
 * Уже «свои»: approved в fintech_clients, либо есть PIN кабинета, либо были сделки скупки.
 */

function normalizePhone(v) {
  const digits = String(v || '').replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) return digits.slice(1);
  if (digits.length === 10) return digits;
  return '';
}

export function isClientRegistrationOpen() {
  return process.env.FINTECH_REGISTRATION_OPEN === '1';
}

export function isAllowlistedClientPhone(phoneNormalized) {
  const raw = (process.env.FINTECH_ALLOWED_PHONES || '').trim();
  if (!raw) return false;
  const norm = normalizePhone(phoneNormalized);
  return raw
    .split(',')
    .map((s) => normalizePhone(s))
    .filter(Boolean)
    .includes(norm);
}

function closedError() {
  const err = new Error(
    'Кабинет пока в закрытом тестировании — доступ есть только у команды Reaktivo. ' +
      'Мы скоро откроем регистрацию для всех, следите за новостями на Reaktivo.pro.'
  );
  err.status = 403;
  return err;
}

async function isApprovedFintech(supabase, phoneNormalized) {
  const { data, error } = await supabase
    .from('fintech_clients')
    .select('status')
    .eq('phone_normalized', phoneNormalized)
    .maybeSingle();
  if (error) throw error;
  return data?.status === 'approved';
}

async function hasClientPin(supabase, phoneNormalized) {
  const { data, error } = await supabase
    .from('app_kv')
    .select('key')
    .eq('key', `client_pin:${phoneNormalized}`)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function hasScrapDeal(supabase, phoneNormalized) {
  const { data, error } = await supabase
    .from('scrap_deals')
    .select('id')
    .eq('phone_normalized', phoneNormalized)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/** Разрешён ли SMS-вход / регистрация для этого номера. */
export async function assertClientAccessAllowed(supabase, phoneNormalized) {
  const norm = normalizePhone(phoneNormalized);
  if (!norm) throw closedError();
  if (isClientRegistrationOpen()) return;
  if (isAllowlistedClientPhone(norm)) return;
  if (await isApprovedFintech(supabase, norm)) return;
  if (await hasClientPin(supabase, norm)) return;
  if (await hasScrapDeal(supabase, norm)) return;
  throw closedError();
}
