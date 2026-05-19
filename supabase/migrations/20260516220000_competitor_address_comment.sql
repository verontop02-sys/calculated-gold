-- Split competitor free-text into explicit address + comment.
alter table if exists public.gold_index_competitors
  add column if not exists address text null,
  add column if not exists comment text null;

-- Preserve existing data: old notes become comment by default.
update public.gold_index_competitors
set comment = notes
where comment is null
  and notes is not null
  and btrim(notes) <> '';
