alter table public.tracks
  add column if not exists archived_at timestamptz;

create index if not exists tracks_created_by_active_name_idx
  on public.tracks (created_by, archived_at, name);
