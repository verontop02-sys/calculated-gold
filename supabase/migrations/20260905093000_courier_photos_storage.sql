-- Бакет courier-photos: необязательное фото изделия при заявке на курьера.
-- Клиент может приложить фото прямо с телефона, чтобы оператор примерно понимал
-- вес/объём, за чем едет курьер. Загрузка идёт только через сервер
-- (service_role, /api/public/courier-photo/upload), поэтому бакет приватный и
-- политики для клиентов не нужны — service_role RLS не проверяет (см. историю
-- с deal-photos: публичный бакет + политика "to public" позволяли перечислить
-- и скачать все файлы по анонимному ключу).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'courier-photos',
  'courier-photos',
  false,
  15728640,  -- 15 MB
  array['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do nothing;
