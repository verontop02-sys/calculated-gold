-- Этап 9, пункты 6-7: ценовые коридоры и регулярные инвестиции.
--
-- Ценовые коридоры: клиент задаёт целевой курс, фоновый тик сравнивает его с текущим
-- курсом и исполняет сделку автоматически. Защита от повторного исполнения — переход
-- статуса active -> triggered/failed атомарным UPDATE ... WHERE status = 'active'
-- (см. fintechAutomation.js), после чего строка больше не обрабатывается — она же
-- служит журналом срабатываний (triggered_at, triggered_rate, ledger_entry_id).
--
-- Регулярные инвестиции: пока нет сохранённого платёжного токена эквайринга (см. ТЗ),
-- список выполняет автоматическую покупку золота с уже пополненного рублёвого баланса
-- клиента по расписанию. Как только появится эквайринг — перед покупкой добавится шаг
-- списания с карты по токену, остальная схема (расписание, ретраи, история) не изменится.

create table if not exists public.fintech_price_alerts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.fintech_clients (id) on delete cascade,
  direction text not null check (direction in ('buy', 'sell')),
  target_rate_rub_per_gram numeric(14, 2) not null check (target_rate_rub_per_gram > 0),
  amount_mode text not null check (amount_mode in ('grams', 'rub')),
  amount_value numeric(18, 6) not null check (amount_value > 0),
  status text not null default 'active' check (status in ('active', 'triggered', 'failed', 'cancelled')),
  triggered_at timestamptz null,
  triggered_rate numeric(14, 2) null,
  ledger_entry_id uuid null references public.fintech_ledger_entries (id),
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fintech_price_alerts_client_idx
  on public.fintech_price_alerts (client_id, created_at desc);
create index if not exists fintech_price_alerts_active_idx
  on public.fintech_price_alerts (status) where status = 'active';

alter table public.fintech_price_alerts enable row level security;
drop policy if exists "fintech_price_alerts_deny_all" on public.fintech_price_alerts;
create policy "fintech_price_alerts_deny_all" on public.fintech_price_alerts for all using (false);
grant all on public.fintech_price_alerts to service_role;

-- ── Регулярные инвестиции: одна активная подписка на клиента ────────────────
create table if not exists public.fintech_recurring_investments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.fintech_clients (id) on delete cascade,
  rub_amount numeric(18, 2) not null check (rub_amount > 0),
  day_of_month smallint not null check (day_of_month between 1 and 28),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  consecutive_failures int not null default 0,
  last_run_at timestamptz null,
  last_run_status text null,
  next_run_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fintech_recurring_investments enable row level security;
drop policy if exists "fintech_recurring_investments_deny_all" on public.fintech_recurring_investments;
create policy "fintech_recurring_investments_deny_all" on public.fintech_recurring_investments for all using (false);
grant all on public.fintech_recurring_investments to service_role;

-- ── История запусков автоплатежа (для истории в кабинете и ретраев) ─────────
create table if not exists public.fintech_recurring_runs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.fintech_recurring_investments (id) on delete cascade,
  client_id uuid not null references public.fintech_clients (id) on delete cascade,
  run_date date not null,
  status text not null check (status in ('running', 'success', 'failed')),
  rub_amount numeric(18, 2) not null,
  grams_bought numeric(18, 6) null,
  error_message text null,
  ledger_entry_id uuid null references public.fintech_ledger_entries (id),
  created_at timestamptz not null default now(),
  unique (subscription_id, run_date)
);

create index if not exists fintech_recurring_runs_client_idx
  on public.fintech_recurring_runs (client_id, created_at desc);

alter table public.fintech_recurring_runs enable row level security;
drop policy if exists "fintech_recurring_runs_deny_all" on public.fintech_recurring_runs;
create policy "fintech_recurring_runs_deny_all" on public.fintech_recurring_runs for all using (false);
grant all on public.fintech_recurring_runs to service_role;
