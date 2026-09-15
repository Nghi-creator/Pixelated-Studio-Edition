-- Intent survives partial Storage failures and disappears with the Auth user.
CREATE TABLE public.account_deletion_requests (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.account_deletion_requests TO service_role;

CREATE FUNCTION public.begin_account_deletion(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('account-deletion:' || p_user_id::text, 0));
  INSERT INTO public.account_deletion_requests(user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.begin_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_account_deletion(uuid) TO service_role;

-- Read metadata only; the API removes objects through the Storage API so the
-- underlying files are deleted too. Legacy web_roms paths need not start with uid.
CREATE FUNCTION public.list_account_deletion_objects(
  p_user_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 100
)
RETURNS TABLE(bucket_id text, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT o.bucket_id, o.name FROM storage.objects o
  WHERE (o.owner = p_user_id OR o.owner_id = p_user_id::text)
    AND EXISTS (SELECT 1 FROM public.account_deletion_requests WHERE user_id = p_user_id)
  ORDER BY o.bucket_id, o.name
  LIMIT greatest(1, least(p_limit, 1000)) OFFSET greatest(0, p_offset);
$$;
REVOKE ALL ON FUNCTION public.list_account_deletion_objects(uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_account_deletion_objects(uuid, integer, integer)
  TO service_role;

CREATE FUNCTION public.account_storage_writes_allowed()
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE requester uuid := auth.uid();
BEGIN
  IF requester IS NULL THEN RETURN false; END IF;
  -- Serialize with deletion intent so an in-flight write commits before inventory.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('account-deletion:' || requester::text, 0));
  RETURN NOT EXISTS (
    SELECT 1 FROM public.account_deletion_requests WHERE user_id = requester
  );
END;
$$;
REVOKE ALL ON FUNCTION public.account_storage_writes_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_storage_writes_allowed() TO authenticated;
CREATE POLICY "Block uploads during account deletion"
ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (public.account_storage_writes_allowed());
CREATE POLICY "Block object updates during account deletion"
ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.account_storage_writes_allowed())
WITH CHECK (public.account_storage_writes_allowed());
