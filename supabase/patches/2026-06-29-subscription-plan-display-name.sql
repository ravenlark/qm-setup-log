-- Use subscription_plans.display_name for UI copy while preserving name as the stable key.

alter table public.subscription_plans
add column if not exists display_name text;

update public.subscription_plans
set display_name = name
where display_name is null;

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
    subscription.max_engines is null or plan_usage.engine_count < subscription.max_engines
  from subscription
  cross join plan_usage;
end;
$account_plan_limits$;

grant execute on function public.account_plan_limits() to authenticated;
