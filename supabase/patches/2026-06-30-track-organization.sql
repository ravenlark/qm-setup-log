alter table public.tracks
  add column if not exists street_address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists country text not null default 'US',
  add column if not exists archived_at timestamptz;

alter table public.track_notes
  add column if not exists is_favorite boolean not null default false;

update public.tracks
set
  city = nullif(btrim(split_part(location, ',', 1)), ''),
  state = nullif(btrim(split_part(location, ',', 2)), ''),
  country = coalesce(nullif(btrim(country), ''), 'US')
where location is not null
  and location like '%,%'
  and (city is null or state is null);

create index if not exists tracks_state_name_idx
  on public.tracks (state, name);

create index if not exists tracks_created_by_active_name_idx
  on public.tracks (created_by, archived_at, name);
