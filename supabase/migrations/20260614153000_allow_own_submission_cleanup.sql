DROP POLICY IF EXISTS "Authenticated users can delete own submissions"
ON storage.objects;

CREATE POLICY "Authenticated users can delete own submissions"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'submissions'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
