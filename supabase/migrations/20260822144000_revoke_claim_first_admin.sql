-- Убираем право вызывать claim_first_admin из браузера.
--
-- Функция объявлена security definer, а права на неё не отзывались, поэтому по умолчанию
-- Postgres разрешает EXECUTE всем (PUBLIC). Значит её мог вызвать любой посетитель сайта
-- с anon-ключом: supabase.rpc('claim_first_admin', { uid }).
--
-- Сейчас это ничего не даёт: внутри стоит проверка «в profiles нет ни admin, ни super_admin»,
-- а супер-админы есть. Но защита держится на содержимом таблицы: если однажды роли
-- окажутся сброшены или профили пересозданы, первый же вызов из браузера сделает
-- произвольного пользователя супер-админом. Такую мину лучше снять.
--
-- Логика первого админа дублирована в server/index.js (ensureProfileAndBootstrap) и работает
-- под service_role, поэтому панель от этого отзыва не ломается.

revoke all on function public.claim_first_admin(uuid) from public;
revoke all on function public.claim_first_admin(uuid) from anon;
revoke all on function public.claim_first_admin(uuid) from authenticated;
grant execute on function public.claim_first_admin(uuid) to service_role;
