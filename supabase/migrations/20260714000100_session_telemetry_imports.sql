create unique index if not exists sessions_id_user_id_idx
  on public.sessions (id, user_id);

create table public.session_telemetry_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,

  original_filename text not null,
  file_sha256 text not null,
  file_size_bytes bigint not null,

  original_storage_path text not null,
  parsed_storage_path text not null,

  recording_started_at timestamptz,
  recording_duration_seconds numeric,

  parser_version text not null,
  parse_status text not null default 'parsed',
  parse_error text,

  metadata jsonb not null default '{}'::jsonb,
  derived jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (session_id, user_id) references public.sessions(id, user_id) on delete cascade,
  constraint session_telemetry_files_parse_status_check
    check (parse_status in ('pending', 'parsed', 'failed'))
);

create unique index session_telemetry_files_id_user_id_idx
  on public.session_telemetry_files (id, user_id);

create table public.session_telemetry_laps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  telemetry_file_id uuid not null references public.session_telemetry_files(id) on delete cascade,

  file_lap_index integer not null,
  file_lap_number text,
  global_lap_number integer,

  start_seconds numeric not null,
  end_seconds numeric not null,
  duration_seconds numeric not null,
  is_partial boolean not null default false,

  created_at timestamptz not null default now(),

  foreign key (session_id, user_id) references public.sessions(id, user_id) on delete cascade,
  foreign key (telemetry_file_id, user_id)
    references public.session_telemetry_files(id, user_id) on delete cascade
);

create unique index session_telemetry_files_session_hash_idx
  on public.session_telemetry_files (session_id, file_sha256);

create unique index session_telemetry_laps_file_index_idx
  on public.session_telemetry_laps (telemetry_file_id, file_lap_index);

create index session_telemetry_files_user_session_idx
  on public.session_telemetry_files (
    user_id,
    session_id,
    recording_started_at asc nulls last,
    created_at asc
  );

create index session_telemetry_laps_session_idx
  on public.session_telemetry_laps (user_id, session_id, telemetry_file_id, file_lap_index);

create trigger session_telemetry_files_set_updated_at
before update on public.session_telemetry_files
for each row execute function public.set_updated_at();

alter table public.session_telemetry_files enable row level security;
alter table public.session_telemetry_laps enable row level security;

grant select, insert, update, delete on public.session_telemetry_files to authenticated;
grant select, insert, update, delete on public.session_telemetry_laps to authenticated;

create policy "Users can manage telemetry files for their sessions"
  on public.session_telemetry_files for all
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.sessions
      where sessions.id = session_telemetry_files.session_id
        and sessions.user_id = auth.uid()
    )
  );

create policy "Users can manage telemetry laps for their sessions"
  on public.session_telemetry_laps for all
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.session_telemetry_files
      where session_telemetry_files.id = session_telemetry_laps.telemetry_file_id
        and session_telemetry_files.session_id = session_telemetry_laps.session_id
        and session_telemetry_files.user_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'telemetry-imports',
  'telemetry-imports',
  false,
  52428800,
  array['application/octet-stream', 'application/xrk', 'application/json', 'text/json']
)
on conflict (id) do nothing;

drop policy if exists "Users can read their own telemetry imports" on storage.objects;
drop policy if exists "Users can upload their own telemetry imports" on storage.objects;
drop policy if exists "Users can update their own telemetry imports" on storage.objects;
drop policy if exists "Users can delete their own telemetry imports" on storage.objects;

create policy "Users can read their own telemetry imports"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'telemetry-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can upload their own telemetry imports"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'telemetry-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own telemetry imports"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'telemetry-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'telemetry-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own telemetry imports"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'telemetry-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
