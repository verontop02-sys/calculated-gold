-- Точка на карте: улица/дом и подпись геокодера (одинаковые названия городов различаются регионом + адресом).

alter table public.gold_index_cities
  add column if not exists street text null,
  add column if not exists building text null,
  add column if not exists address_note text null,
  add column if not exists geocoded_label text null;
