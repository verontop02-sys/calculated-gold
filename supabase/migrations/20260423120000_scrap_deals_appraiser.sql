-- ФИО эксперта в сделке: для повторного PDF из истории

alter table public.scrap_deals add column if not exists appraiser_name text;
