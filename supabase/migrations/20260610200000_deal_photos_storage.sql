-- Создаём бакет deal-photos (публичный) для хранения фотографий изделий по договорам.
-- Если бакет уже создан вручную через Dashboard — эта миграция безопасно пропустит его.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deal-photos',
  'deal-photos',
  true,
  15728640,  -- 15 MB
  array['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do nothing;

-- Политика: авторизованные пользователи могут загружать файлы
drop policy if exists "auth users can upload deal photos" on storage.objects;
create policy "auth users can upload deal photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'deal-photos');

-- Политика: все могут читать (фото встраиваются в дравер клиента)
drop policy if exists "public read deal photos" on storage.objects;
create policy "public read deal photos"
  on storage.objects for select
  to public
  using (bucket_id = 'deal-photos');

-- Политика: авторизованные могут обновлять (upsert при re-upload)
drop policy if exists "auth users can update deal photos" on storage.objects;
create policy "auth users can update deal photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'deal-photos');
