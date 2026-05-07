-- Сессии подтверждения сделки по СМС (полевой сценарий без отдельного приложения).
-- Запись в scrap_deals только после успешного ввода кода. Доступ к таблицам — service_role (Node API).

create table if not exists public.field_deal_sessions (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'expired', 'cancelled', 'failed')),
  created_by uuid not null,
  creator_email text,
  courier_id uuid not null,
  customer_id uuid null references public.scrap_customers (id) on delete set null,
  phone text not null,
  phone_normalized text null,
  payload jsonb not null default '{}'::jsonb,
  total_rub int not null check (total_rub > 0),
  code_hash text not null,
  code_expires_at timestamptz not null,
  attempt_count int not null default 0,
  max_attempts int not null default 5,
  scrap_deal_id uuid null references public.scrap_deals (id) on delete set null,
  last_client_ip text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists field_deal_sessions_created_at_idx on public.field_deal_sessions (created_at desc);
create index if not exists field_deal_sessions_created_by_idx on public.field_deal_sessions (created_by);
create index if not exists field_deal_sessions_status_idx on public.field_deal_sessions (status);
create index if not exists field_deal_sessions_phone_norm_idx on public.field_deal_sessions (phone_normalized);

alter table public.field_deal_sessions enable row level security;

drop policy if exists "field_deal_sessions_deny_all" on public.field_deal_sessions;
create policy "field_deal_sessions_deny_all"
  on public.field_deal_sessions for all
  using (false);

grant all on public.field_deal_sessions to service_role;

create table if not exists public.field_deal_audit_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.field_deal_sessions (id) on delete cascade,
  event_type text not null,
  actor_type text not null check (actor_type in ('panel_user', 'client', 'system')),
  actor_id uuid null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists field_deal_audit_session_idx on public.field_deal_audit_events (session_id, created_at desc);

alter table public.field_deal_audit_events enable row level security;

drop policy if exists "field_deal_audit_deny_all" on public.field_deal_audit_events;
create policy "field_deal_audit_deny_all"
  on public.field_deal_audit_events for all
  using (false);

grant all on public.field_deal_audit_events to service_role;
