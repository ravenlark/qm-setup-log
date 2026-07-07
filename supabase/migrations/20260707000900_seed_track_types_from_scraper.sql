insert into public.track_types (name)
values
  ('Drag Strip'),
  ('Drifting Course'),
  ('Figure 8'),
  ('Hill Climb'),
  ('Karting Track'),
  ('MotoCross'),
  ('Multiple Race Tracks'),
  ('Off Road'),
  ('Oval'),
  ('Road Course'),
  ('Super Speedway')
on conflict (name) do nothing;
