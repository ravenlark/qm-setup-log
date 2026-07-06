create table if not exists public.favorite_setups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  car_type_id uuid not null references public.car_types(id) on delete restrict,
  name text not null,
  notes text,
  source_session_id uuid references public.sessions(id) on delete set null,
  setup_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

alter table public.favorite_setups enable row level security;

grant select, insert, update, delete on public.favorite_setups to authenticated;

create index if not exists favorite_setups_user_car_type_name_idx
  on public.favorite_setups (user_id, car_type_id, name);

create index if not exists favorite_setups_source_session_idx
  on public.favorite_setups (source_session_id);

drop trigger if exists favorite_setups_set_updated_at on public.favorite_setups;

create trigger favorite_setups_set_updated_at
before update on public.favorite_setups
for each row execute function public.set_updated_at();

drop policy if exists "Users can manage their own favorite setups"
  on public.favorite_setups;

create policy "Users can manage their own favorite setups"
  on public.favorite_setups for all
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.car_types
      where car_types.id = favorite_setups.car_type_id
        and car_types.is_active
    )
    and (
      favorite_setups.source_session_id is null
      or exists (
        select 1
        from public.sessions
        where sessions.id = favorite_setups.source_session_id
          and sessions.user_id = auth.uid()
      )
    )
  );
