-- Фикс: fintech_record_ledger_entry падал с "column reference rub_balance is ambiguous".
-- Причина: RETURNS TABLE(rub_balance, gold_grams, ...) создаёт OUT-переменные с именами,
-- совпадающими с колонками fintech_balances — без явной квалификации таблицей Postgres
-- не мог определить, что имелось в виду, внутри UPDATE ... RETURNING.
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
