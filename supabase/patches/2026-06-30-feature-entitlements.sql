-- Feature entitlements for subscription plans.
-- This keeps feature access configurable per plan instead of hardcoding plan
-- names into the app or row-level security policies.

create table if not exists public.subscription_features (
  key text primary key,
  display_name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_plan_features (
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  feature_key text not null references public.subscription_features(key) on delete cascade,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, feature_key)
);

drop trigger if exists subscription_features_set_updated_at
  on public.subscription_features;
create trigger subscription_features_set_updated_at
before update on public.subscription_features
for each row
execute function public.set_updated_at();

drop trigger if exists subscription_plan_features_set_updated_at
  on public.subscription_plan_features;
create trigger subscription_plan_features_set_updated_at
before update on public.subscription_plan_features
for each row
execute function public.set_updated_at();

alter table public.subscription_features enable row level security;
alter table public.subscription_plan_features enable row level security;

grant select on public.subscription_features to authenticated;
grant select on public.subscription_plan_features to authenticated;
grant select on public.subscription_features to service_role;
grant select on public.subscription_plan_features to service_role;

drop policy if exists "Authenticated users can read active subscription features"
  on public.subscription_features;
create policy "Authenticated users can read active subscription features"
  on public.subscription_features for select
  to authenticated
  using (is_active);

drop policy if exists "Authenticated users can read enabled plan features"
  on public.subscription_plan_features;
create policy "Authenticated users can read enabled plan features"
  on public.subscription_plan_features for select
  to authenticated
  using (
    is_enabled
    and exists (
      select 1
      from public.subscription_features
      where subscription_features.key = subscription_plan_features.feature_key
        and subscription_features.is_active
    )
  );

insert into public.subscription_features (key, display_name, description)
values
  (
    'custom_tracks',
    'Custom Tracks',
    'Create private tracks for parking lot races, practice sites, and other custom facilities.'
  ),
  (
    'engine_maintenance',
    'Engine Maintenance',
    'Log engine maintenance records, service history, costs, and notes.'
  )
on conflict (key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  is_active = true;

insert into public.subscription_plan_features (plan_id, feature_key, is_enabled)
select subscription_plans.id, features.feature_key, features.is_enabled
from public.subscription_plans
cross join (
  values
    ('Free'::text, 'custom_tracks'::text, false),
    ('Free'::text, 'engine_maintenance'::text, false),
    ('Premium'::text, 'custom_tracks'::text, true),
    ('Premium'::text, 'engine_maintenance'::text, true)
) as features(plan_name, feature_key, is_enabled)
where subscription_plans.name = features.plan_name
on conflict (plan_id, feature_key) do update
set is_enabled = excluded.is_enabled;

create or replace function public.account_has_feature(
  feature_key text,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $account_has_feature$
  with current_plan as (
    select coalesce(active_plan.id, free_plan.id) as plan_id
    from public.subscription_plans free_plan
    left join public.account_subscriptions account_subscriptions
      on account_subscriptions.user_id = $2
      and account_subscriptions.status in ('active', 'trialing')
    left join public.subscription_plans active_plan
      on active_plan.id = account_subscriptions.plan_id
      and active_plan.is_active
    where free_plan.name = 'Free'
      and free_plan.is_active
    limit 1
  )
  select coalesce(bool_or(subscription_plan_features.is_enabled), false)
  from current_plan
  join public.subscription_plan_features
    on subscription_plan_features.plan_id = current_plan.plan_id
    and subscription_plan_features.feature_key = $1
    and subscription_plan_features.is_enabled
  join public.subscription_features
    on subscription_features.key = subscription_plan_features.feature_key
    and subscription_features.is_active;
$account_has_feature$;

grant execute on function public.account_has_feature(text, uuid) to authenticated;

drop function if exists public.account_plan_limits();

create function public.account_plan_limits()
returns table (
  plan_name text,
  plan_display_name text,
  provider text,
  status text,
  cancel_at_period_end boolean,
  current_period_end timestamptz,
  price_cents integer,
  price_currency text,
  max_cars integer,
  max_engines integer,
  car_count integer,
  engine_count integer,
  can_create_car boolean,
  can_create_engine boolean,
  features jsonb,
  can_create_custom_tracks boolean,
  can_create_engine_maintenance boolean
)
language plpgsql
security definer
set search_path = public
as $account_plan_limits$
begin
  return query
  with subscription as (
    select
      coalesce(sp.id, free_plan.id) as plan_id,
      coalesce(sp.name, 'Free') as plan_name,
      coalesce(sp.display_name, sp.name, free_plan.display_name, free_plan.name) as plan_display_name,
      account_subscriptions.provider,
      coalesce(account_subscriptions.status, 'active') as status,
      coalesce(account_subscriptions.cancel_at_period_end, false) as cancel_at_period_end,
      account_subscriptions.current_period_end,
      case when sp.id is null then free_plan.price_cents else sp.price_cents end as price_cents,
      case when sp.id is null then free_plan.price_currency else sp.price_currency end as price_currency,
      case when sp.id is null then free_plan.max_cars else sp.max_cars end as max_cars,
      case
        when sp.id is null then free_plan.max_engines
        else sp.max_engines
      end as max_engines
    from public.subscription_plans free_plan
    left join public.account_subscriptions
      on account_subscriptions.user_id = auth.uid()
      and account_subscriptions.status in ('active', 'trialing')
    left join public.subscription_plans sp
      on sp.id = account_subscriptions.plan_id
    where free_plan.name = 'Free'
    limit 1
  ),
  plan_usage as (
    select
      (select count(*)::integer from public.cars where user_id = auth.uid()) as car_count,
      (select count(*)::integer from public.engines where user_id = auth.uid()) as engine_count
  ),
  plan_features as (
    select
      coalesce(
        jsonb_object_agg(
          subscription_features.key,
          coalesce(subscription_plan_features.is_enabled, false)
        ) filter (where subscription_features.key is not null),
        '{}'::jsonb
      ) as features
    from subscription
    join public.subscription_features
      on subscription_features.is_active
    left join public.subscription_plan_features
      on subscription_plan_features.plan_id = subscription.plan_id
      and subscription_plan_features.feature_key = subscription_features.key
  )
  select
    subscription.plan_name::text,
    subscription.plan_display_name::text,
    subscription.provider::text,
    subscription.status::text,
    subscription.cancel_at_period_end,
    subscription.current_period_end,
    subscription.price_cents,
    subscription.price_currency::text,
    subscription.max_cars,
    subscription.max_engines,
    plan_usage.car_count,
    plan_usage.engine_count,
    subscription.max_cars is null or plan_usage.car_count < subscription.max_cars,
    subscription.max_engines is null or plan_usage.engine_count < subscription.max_engines,
    plan_features.features,
    public.account_has_feature('custom_tracks'),
    public.account_has_feature('engine_maintenance')
  from subscription
  cross join plan_usage
  cross join plan_features;
end;
$account_plan_limits$;

grant execute on function public.account_plan_limits() to authenticated;

drop policy if exists "Users can create their own non-system tracks"
  on public.tracks;
create policy "Users can create entitled non-system tracks"
  on public.tracks for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and is_system = false
    and public.account_has_feature('custom_tracks')
  );

drop policy if exists "Users can manage their own engine maintenance"
  on public.engine_maintenance;
drop policy if exists "Users can read their own engine maintenance"
  on public.engine_maintenance;
drop policy if exists "Users can create entitled engine maintenance"
  on public.engine_maintenance;
drop policy if exists "Users can update entitled engine maintenance"
  on public.engine_maintenance;
drop policy if exists "Users can delete their own engine maintenance"
  on public.engine_maintenance;

create policy "Users can read their own engine maintenance"
  on public.engine_maintenance for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create entitled engine maintenance"
  on public.engine_maintenance for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.account_has_feature('engine_maintenance')
    and exists (
      select 1
      from public.engines
      where engines.id = engine_maintenance.engine_id
        and engines.user_id = auth.uid()
    )
  );

create policy "Users can update entitled engine maintenance"
  on public.engine_maintenance for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and public.account_has_feature('engine_maintenance')
    and exists (
      select 1
      from public.engines
      where engines.id = engine_maintenance.engine_id
        and engines.user_id = auth.uid()
    )
  );

create policy "Users can delete their own engine maintenance"
  on public.engine_maintenance for delete
  to authenticated
  using (auth.uid() = user_id);
