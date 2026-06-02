DROP POLICY IF EXISTS "Authenticated users can upload submissions"
ON storage.objects;

CREATE POLICY "Authenticated users can upload own submissions"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'submissions'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
