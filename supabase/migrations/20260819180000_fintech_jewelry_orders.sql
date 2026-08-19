-- Заказы ювелирных изделий в кабинете клиента (не портфель и не граммы).

create table if not exists public.fintech_jewelry_orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.fintech_clients (id) on delete cascade,
  catalog_id text null,
  title text not null,
  assay integer null,
  weight_g numeric null,
  form text null,
  price_rub numeric not null,
  status text not null default 'stored' check (status in ('stored', 'ready', 'issued')),
  payment_id text null unique,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists fintech_jewelry_orders_client_idx
  on public.fintech_jewelry_orders (client_id, paid_at desc);

alter table public.fintech_jewelry_orders enable row level security;
drop policy if exists "fintech_jewelry_orders_deny_all" on public.fintech_jewelry_orders;
create policy "fintech_jewelry_orders_deny_all" on public.fintech_jewelry_orders for all using (false);
grant all on public.fintech_jewelry_orders to service_role;
