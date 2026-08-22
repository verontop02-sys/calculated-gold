-- Защита денег на уровне БД: одно списание — одна заявка на выплату.
--
-- idempotency_key при подаче заявки приходит от клиента. Если повторить запрос с тем же
-- ключом, fintech_record_ledger_entry вернёт прежнюю запись без второго списания, а код
-- раньше всё равно заводил новую заявку. Итог: одно списание и несколько заявок к выплате,
-- то есть оператор мог заплатить одну и ту же сумму несколько раз.
--
-- Код уже проверяет is_duplicate (server/fintechWithdrawals.js), это второй рубеж — чтобы
-- ошибка не вернулась вместе с будущей правкой.
--
-- Индекс создаём только если дублей ещё нет: на живой базе миграция не должна падать и
-- блокировать деплой. Если дубли есть — пишем предупреждение в лог, разбираем руками.

do $$
declare
  v_dupes bigint;
begin
  select count(*) into v_dupes
  from (
    select ledger_entry_id
    from public.fintech_withdrawal_requests
    where ledger_entry_id is not null
    group by ledger_entry_id
    having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise warning 'fintech_withdrawal_requests: % ledger_entry_id с несколькими заявками — уникальный индекс не создан, нужна ручная сверка выплат', v_dupes;
    return;
  end if;

  create unique index if not exists fintech_withdrawal_requests_ledger_entry_uniq
    on public.fintech_withdrawal_requests (ledger_entry_id)
    where ledger_entry_id is not null;
end
$$;
