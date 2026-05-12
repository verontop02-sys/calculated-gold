-- Индекс золота: города и конкуренты (ручной ввод). Доступ только через Node API (service_role).

create table if not exists public.gold_index_cities (
  id uuid primary key default gen_random_uuid(),
  region_code text not null,
  region_name text not null,
  city_name text not null,
  lat double precision not null,
  lng double precision not null,
  population int null check (population is null or population >= 0),
  notes text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gold_index_cities_region_idx on public.gold_index_cities (region_code);
create index if not exists gold_index_cities_city_idx on public.gold_index_cities (city_name);

create table if not exists public.gold_index_competitors (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.gold_index_cities (id) on delete cascade,
  company_name text not null,
  probes jsonb not null default '{}'::jsonb,
  measured_at date null,
  notes text null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gold_index_competitors_city_idx on public.gold_index_competitors (city_id);

alter table public.gold_index_cities enable row level security;
alter table public.gold_index_competitors enable row level security;

drop policy if exists "gold_index_cities_deny_all" on public.gold_index_cities;
create policy "gold_index_cities_deny_all"
  on public.gold_index_cities for all
  using (false);

drop policy if exists "gold_index_competitors_deny_all" on public.gold_index_competitors;
create policy "gold_index_competitors_deny_all"
  on public.gold_index_competitors for all
  using (false);

grant all on public.gold_index_cities to service_role;
grant all on public.gold_index_competitors to service_role;
