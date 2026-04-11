-- Calculated Gold: profiles + app state (service role API only for writes beyond own profile read)

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'courier' check (role in ('admin', 'seller', 'courier')),
  updated_at timestamptz default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'courier');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomic: первый зарегистрированный пользователь может стать админом (вызывается из API)
create or replace function public.claim_first_admin(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    update public.profiles set role = 'admin', updated_at = now() where id = uid;
  end if;
end;
$$;

create table if not exists public.app_kv (
  key text primary key,
  value jsonb not null default '{}'::jsonb
);

insert into public.app_kv (key, value)
values ('settings', '{}'::jsonb), ('gold_price', '{}'::jsonb)
on conflict (key) do nothing;

alter table public.profiles enable row level security;
alter table public.app_kv enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "app_kv_deny_all" on public.app_kv;
create policy "app_kv_deny_all"
  on public.app_kv for all
  using (false);

grant usage on schema public to postgres, anon, authenticated, service_role;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant all on public.app_kv to service_role;
