-- Сделки по договорам-квитанциям (лом). Для истории и аналитики. Доступ только через Node API (service_role).

create table if not exists public.scrap_deals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid null references public.scrap_customers (id) on delete set null,
  operator_id uuid null,
  contract_no text null,
  total_rub int not null,
  seller_name text,
  phone text,
  phone_normalized text,
  rows jsonb not null default '[]'::jsonb,
  first_probe int null,
  first_weight_gross numeric,
  first_weight_net numeric,
  created_at timestamptz not null default now()
);

create index if not exists scrap_deals_created_at_idx on public.scrap_deals (created_at desc);
create index if not exists scrap_deals_customer_id_idx on public.scrap_deals (customer_id, created_at desc);
create index if not exists scrap_deals_phone_norm_idx on public.scrap_deals (phone_normalized, created_at desc);
create index if not exists scrap_deals_first_probe_idx on public.scrap_deals (first_probe) where first_probe is not null;

alter table public.scrap_deals enable row level security;

drop policy if exists "scrap_deals_deny_all" on public.scrap_deals;
create policy "scrap_deals_deny_all"
  on public.scrap_deals for all
  using (false);

grant all on public.scrap_deals to service_role;
