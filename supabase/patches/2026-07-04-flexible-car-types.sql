create table if not exists public.car_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.car_types enable row level security;

grant select on public.car_types to authenticated;

drop policy if exists "Authenticated users can read active car types"
  on public.car_types;

create policy "Authenticated users can read active car types"
  on public.car_types for select
  to authenticated
  using (is_active);

drop trigger if exists car_types_set_updated_at on public.car_types;

create trigger car_types_set_updated_at
before update on public.car_types
for each row execute function public.set_updated_at();

insert into public.car_types (slug, name, sort_order)
values
  ('quarter_midget', 'Quarter Midget', 10),
  ('legend', 'Legend Car', 20)
on conflict (slug) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

alter table public.cars
  add column if not exists car_type_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cars_car_type_id_fkey'
      and conrelid = 'public.cars'::regclass
  ) then
    alter table public.cars
      add constraint cars_car_type_id_fkey
      foreign key (car_type_id)
      references public.car_types(id)
      on delete restrict;
  end if;
end $$;

update public.cars
set car_type_id = (
  select id
  from public.car_types
  where slug = 'quarter_midget'
)
where car_type_id is null;

create index if not exists car_types_active_sort_idx
  on public.car_types (is_active, sort_order, name);

create index if not exists cars_car_type_id_idx
  on public.cars (car_type_id);

alter table public.sessions
  add column if not exists setup_values jsonb not null default '{}'::jsonb,
  add column if not exists result_values jsonb not null default '{}'::jsonb,
  add column if not exists note_values jsonb not null default '{}'::jsonb;

update public.sessions
set
  setup_values = jsonb_strip_nulls(jsonb_build_object(
    'lr_hub', lr_hub,
    'lf_tire_compound', lf_tire_compound,
    'rf_tire_compound', rf_tire_compound,
    'lr_tire_compound', lr_tire_compound,
    'rr_tire_compound', rr_tire_compound,
    'lf_psi', lf_psi,
    'rf_psi', rf_psi,
    'lr_psi', lr_psi,
    'rr_psi', rr_psi,
    'lf_offset', lf_offset,
    'rf_offset', rf_offset,
    'lr_offset', lr_offset,
    'rr_offset', rr_offset,
    'lf_spring_rate', lf_spring_rate,
    'rf_spring_rate', rf_spring_rate,
    'lr_spring_rate', lr_spring_rate,
    'rr_spring_rate', rr_spring_rate,
    'lf_shock_valving', lf_shock_valving,
    'rf_shock_valving', rf_shock_valving,
    'lr_shock_valving', lr_shock_valving,
    'rr_shock_valving', rr_shock_valving,
    'stagger', stagger,
    'lf_weight', lf_weight,
    'rf_weight', rf_weight,
    'lr_weight', lr_weight,
    'rr_weight', rr_weight,
    'lf_ride_height', lf_ride_height,
    'rf_ride_height', rf_ride_height,
    'lr_ride_height', lr_ride_height,
    'rr_ride_height', rr_ride_height,
    'lf_camber', lf_camber,
    'rf_camber', rf_camber,
    'lf_caster', lf_caster,
    'rf_caster', rf_caster,
    'lf_panhard_holes', lf_panhard_holes,
    'rf_panhard_holes', rf_panhard_holes,
    'lr_panhard_holes', lr_panhard_holes,
    'rr_panhard_holes', rr_panhard_holes,
    'left_wheelbase', left_wheelbase,
    'right_wheelbase', right_wheelbase,
    'engine_gear', engine_gear,
    'axle_gear', axle_gear
  )),
  result_values = jsonb_strip_nulls(jsonb_build_object(
    'lap_time', lap_time,
    'total_laps', total_laps,
    'average_rpm', average_rpm,
    'average_drops', average_drops,
    'start_position', start_position,
    'end_position', end_position,
    'lf_tire_temp', lf_tire_temp,
    'rf_tire_temp', rf_tire_temp,
    'lr_tire_temp', lr_tire_temp,
    'rr_tire_temp', rr_tire_temp
  )),
  note_values = jsonb_strip_nulls(jsonb_build_object(
    'tire_notes', tire_notes,
    'handling', handling,
    'changes', changes,
    'next_time', next_time
  ))
where setup_values = '{}'::jsonb
  and result_values = '{}'::jsonb
  and note_values = '{}'::jsonb;
