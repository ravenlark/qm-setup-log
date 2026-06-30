-- Allow users to manage their own team logo files.
-- The app stores logos at: team-logos/{auth.uid()}/{file-name}

drop policy if exists "Users can read their own team logos" on storage.objects;
drop policy if exists "Users can upload their own team logos" on storage.objects;
drop policy if exists "Users can update their own team logos" on storage.objects;
drop policy if exists "Users can delete their own team logos" on storage.objects;

create policy "Users can read their own team logos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'team-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can upload their own team logos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'team-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own team logos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'team-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'team-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own team logos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'team-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
