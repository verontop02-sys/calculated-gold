-- Нормализация телефона для поиска и единого вида (+7XXXXXXXXXX).
alter table public.scrap_customers
  add column if not exists phone_normalized text;

-- Заполняем phone_normalized из цифр phone (как в Node: 11 цифр с 7/8 → 10; иначе ровно 10 цифр).
update public.scrap_customers c
set phone_normalized = sub.n
from (
  select
    id,
    case
      when length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) = 11
        and left(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 1) in ('7', '8')
        then right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)
      when length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) = 10
        then regexp_replace(coalesce(phone, ''), '\D', '', 'g')
      else null
    end as n
  from public.scrap_customers
) sub
where c.id = sub.id
  and sub.n is not null
  and (c.phone_normalized is null or c.phone_normalized is distinct from sub.n);

-- Единый вид хранения для российских 10 цифр.
update public.scrap_customers
set phone = '+7' || phone_normalized
where phone_normalized is not null;

create index if not exists scrap_customers_phone_norm_idx
  on public.scrap_customers (phone_normalized);
