-- Клиенты для договора-квитанции (лом ювелирных изделий). Доступ только через Node API (service_role).

create table if not exists public.scrap_customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  passport_line text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scrap_customers_updated_at_idx on public.scrap_customers (updated_at desc);
create index if not exists scrap_customers_phone_idx on public.scrap_customers (phone);
create index if not exists scrap_customers_full_name_lower_idx on public.scrap_customers (lower(full_name));

alter table public.scrap_customers enable row level security;

drop policy if exists "scrap_customers_deny_all" on public.scrap_customers;
create policy "scrap_customers_deny_all"
  on public.scrap_customers for all
  using (false);

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on public.scrap_customers to service_role;
