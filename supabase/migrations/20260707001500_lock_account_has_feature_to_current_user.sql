-- Prevent authenticated callers from probing another user's feature entitlements.

drop policy if exists "Users can create entitled non-system tracks"
  on public.tracks;

drop policy if exists "Users can create entitled engine maintenance"
  on public.engine_maintenance;

drop policy if exists "Users can update entitled engine maintenance"
  on public.engine_maintenance;

drop function if exists public.account_has_feature(text, uuid);

create or replace function public.account_has_feature(feature_key text)
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
      on account_subscriptions.user_id = auth.uid()
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

grant execute on function public.account_has_feature(text) to authenticated;

create policy "Users can create entitled non-system tracks"
  on public.tracks
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and is_system = false
    and public.account_has_feature('custom_tracks')
  );

create policy "Users can create entitled engine maintenance"
  on public.engine_maintenance
  for insert
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
  on public.engine_maintenance
  for update
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
