-- Исправление: старая claim_first_admin из init проверяла только role = 'admin'.
-- Если в проекте были только super_admin, условие «админа нет» оставалось истинным,
-- и при каждом входе текущий пользователь перезаписывался в admin — «пропадал» второй супер.
-- Эта версия совпадает с логикой в server/index.js (ensureProfileAndBootstrap).

create or replace function public.claim_first_admin(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where role in ('super_admin', 'admin')) then
    update public.profiles set role = 'super_admin', updated_at = now() where id = uid;
  end if;
end;
$$;

comment on function public.claim_first_admin(uuid) is
  'First super_admin when no admin/super_admin exists. Counts both super_admin and admin; does not demote other users.';
