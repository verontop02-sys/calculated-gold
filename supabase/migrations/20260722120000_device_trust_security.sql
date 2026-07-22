-- Безопасность панели: доверенные устройства сотрудников + журнал входов.
-- Первый вход с нового устройства подтверждается кодом на email.
-- Доступ к таблицам — только service_role (Node API), как у остальных бизнес-таблиц.

create table if not exists public.panel_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_hash text not null,
  label text null,
  created_ip text null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, device_hash)
);

create index if not exists panel_trusted_devices_user_idx
  on public.panel_trusted_devices (user_id, last_seen_at desc);

alter table public.panel_trusted_devices enable row level security;

drop policy if exists "panel_trusted_devices_deny_all" on public.panel_trusted_devices;
create policy "panel_trusted_devices_deny_all"
  on public.panel_trusted_devices for all
  using (false);

grant all on public.panel_trusted_devices to service_role;

-- Журнал событий входа: отправка/проверка кодов, доверение устройств.
-- Задел под этап 9 (fintech-кабинет): единый аудит доступа сотрудников.
create table if not exists public.panel_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  email text null,
  event_type text not null check (event_type in (
    'device_code_sent',
    'device_code_verified',
    'device_code_failed',
    'device_trusted',
    'device_check_denied'
  )),
  ip text null,
  user_agent text null,
  device_hash text null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists panel_login_events_user_idx
  on public.panel_login_events (user_id, created_at desc);
create index if not exists panel_login_events_type_idx
  on public.panel_login_events (event_type, created_at desc);

alter table public.panel_login_events enable row level security;

drop policy if exists "panel_login_events_deny_all" on public.panel_login_events;
create policy "panel_login_events_deny_all"
  on public.panel_login_events for all
  using (false);

grant all on public.panel_login_events to service_role;
