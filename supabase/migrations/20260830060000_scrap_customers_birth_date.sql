-- ГИЗДМДК требует дату рождения продавца при регистрации сделки — храним её у клиента,
-- чтобы не спрашивать повторно при следующих сделках и передавать в проверку МВД (dob).
alter table public.scrap_customers add column if not exists birth_date text;
