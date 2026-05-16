-- Add optional lat/lng coordinates to competitors
-- so each competitor can be shown as an individual map point

alter table public.gold_index_competitors
  add column if not exists lat double precision null,
  add column if not exists lng double precision null;
