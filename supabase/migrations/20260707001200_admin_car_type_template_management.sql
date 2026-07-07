-- Allow admin Edge Functions to create/archive car types for runtime templates.
grant select, insert, update on public.car_types to service_role;
