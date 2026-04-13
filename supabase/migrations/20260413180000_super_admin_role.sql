-- Роль super_admin: полный доступ к пользователям; admin — только курьеры и продавцы

alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'seller', 'courier'));

-- Первый пользователь в пустой БД (нет ни admin, ни super_admin) получает super_admin
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

comment on column public.profiles.role is 'super_admin | admin | seller | courier';
