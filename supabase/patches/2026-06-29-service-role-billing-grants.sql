-- Allow Supabase Edge Functions using the server/admin key to read plan data
-- and maintain Stripe-backed subscription records.

grant select on public.subscription_plans to service_role;
grant select, insert, update on public.account_subscriptions to service_role;
