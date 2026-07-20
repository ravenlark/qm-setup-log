-- Create the private bucket used for user-managed team logos.
-- Logo objects are stored at: team-logos/{auth.uid()}/{file-name}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-logos',
  'team-logos',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;
