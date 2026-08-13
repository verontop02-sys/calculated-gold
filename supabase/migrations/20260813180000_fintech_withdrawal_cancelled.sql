-- Клиент может отменить заявку на вывод до выплаты; статус cancelled + возврат на баланс.
alter table public.fintech_withdrawal_requests
  drop constraint if exists fintech_withdrawal_requests_status_check;

alter table public.fintech_withdrawal_requests
  add constraint fintech_withdrawal_requests_status_check
  check (status in ('pending', 'approved', 'paid', 'rejected', 'cancelled'));
