grant usage on schema public to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.subscription_plans to authenticated;
grant select on public.account_subscriptions to authenticated;
grant select on public.engine_types to authenticated;
grant select on public.maintenance_types to authenticated;
grant select, insert, update, delete on public.tracks to authenticated;
grant select, insert, update, delete on public.track_notes to authenticated;
grant select, insert, update, delete on public.cars to authenticated;
grant select, insert, update, delete on public.engines to authenticated;
grant select, insert, update, delete on public.car_engine_assignments to authenticated;
grant select, insert, update, delete on public.engine_maintenance to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;

notify pgrst, 'reload schema';
