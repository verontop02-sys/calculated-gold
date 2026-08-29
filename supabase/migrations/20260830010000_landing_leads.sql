-- Заявки с публичных лендингов reaktivo.ru / reaktivo.pro:
-- продать, агенты, слитки, resale, франшиза, партнёрам, консультация с pro.
-- Пишет и читает только Node API (service_role), как чат поддержки.

create table if not exists public.landing_leads (
  id uuid primary key default gen_random_uuid(),
  source text not null,                       -- slug страницы: prodat / agenty / slitki / resale / franshiza / partneram / pro
  name text not null,
  phone text not null,                        -- телефон или telegram, как ввёл человек
  fields jsonb not null default '{}'::jsonb,  -- доп. поля формы: город, объём и т.п.
  status text not null default 'new' check (status in ('new', 'in_progress', 'done')),
  processed_by uuid null,
  processed_by_name text null,
  processed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists landing_leads_created_idx
  on public.landing_leads (created_at desc);
create index if not exists landing_leads_status_idx
  on public.landing_leads (status, created_at desc);

alter table public.landing_leads enable row level security;

drop policy if exists "landing_leads_deny_all" on public.landing_leads;
create policy "landing_leads_deny_all"
  on public.landing_leads for all
  using (false);

grant all on public.landing_leads to service_role;
