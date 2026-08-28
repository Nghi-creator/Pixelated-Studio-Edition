-- Profiles are an API-owned boundary. Browser clients use the hosted API and
-- must not read sensitive account columns or manufacture profile rows.
DROP POLICY IF EXISTS "Public profiles are viewable by everyone."
ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile."
ON public.profiles;
DROP POLICY IF EXISTS "Permanent users can insert profiles"
ON public.profiles;
DROP POLICY IF EXISTS "Permanent users can update profiles"
ON public.profiles;

REVOKE ALL PRIVILEGES ON TABLE public.profiles
FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.profiles TO service_role;

-- Realtime is not part of the profile delivery contract. Removing the table
-- from the publication prevents a future grant or policy from silently
-- re-opening profile change events to browser subscribers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles';
  END IF;
END;
$$;

-- Direct account-asset uploads remain available to signed-in clients, but
-- every account is bounded by both object count and aggregate stored bytes.
-- The advisory lock serializes concurrent uploads for one user and bucket so
-- parallel requests cannot race past either limit.
CREATE OR REPLACE FUNCTION public.account_asset_upload_within_quota(
  p_bucket_id text,
  p_owner uuid,
  p_object_name text,
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_bytes bigint;
  current_objects bigint;
  max_bytes bigint;
  max_objects bigint;
  object_bytes bigint;
  object_size_text text;
BEGIN
  IF p_owner IS NULL OR auth.uid() IS DISTINCT FROM p_owner THEN
    RETURN false;
  END IF;

  CASE p_bucket_id
    WHEN 'avatars' THEN
      max_objects := 10;
      max_bytes := 52428800; -- 50 MiB total; each object remains capped at 5 MiB.
    WHEN 'submissions' THEN
      max_objects := 60;
      max_bytes := 1073741824; -- 1 GiB total; each object remains capped at 64 MiB.
    ELSE
      RETURN false;
  END CASE;

  object_size_text := p_metadata->>'size';
  IF object_size_text IS NULL
    OR object_size_text !~ '^[0-9]{1,18}$'
  THEN
    RETURN false;
  END IF;
  object_bytes := object_size_text::bigint;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'account-asset:' || p_bucket_id || ':' || p_owner::text,
      0
    )
  );

  SELECT
    count(*),
    COALESCE(
      sum(
        CASE
          WHEN objects.metadata->>'size' ~ '^[0-9]{1,18}$'
            THEN (objects.metadata->>'size')::bigint
          ELSE 0
        END
      ),
      0
    )
  INTO current_objects, current_bytes
  FROM storage.objects AS objects
  WHERE objects.bucket_id = p_bucket_id
    AND objects.owner = p_owner
    AND objects.name <> p_object_name;

  RETURN current_objects < max_objects
    AND object_bytes <= max_bytes
    AND current_bytes <= max_bytes - object_bytes;
END;
$$;

REVOKE ALL ON FUNCTION public.account_asset_upload_within_quota(
  text,
  uuid,
  text,
  jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_asset_upload_within_quota(
  text,
  uuid,
  text,
  jsonb
) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can upload their own avatars."
ON storage.objects;

CREATE POLICY "Users can upload their own avatars."
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid() = owner
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.account_asset_upload_within_quota(
    bucket_id,
    owner,
    name,
    metadata
  )
);

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

-- Retire the unused legacy bucket without destroying any stored objects.
-- Operators can inventory and remove it separately after confirming it is empty.
UPDATE storage.buckets
SET public = false
WHERE id = 'default_library';

DROP POLICY IF EXISTS "Allow public read access"
ON storage.objects;
