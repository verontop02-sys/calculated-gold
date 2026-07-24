-- Чат поддержки: клиент (кабинет, вход по телефону) ↔ сотрудники панели.
-- Тред привязан к нормализованному телефону клиента — единый для скупки и биржи.
-- Доступ к таблицам — только service_role (Node API), как у остальных бизнес-таблиц.

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  phone_normalized text not null unique,
  status text not null default 'open' check (status in ('open', 'closed')),
  -- Денормализация для списка тредов без join'ов
  last_message_at timestamptz null,
  last_message_preview text null,
  last_message_from text null check (last_message_from in ('client', 'staff')),
  staff_unread integer not null default 0,   -- сообщений клиента, не прочитанных поддержкой
  client_unread integer not null default 0,  -- ответов поддержки, не прочитанных клиентом
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_threads_last_message_idx
  on public.support_threads (last_message_at desc nulls last);

alter table public.support_threads enable row level security;

drop policy if exists "support_threads_deny_all" on public.support_threads;
create policy "support_threads_deny_all"
  on public.support_threads for all
  using (false);

grant all on public.support_threads to service_role;

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads (id) on delete cascade,
  sender text not null check (sender in ('client', 'staff')),
  staff_id uuid null,
  staff_name text null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_thread_idx
  on public.support_messages (thread_id, created_at);

alter table public.support_messages enable row level security;

drop policy if exists "support_messages_deny_all" on public.support_messages;
create policy "support_messages_deny_all"
  on public.support_messages for all
  using (false);

grant all on public.support_messages to service_role;
