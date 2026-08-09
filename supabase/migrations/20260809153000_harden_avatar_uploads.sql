-- Keep public avatar delivery, but make direct Storage API uploads obey the
-- same JPEG-only and 5 MB contract as the profile editor.
UPDATE storage.buckets
SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg']::text[]
WHERE id = 'avatars';

DROP POLICY IF EXISTS "Users can upload their own avatars."
ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatars."
ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatars."
ON storage.objects;

CREATE POLICY "Users can upload their own avatars."
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid() = owner
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own avatars."
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid() = owner
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid() = owner
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own avatars."
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid() = owner
  AND (storage.foldername(name))[1] = auth.uid()::text
);
