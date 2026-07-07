-- Admin-managed runtime setup templates.
-- Admin writes are performed by Supabase Edge Functions with the service role.

create table if not exists public.car_type_setup_templates (
  id uuid primary key default gen_random_uuid(),
  car_type_id uuid not null references public.car_types(id) on delete cascade,
  fields jsonb not null default '[]'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (car_type_id)
);

drop trigger if exists car_type_setup_templates_set_updated_at
  on public.car_type_setup_templates;
create trigger car_type_setup_templates_set_updated_at
before update on public.car_type_setup_templates
for each row
execute function public.set_updated_at();

alter table public.car_type_setup_templates enable row level security;

grant select on public.car_type_setup_templates to authenticated;
grant select, insert, update, delete on public.car_type_setup_templates to service_role;
grant select on public.car_types to service_role;
grant select, insert, update on public.subscription_plans to service_role;
grant select, insert, update on public.subscription_features to service_role;
grant select, insert, update, delete on public.subscription_plan_features to service_role;
grant select on public.profiles to service_role;
grant select, insert, update on public.account_subscriptions to service_role;

drop policy if exists "Authenticated users can read active setup templates"
  on public.car_type_setup_templates;
create policy "Authenticated users can read active setup templates"
  on public.car_type_setup_templates for select
  to authenticated
  using (is_active);

create index if not exists car_type_setup_templates_active_idx
  on public.car_type_setup_templates (is_active, car_type_id);
