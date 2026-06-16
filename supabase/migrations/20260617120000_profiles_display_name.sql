-- Добавляем имя пользователя (отображаемое имя) в профиль.
alter table public.profiles
  add column if not exists display_name text;
