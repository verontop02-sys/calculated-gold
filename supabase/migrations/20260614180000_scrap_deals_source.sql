-- Источник сделки: 'office' (оформлена в отделении, скачан PDF) или 'delivery' (курьер/доставка, подтверждение по СМС).
-- По умолчанию office — все исторические сделки считаются оформленными в отделении.

alter table public.scrap_deals
  add column if not exists source text not null default 'office';

create index if not exists scrap_deals_source_idx
  on public.scrap_deals (source, created_at desc);
