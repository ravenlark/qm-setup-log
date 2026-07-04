create table if not exists public.track_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.track_types enable row level security;

grant select on public.track_types to authenticated;

drop policy if exists "Authenticated users can read track types"
  on public.track_types;

create policy "Authenticated users can read track types"
  on public.track_types for select
  to authenticated
  using (true);

alter table public.tracks
  add column if not exists track_type_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tracks_track_type_id_fkey'
      and conrelid = 'public.tracks'::regclass
  ) then
    alter table public.tracks
      add constraint tracks_track_type_id_fkey
      foreign key (track_type_id)
      references public.track_types(id)
      on delete set null;
  end if;
end $$;

create index if not exists tracks_track_type_id_idx
  on public.tracks (track_type_id);
