-- Напоминание: claim_first_admin лишь назначает первого super_admin при отсутствии admin/super_admin в БД.
-- Ограничения «ровно один супер» нет — сколько угодно строк profiles с role = 'super_admin'.

comment on function public.claim_first_admin(uuid) is
  'If no admin/super_admin exists yet, promotes uid to super_admin. Multiple super_admins are allowed; add more via API or profiles.role.';
