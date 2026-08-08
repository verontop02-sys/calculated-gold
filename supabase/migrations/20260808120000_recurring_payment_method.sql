-- Автопополнение регулярных инвестиций: сохранённый способ оплаты ЮKassa + таблица методов.

create table if not exists public.fintech_payment_methods (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.fintech_clients (id) on delete cascade,
  provider text not null default 'yookassa',
  method_id text not null,
  card_last4 text null,
  card_type text null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, method_id)
);

create index if not exists fintech_payment_methods_client_idx
  on public.fintech_payment_methods (client_id, status);

alter table public.fintech_payment_methods enable row level security;
drop policy if exists "fintech_payment_methods_deny_all" on public.fintech_payment_methods;
create policy "fintech_payment_methods_deny_all" on public.fintech_payment_methods for all using (false);
grant all on public.fintech_payment_methods to service_role;

alter table public.fintech_recurring_investments
  add column if not exists funding_mode text not null default 'balance'
    check (funding_mode in ('balance', 'card')),
  add column if not exists auto_topup boolean not null default false,
  add column if not exists yoo_payment_method_id text null,
  add column if not exists card_last4 text null,
  add column if not exists card_type text null;

comment on column public.fintech_recurring_investments.funding_mode is
  'balance = покупка с рублёвого баланса; card = сначала charge saved method, потом buyGold';
comment on column public.fintech_recurring_investments.auto_topup is
  'true если подписка должна списывать с сохранённой карты';
