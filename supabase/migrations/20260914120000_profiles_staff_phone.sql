-- Мобильный сотрудника: код подтверждения входа с нового устройства уходит SMS.
alter table public.profiles
  add column if not exists phone_normalized text;

create index if not exists profiles_phone_normalized_idx
  on public.profiles (phone_normalized)
  where phone_normalized is not null;
