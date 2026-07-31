  -- Этап 9: заявки на вывод средств fintech-кабинета.
  -- Пока нет интеграции с A7/ПСБ, вывод — ручной процесс: клиент подаёт заявку,
  -- деньги сразу резервируются (списываются с рублёвого баланса через ledger,
  -- чтобы их нельзя было потратить повторно на покупку золота, пока заявка висит),
  -- модератор переводит деньги вне системы и отмечает заявку оплаченной, либо
  -- отклоняет — тогда списанная сумма возвращается компенсирующей записью в ledger.

  create table if not exists public.fintech_withdrawal_requests (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.fintech_clients (id) on delete restrict,
    rub_amount numeric(18, 2) not null,
    fee_rub numeric(18, 2) not null default 0,
    net_rub numeric(18, 2) not null,
    payout_details text null,
    status text not null default 'pending'
      check (status in ('pending', 'approved', 'paid', 'rejected')),
    reject_reason text null,
    ledger_entry_id uuid null references public.fintech_ledger_entries (id),
    refund_ledger_entry_id uuid null references public.fintech_ledger_entries (id),
    decided_by uuid null,
    decided_at timestamptz null,
    created_at timestamptz not null default now()
  );

  create index if not exists fintech_withdrawal_requests_client_idx
    on public.fintech_withdrawal_requests (client_id, created_at desc);
  create index if not exists fintech_withdrawal_requests_status_idx
    on public.fintech_withdrawal_requests (status, created_at desc);

  alter table public.fintech_withdrawal_requests enable row level security;
  drop policy if exists "fintech_withdrawal_requests_deny_all" on public.fintech_withdrawal_requests;
  create policy "fintech_withdrawal_requests_deny_all" on public.fintech_withdrawal_requests for all using (false);
  grant all on public.fintech_withdrawal_requests to service_role;
