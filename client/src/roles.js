/** Подписи ролей (Supabase public.profiles.role) */
export const ROLE_LABELS = {
  admin: 'Администратор',
  seller: 'Продавец',
  courier: 'Курьер',
};

export function roleLabel(role) {
  if (role == null || role === '') return 'Курьер';
  return ROLE_LABELS[role] || role;
}
