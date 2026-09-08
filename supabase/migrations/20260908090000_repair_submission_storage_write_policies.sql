-- Reconcile the submission write policies after a partial/manual storage
-- policy repair.  

DROP POLICY IF EXISTS "Authenticated users can upload submissions"
ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload own submissions"
ON storage.objects;

CREATE POLICY "Authenticated users can upload own submissions"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'submissions'
  AND auth.uid() = owner
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] IN ('roms', 'covers', 'banners')
  AND public.account_asset_upload_within_quota(
    bucket_id,
    owner,
    name,
    metadata
  )
);

DROP POLICY IF EXISTS "Authenticated users can delete own submissions"
ON storage.objects;

CREATE POLICY "Authenticated users can delete own submissions"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'submissions'
  AND auth.uid() = owner
  AND (storage.foldername(name))[1] = auth.uid()::text
);
