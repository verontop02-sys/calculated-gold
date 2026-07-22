-- Этап 9, раунд 1: клиентский fintech-кабинет.
-- Отдельная сущность клиента (не scrap_customers — это другая бизнес-линия: инвестиции в золото,
-- а не скупка лома). Ledger — единственный источник правды, append-only. Баланс — проекция,
-- обновляется атомарно вместе с ledger внутри Postgres-функции (см. ниже), чтобы избежать
-- гонок при параллельных операциях и потери денег при сетевом сбое между двумя запросами.
--
-- Доступ к таблицам — только service_role (Node API), как у остальных бизнес-таблиц.

create table if not exists public.fintech_clients (
  id uuid primary key default gen_random_uuid(),
  phone_normalized text not null unique,
  email text null,
  full_name text null,
  status text not null default 'new'
    check (status in ('new', 'pending_review', 'approved', 'rejected', 'blocked')),
  reject_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fintech_clients_status_idx on public.fintech_clients (status, created_at desc);

alter table public.fintech_clients enable row level security;
drop policy if exists "fintech_clients_deny_all" on public.fintech_clients;
create policy "fintech_clients_deny_all" on public.fintech_clients for all using (false);
grant all on public.fintech_clients to service_role;

-- ── KYC-документы ────────────────────────────────────────────────────────────
create table if not exists public.fintech_kyc_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.fintech_clients (id) on delete cascade,
  doc_type text not null
    check (doc_type in ('passport_main', 'passport_registration', 'selfie')),
  storage_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid null,
  reviewed_at timestamptz null,
  reject_reason text null,
  created_at timestamptz not null default now()
);

create index if not exists fintech_kyc_documents_client_idx
  on public.fintech_kyc_documents (client_id, created_at desc);
create index if not exists fintech_kyc_documents_status_idx
  on public.fintech_kyc_documents (status, created_at desc);

alter table public.fintech_kyc_documents enable row level security;
drop policy if exists "fintech_kyc_documents_deny_all" on public.fintech_kyc_documents;
create policy "fintech_kyc_documents_deny_all" on public.fintech_kyc_documents for all using (false);
grant all on public.fintech_kyc_documents to service_role;

-- ── Ledger: единственный источник правды, только INSERT ────────────────────
-- Корректировки — отдельной компенсирующей записью (reversal_of), старые строки никогда не правятся.
create table if not exists public.fintech_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.fintech_clients (id) on delete restrict,
  entry_type text not null
    check (entry_type in ('deposit_rub', 'withdraw_rub', 'buy_gold', 'sell_gold', 'fee', 'correction')),
  rub_delta numeric(18, 2) not null default 0,
  gold_grams_delta numeric(18, 6) not null default 0,
  rate_rub_per_gram numeric(14, 2) null,
  fee_rub numeric(18, 2) not null default 0,
  idempotency_key text not null unique,
  created_by_type text not null check (created_by_type in ('client', 'staff', 'system')),
  created_by_id uuid null,
  reversal_of uuid null references public.fintech_ledger_entries (id),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fintech_ledger_client_idx
  on public.fintech_ledger_entries (client_id, created_at desc);
create index if not exists fintech_ledger_type_idx
  on public.fintech_ledger_entries (entry_type, created_at desc);

alter table public.fintech_ledger_entries enable row level security;
drop policy if exists "fintech_ledger_deny_all" on public.fintech_ledger_entries;
create policy "fintech_ledger_deny_all" on public.fintech_ledger_entries for all using (false);
grant all on public.fintech_ledger_entries to service_role;

-- ── Баланс: материализованная проекция ledger ───────────────────────────────
create table if not exists public.fintech_balances (
  client_id uuid primary key references public.fintech_clients (id) on delete cascade,
  rub_balance numeric(18, 2) not null default 0,
  gold_grams numeric(18, 6) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.fintech_balances enable row level security;
drop policy if exists "fintech_balances_deny_all" on public.fintech_balances;
create policy "fintech_balances_deny_all" on public.fintech_balances for all using (false);
grant all on public.fintech_balances to service_role;

-- ── RPC: атомарная запись в ledger + обновление баланса ─────────────────────
-- UPDATE ... WHERE client_id = ... блокирует строку баланса на время транзакции —
-- параллельные операции над одним клиентом сериализуются, гонок не будет.
-- idempotency_key делает повтор запроса (например, при ретрае после таймаута) безопасным:
-- при совпадении ключа возвращаем уже посчитанный результат, новую запись не создаём.
create or replace function public.fintech_record_ledger_entry(
  p_client_id uuid,
  p_entry_type text,
  p_rub_delta numeric,
  p_gold_grams_delta numeric,
  p_rate_rub_per_gram numeric,
  p_fee_rub numeric,
  p_idempotency_key text,
  p_created_by_type text,
  p_created_by_id uuid,
  p_detail jsonb default '{}'::jsonb,
  p_reversal_of uuid default null
)
returns table (
  entry_id uuid,
  rub_balance numeric,
  gold_grams numeric,
  is_duplicate boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_new_rub numeric;
  v_new_gold numeric;
  v_allow_negative boolean;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'idempotency_key_required';
  end if;

  select id into v_existing_id
    from public.fintech_ledger_entries
    where idempotency_key = p_idempotency_key;

  if v_existing_id is not null then
    select b.rub_balance, b.gold_grams into v_new_rub, v_new_gold
      from public.fintech_balances b where b.client_id = p_client_id;
    return query select v_existing_id, coalesce(v_new_rub, 0), coalesce(v_new_gold, 0), true;
    return;
  end if;

  v_allow_negative := p_entry_type = 'correction';

  insert into public.fintech_balances (client_id, rub_balance, gold_grams)
    values (p_client_id, 0, 0)
    on conflict (client_id) do nothing;

  -- Явная квалификация fintech_balances.* обязательна: RETURNS TABLE(rub_balance, gold_grams, ...)
  -- создаёт OUT-переменные с ТЕМИ ЖЕ именами, что и колонки таблицы — без алиаса Postgres
  -- не может определить, что имелось в виду ("column reference is ambiguous").
  update public.fintech_balances
    set rub_balance = fintech_balances.rub_balance + p_rub_delta,
        gold_grams = fintech_balances.gold_grams + p_gold_grams_delta,
        updated_at = now()
    where client_id = p_client_id
    returning fintech_balances.rub_balance, fintech_balances.gold_grams into v_new_rub, v_new_gold;

  if not v_allow_negative and (v_new_rub < -0.005 or v_new_gold < -0.000001) then
    raise exception 'insufficient_balance';
  end if;

  insert into public.fintech_ledger_entries (
    client_id, entry_type, rub_delta, gold_grams_delta, rate_rub_per_gram,
    fee_rub, idempotency_key, created_by_type, created_by_id, detail, reversal_of
  ) values (
    p_client_id, p_entry_type, p_rub_delta, p_gold_grams_delta, p_rate_rub_per_gram,
    p_fee_rub, p_idempotency_key, p_created_by_type, p_created_by_id,
    coalesce(p_detail, '{}'::jsonb), p_reversal_of
  )
  returning id into v_existing_id;

  return query select v_existing_id, v_new_rub, v_new_gold, false;
end;
$$;

revoke all on function public.fintech_record_ledger_entry(
  uuid, text, numeric, numeric, numeric, numeric, text, text, uuid, jsonb, uuid
) from public;
grant execute on function public.fintech_record_ledger_entry(
  uuid, text, numeric, numeric, numeric, numeric, text, text, uuid, jsonb, uuid
) to service_role;

-- ── Storage: приватный бакет для паспортных документов ──────────────────────
-- public = false: файлы не отдаются по прямой ссылке, только через signed URL,
-- который выписывает Node с service_role (см. server/fintechAdmin.js).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kyc-documents',
  'kyc-documents',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;
