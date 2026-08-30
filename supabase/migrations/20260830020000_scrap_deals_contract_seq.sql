-- Автонумерация договоров: оператор и курьер больше не вводят номер руками —
-- нельзя доверять человеку, который не видит остальные сделки, продолжение сквозной
-- нумерации. Последовательность стартует сразу после максимального уже занятого номера,
-- чтобы не задвоить существующие договоры.
create sequence if not exists public.scrap_deals_contract_no_seq;

do $$
declare
  max_no bigint;
begin
  select coalesce(max(contract_no::bigint), 0)
    into max_no
    from public.scrap_deals
    where contract_no ~ '^[0-9]+$';

  -- setval(..., max_no, true) — следующий nextval() вернёт max_no + 1.
  -- Условие защищает от повторного прогона миграции: не сдвигаем номер назад.
  if max_no >= (select last_value from public.scrap_deals_contract_no_seq) then
    perform setval('public.scrap_deals_contract_no_seq', max_no, true);
  end if;
end $$;

create or replace function public.next_scrap_contract_no()
returns text
language sql
as $$
  select nextval('public.scrap_deals_contract_no_seq')::text;
$$;

grant usage on sequence public.scrap_deals_contract_no_seq to service_role;
grant execute on function public.next_scrap_contract_no() to service_role;
