-- 1. Create a private storage bucket for the web ROMs
insert into storage.buckets (id, name, public)
values ('web_roms', 'web_roms', false)
on conflict (id) do nothing;

drop policy if exists "Users can upload their own ROMs" on storage.objects;
drop policy if exists "Users can view their own ROMs" on storage.objects;
drop policy if exists "Users can delete their own ROMs" on storage.objects;

-- 2. Allow users to upload files
create policy "Users can upload their own ROMs"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'web_roms' and auth.uid() = owner);

-- 3. Allow users to see their own files
create policy "Users can view their own ROMs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'web_roms' and auth.uid() = owner);

-- 4. Allow users to delete their own files
create policy "Users can delete their own ROMs"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'web_roms' and auth.uid() = owner);