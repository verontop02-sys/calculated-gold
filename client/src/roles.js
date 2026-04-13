/** Подписи ролей (Supabase public.profiles.role) */
export const ROLE_LABELS = {
  super_admin: 'Супер-администратор',
  admin: 'Администратор',
  seller: 'Продавец',
  courier: 'Курьер',
};

function normalizeRoleKey(role) {
  let r = String(role ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u00a0-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (r === 'super-admin' || r === 'superadmin') r = 'super_admin';
  return r;
}

function roleLettersOnly(role) {
  return String(role ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Админ или супер: вкладка «Пользователи» — создание курьеров и продавцов (ограничения на сервере). */
export function isUserManagerRole(role) {
  const r = normalizeRoleKey(role);
  return r === 'admin' || r === 'super_admin';
}

/** Супер-админ: настройки выкупа, курс, полное управление, в т.ч. администраторами. */
export function isSuperAdminRole(role) {
  if (role == null || role === '') return false;
  if (normalizeRoleKey(role) === 'super_admin') return true;
  return roleLettersOnly(role) === 'superadmin';
}

/** Роль «админ или супер» у строки в списке пользователей (учёт регистра/пробелов из API). */
export function isAdminOrSuperProfile(role) {
  const r = normalizeRoleKey(role);
  return r === 'admin' || r === 'super_admin';
}

export function roleLabel(role) {
  if (role == null || role === '') return 'Курьер';
  const k = normalizeRoleKey(role);
  return ROLE_LABELS[k] || role;
}
