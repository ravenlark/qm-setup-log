-- Enforce Free/Premium garage limits at the database layer.
-- Free: 1 car, 1 engine. Premium: unlimited cars and engines.

insert into public.subscription_plans (name, max_cars, max_engines)
values
  ('Free', 1, 1),
  ('Premium', null, null)
on conflict (name) do update
set
  max_cars = excluded.max_cars,
  max_engines = excluded.max_engines,
  is_active = true;

create or replace function public.account_plan_limits()
returns table (
  plan_name text,
  status text,
  max_cars integer,
  max_engines integer,
  car_count integer,
  engine_count integer,
  can_create_car boolean,
  can_create_engine boolean
)
language plpgsql
security definer
set search_path = public
as $account_plan_limits$
begin
  return query
  with subscription as (
    select
      coalesce(sp.name, 'Free') as plan_name,
      coalesce(account_subscriptions.status, 'active') as status,
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
  )
  select
    subscription.plan_name::text,
    subscription.status::text,
    subscription.max_cars,
    subscription.max_engines,
    plan_usage.car_count,
    plan_usage.engine_count,
    subscription.max_cars is null or plan_usage.car_count < subscription.max_cars,
    subscription.max_engines is null or plan_usage.engine_count < subscription.max_engines
  from subscription
  cross join plan_usage;
end;
$account_plan_limits$;

grant execute on function public.account_plan_limits() to authenticated;

create or replace function public.enforce_account_resource_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $enforce_account_resource_limit$
declare
  resource_name text := tg_argv[0];
  plan_name text;
  resource_limit integer;
  resource_count integer;
begin
  if new.user_id is null then
    raise exception 'User id is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || resource_name, 0));

  select
    coalesce(sp.name, free_plan.name),
    case
      when resource_name = 'car' then
        case when sp.id is null then free_plan.max_cars else sp.max_cars end
      when resource_name = 'engine' then
        case when sp.id is null then free_plan.max_engines else sp.max_engines end
    end
  into plan_name, resource_limit
  from public.subscription_plans free_plan
  left join public.account_subscriptions account_subscriptions
    on account_subscriptions.user_id = new.user_id
    and account_subscriptions.status in ('active', 'trialing')
  left join public.subscription_plans sp
    on sp.id = account_subscriptions.plan_id
  where free_plan.name = 'Free'
  limit 1;

  if resource_name = 'car' then
    select count(*)::integer into resource_count
    from public.cars
    where user_id = new.user_id;
  elsif resource_name = 'engine' then
    select count(*)::integer into resource_count
    from public.engines
    where user_id = new.user_id;
  end if;

  if resource_limit is not null and resource_count >= resource_limit then
    raise exception '% plan allows % %.',
      coalesce(plan_name, 'Free'),
      resource_limit,
      case when resource_name = 'car' then 'car' else 'engine' end;
  end if;

  return new;
end;
$enforce_account_resource_limit$;

drop trigger if exists cars_enforce_account_limit on public.cars;
create trigger cars_enforce_account_limit
before insert on public.cars
for each row
execute function public.enforce_account_resource_limit('car');

drop trigger if exists engines_enforce_account_limit on public.engines;
create trigger engines_enforce_account_limit
before insert on public.engines
for each row
execute function public.enforce_account_resource_limit('engine');
