-- Setup Log initial schema
-- Run this in the Supabase SQL editor for the target project.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  team_name text not null default '',
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_name text,
  max_cars integer,
  max_engines integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null default 'active',
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.engine_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  gearbox_ratio numeric(7, 3) not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.maintenance_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  street_address text,
  city text,
  state text,
  postal_code text,
  country text not null default 'US',
  surface text,
  length text,
  is_banked boolean not null default false,
  is_system boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.track_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  layout_notes text,
  line_notes text,
  surface_notes text,
  tire_notes text,
  facility_notes text,
  notes text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, track_id)
);

create table public.cars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  model text,
  year integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.engines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  engine_type_id uuid not null references public.engine_types(id),
  name text not null,
  serial text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.car_engine_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  car_id uuid not null,
  engine_id uuid not null,
  installed_at timestamptz not null default now(),
  removed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (car_id, user_id) references public.cars(id, user_id) on delete cascade,
  foreign key (engine_id, user_id) references public.engines(id, user_id) on delete cascade
);

create table public.engine_maintenance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  engine_id uuid not null,
  maintenance_type_id uuid not null references public.maintenance_types(id),
  maintenance_date date not null,
  performed_by text,
  cost numeric(10, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (engine_id, user_id) references public.engines(id, user_id) on delete cascade
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  car_id uuid not null,
  engine_id uuid,
  track_id uuid not null references public.tracks(id) on delete restrict,

  session_date date not null,
  session_time time,
  session_type text not null,
  driver text,
  is_baseline boolean not null default false,

  air_temp numeric(5, 1),
  humidity numeric(5, 2),
  track_temp numeric(5, 1),
  track_condition text,

  lr_hub text,
  lf_tire_compound text,
  rf_tire_compound text,
  lr_tire_compound text,
  rr_tire_compound text,
  lf_psi numeric(5, 2),
  rf_psi numeric(5, 2),
  lr_psi numeric(5, 2),
  rr_psi numeric(5, 2),

  lf_offset numeric(6, 3),
  rf_offset numeric(6, 3),
  lr_offset numeric(6, 3),
  rr_offset numeric(6, 3),

  lf_spring_rate integer,
  rf_spring_rate integer,
  lr_spring_rate integer,
  rr_spring_rate integer,

  lf_shock_valving text,
  rf_shock_valving text,
  lr_shock_valving text,
  rr_shock_valving text,

  stagger numeric(6, 3),
  tire_notes text,

  lf_weight numeric(6, 2),
  rf_weight numeric(6, 2),
  lr_weight numeric(6, 2),
  rr_weight numeric(6, 2),

  lf_ride_height numeric(6, 3),
  rf_ride_height numeric(6, 3),
  lr_ride_height numeric(6, 3),
  rr_ride_height numeric(6, 3),

  lf_camber numeric(5, 2),
  rf_camber numeric(5, 2),
  lf_caster numeric(5, 2),
  rf_caster numeric(5, 2),

  lf_panhard_holes integer,
  rf_panhard_holes integer,
  lr_panhard_holes integer,
  rr_panhard_holes integer,

  left_wheelbase numeric(7, 3),
  right_wheelbase numeric(7, 3),

  engine_gear integer,
  axle_gear integer,

  lap_time numeric(7, 3),
  total_laps integer,
  average_rpm integer,
  average_drops integer,
  start_position integer,
  end_position integer,

  lf_tire_temp integer,
  rf_tire_temp integer,
  lr_tire_temp integer,
  rr_tire_temp integer,

  handling text,
  changes text,
  next_time text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (car_id, user_id) references public.cars(id, user_id) on delete cascade,
  foreign key (engine_id) references public.engines(id) on delete set null
);

create unique index car_engine_assignments_one_active_engine_per_car
  on public.car_engine_assignments (user_id, car_id)
  where removed_at is null;

create unique index car_engine_assignments_one_active_car_per_engine
  on public.car_engine_assignments (user_id, engine_id)
  where removed_at is null;

create unique index sessions_one_baseline_per_car_track
  on public.sessions (user_id, car_id, track_id)
  where is_baseline;

create index tracks_system_idx
  on public.tracks (is_system);

create index account_subscriptions_plan_idx
  on public.account_subscriptions (plan_id);

create unique index account_subscriptions_provider_subscription_idx
  on public.account_subscriptions (provider, provider_subscription_id)
  where provider is not null and provider_subscription_id is not null;

create index tracks_created_by_idx
  on public.tracks (created_by);

create index tracks_created_by_active_name_idx
  on public.tracks (created_by, archived_at, name);

create index tracks_state_name_idx
  on public.tracks (state, name);

create index track_notes_user_track_idx
  on public.track_notes (user_id, track_id);

create index cars_user_name_idx
  on public.cars (user_id, name);

create index engines_user_name_idx
  on public.engines (user_id, name);

create index car_engine_assignments_user_car_idx
  on public.car_engine_assignments (user_id, car_id, installed_at desc);

create index engine_maintenance_user_engine_date_idx
  on public.engine_maintenance (user_id, engine_id, maintenance_date desc);

create index sessions_user_date_idx
  on public.sessions (user_id, session_date desc);

create index sessions_user_car_date_idx
  on public.sessions (user_id, car_id, session_date desc);

create index sessions_user_track_date_idx
  on public.sessions (user_id, track_id, session_date desc);

create index sessions_user_car_track_date_idx
  on public.sessions (user_id, car_id, track_id, session_date desc);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger subscription_plans_set_updated_at
before update on public.subscription_plans
for each row execute function public.set_updated_at();

create trigger account_subscriptions_set_updated_at
before update on public.account_subscriptions
for each row execute function public.set_updated_at();

create trigger engine_types_set_updated_at
before update on public.engine_types
for each row execute function public.set_updated_at();

create trigger maintenance_types_set_updated_at
before update on public.maintenance_types
for each row execute function public.set_updated_at();

create trigger tracks_set_updated_at
before update on public.tracks
for each row execute function public.set_updated_at();

create trigger track_notes_set_updated_at
before update on public.track_notes
for each row execute function public.set_updated_at();

create trigger cars_set_updated_at
before update on public.cars
for each row execute function public.set_updated_at();

create trigger engines_set_updated_at
before update on public.engines
for each row execute function public.set_updated_at();

create trigger car_engine_assignments_set_updated_at
before update on public.car_engine_assignments
for each row execute function public.set_updated_at();

create trigger engine_maintenance_set_updated_at
before update on public.engine_maintenance
for each row execute function public.set_updated_at();

create trigger sessions_set_updated_at
before update on public.sessions
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.account_subscriptions enable row level security;
alter table public.engine_types enable row level security;
alter table public.maintenance_types enable row level security;
alter table public.tracks enable row level security;
alter table public.track_notes enable row level security;
alter table public.cars enable row level security;
alter table public.engines enable row level security;
alter table public.car_engine_assignments enable row level security;
alter table public.engine_maintenance enable row level security;
alter table public.sessions enable row level security;

grant usage on schema public to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.subscription_plans to authenticated;
grant select on public.account_subscriptions to authenticated;
grant select on public.engine_types to authenticated;
grant select on public.maintenance_types to authenticated;
grant select, insert, update, delete on public.tracks to authenticated;
grant select, insert, update, delete on public.track_notes to authenticated;
grant select, insert, update, delete on public.cars to authenticated;
grant select, insert, update, delete on public.engines to authenticated;
grant select, insert, update, delete on public.car_engine_assignments to authenticated;
grant select, insert, update, delete on public.engine_maintenance to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can create their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Authenticated users can read active subscription plans"
  on public.subscription_plans for select
  to authenticated
  using (is_active);

create policy "Users can read their own subscription"
  on public.account_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Authenticated users can read active engine types"
  on public.engine_types for select
  to authenticated
  using (is_active);

create policy "Authenticated users can read active maintenance types"
  on public.maintenance_types for select
  to authenticated
  using (is_active);

create policy "Users can read visible tracks"
  on public.tracks for select
  to authenticated
  using (is_system or created_by = auth.uid());

create policy "Users can create their own non-system tracks"
  on public.tracks for insert
  to authenticated
  with check (created_by = auth.uid() and is_system = false);

create policy "Users can update their own non-system tracks"
  on public.tracks for update
  to authenticated
  using (created_by = auth.uid() and is_system = false)
  with check (created_by = auth.uid() and is_system = false);

create policy "Users can delete their own non-system tracks"
  on public.tracks for delete
  to authenticated
  using (created_by = auth.uid() and is_system = false);

create policy "Users can manage their own track notes"
  on public.track_notes for all
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.tracks
      where tracks.id = track_notes.track_id
        and (tracks.is_system or tracks.created_by = auth.uid())
    )
  );

create policy "Users can manage their own cars"
  on public.cars for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own engines"
  on public.engines for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own car engine assignments"
  on public.car_engine_assignments for all
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.cars
      where cars.id = car_engine_assignments.car_id
        and cars.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.engines
      where engines.id = car_engine_assignments.engine_id
        and engines.user_id = auth.uid()
    )
  );

create policy "Users can manage their own engine maintenance"
  on public.engine_maintenance for all
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.engines
      where engines.id = engine_maintenance.engine_id
        and engines.user_id = auth.uid()
    )
  );

create policy "Users can manage their own sessions"
  on public.sessions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.cars
      where cars.id = sessions.car_id
        and cars.user_id = auth.uid()
    )
    and (
      sessions.engine_id is null
      or exists (
        select 1
        from public.engines
        where engines.id = sessions.engine_id
          and engines.user_id = auth.uid()
      )
    )
    and exists (
      select 1
      from public.tracks
      where tracks.id = sessions.track_id
        and (tracks.is_system or tracks.created_by = auth.uid())
    )
  );

insert into public.subscription_plans (name, max_cars, max_engines)
values
  ('Free', 1, 1),
  ('Premium', null, null)
on conflict (name) do update
set
  max_cars = excluded.max_cars,
  max_engines = excluded.max_engines,
  is_active = true;

create or replace function public.ensure_free_subscription()
returns public.account_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  free_plan_id uuid;
  subscription public.account_subscriptions;
begin
  select id
  into free_plan_id
  from public.subscription_plans
  where name = 'Free'
    and is_active
  limit 1;

  if free_plan_id is null then
    raise exception 'Free subscription plan is not configured.';
  end if;

  insert into public.account_subscriptions (user_id, plan_id, status, provider)
  values (auth.uid(), free_plan_id, 'active', 'manual')
  on conflict (user_id) do nothing;

  select *
  into subscription
  from public.account_subscriptions
  where user_id = auth.uid();

  return subscription;
end;
$$;

grant execute on function public.ensure_free_subscription() to authenticated;

insert into public.engine_types (name, gearbox_ratio, sort_order)
values
  ('Honda 120', 6.140, 10),
  ('Honda 160', 6.140, 20),
  ('Briggs & Stratton Animal', 6.070, 30),
  ('Briggs & Stratton World Formula', 6.070, 40),
  ('DECO', 5.730, 50)
on conflict (name) do update
set
  gearbox_ratio = excluded.gearbox_ratio,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.maintenance_types (name, sort_order)
values
  ('Oil Change', 10),
  ('Spark Plug', 20),
  ('Gasket', 30),
  ('Valve Adjustment', 40),
  ('Cleaning / Inspection', 50),
  ('Repair', 60),
  ('Full Refresh', 70),
  ('Other', 80)
on conflict (name) do update
set
  sort_order = excluded.sort_order,
  is_active = true;
