-- Allow admin Edge Functions to summarize account usage counts.
grant select on public.cars to service_role;
grant select on public.engines to service_role;
grant select on public.sessions to service_role;
