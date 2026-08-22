-- Закрываем бакет deal-photos.
--
-- Было: bucket.public = true плюс политика SELECT "to public" на весь бакет. Это давало любому
-- человеку с anon-ключом (он лежит в бандле сайта, то есть публичен) право вызвать
-- POST /storage/v1/object/list/deal-photos и получить список всех файлов, а затем скачать их.
-- Проверено запросом с anon-ключом: список отдавался с кодом 200.
--
-- Плюс политики INSERT/UPDATE "to authenticated" позволяли любому вошедшему сотруднику
-- залить или перезаписать любой файл напрямую, минуя API — то есть подменить фото в сделке.
--
-- Сейчас в бакете 0 объектов, поэтому переключение в private ничего не ломает: старых
-- публичных ссылок, которые перестали бы открываться, просто нет. Делаем это до появления
-- сканов паспортов, чтобы документы не попали в открытое хранилище.
--
-- Загрузка идёт только через сервер (service_role, /api/deal-photos/upload), политики для
-- клиентов не нужны: service_role RLS не проверяет.

update storage.buckets set public = false where id = 'deal-photos';

drop policy if exists "public read deal photos" on storage.objects;
drop policy if exists "auth users can upload deal photos" on storage.objects;
drop policy if exists "auth users can update deal photos" on storage.objects;
