-- Свои визиты reaktivo.pro и reaktivo.ru. Яндекс Метрика недоступна,
-- поэтому посещаемость копится здесь. Пишет и читает только Node API.

create table if not exists public.site_hits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  site text not null check (site in ('pro', 'ru')),
  path text not null,
  session_id text not null,
  referrer_host text null
);

create index if not exists site_hits_created_idx
  on public.site_hits (created_at desc);
create index if not exists site_hits_site_created_idx
  on public.site_hits (site, created_at desc);

alter table public.site_hits enable row level security;

drop policy if exists "site_hits_deny_all" on public.site_hits;
create policy "site_hits_deny_all"
  on public.site_hits for all
  using (false);

grant all on public.site_hits to service_role;
