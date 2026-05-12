-- История изменений модуля "Индекс золота" (города + конкуренты).

create table if not exists public.gold_index_changes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('city', 'competitor')),
  entity_id uuid not null,
  city_id uuid null references public.gold_index_cities (id) on delete set null,
  action text not null check (action in ('create', 'update', 'delete')),
  changed_by uuid null,
  payload jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists gold_index_changes_city_idx on public.gold_index_changes (city_id, created_at desc);
create index if not exists gold_index_changes_entity_idx on public.gold_index_changes (entity_type, entity_id);
create index if not exists gold_index_changes_created_idx on public.gold_index_changes (created_at desc);

alter table public.gold_index_changes enable row level security;

drop policy if exists "gold_index_changes_deny_all" on public.gold_index_changes;
create policy "gold_index_changes_deny_all"
  on public.gold_index_changes for all
  using (false);

grant all on public.gold_index_changes to service_role;
