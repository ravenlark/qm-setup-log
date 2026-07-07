-- Stripe subscription support.
-- Store the Stripe recurring Price ID that maps to each app plan.

alter table public.subscription_plans
add column if not exists stripe_price_id text unique;

update public.subscription_plans
set stripe_price_id = 'price_1TnrPyEQ3Q9029hSaUlBFHiu'
where name = 'Premium';
