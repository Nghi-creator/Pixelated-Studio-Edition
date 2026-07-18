-- Keep privileged reporting RPCs behind the API's authorization boundary.
REVOKE ALL ON FUNCTION public.admin_access_log_summary(integer, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_access_log_summary(integer, integer)
TO service_role;

-- Catalog reads are served by the API, which validates and rate-limits queries.
-- Do not leave the backing SECURITY DEFINER RPC directly callable by clients.
REVOKE ALL ON FUNCTION public.published_catalog_games(
  uuid,
  integer,
  text,
  text,
  text,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.published_catalog_games(
  uuid,
  integer,
  text,
  text,
  text,
  text
) TO service_role;

-- Submission objects are review material. Reassert private delivery and enforce
-- the same upper bound used by the API's reviewer-side artifact verification.
UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 67108864
WHERE id = 'submissions';
