CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.cleanup_stale_unconfirmed_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM auth.users
  WHERE email_confirmed_at IS NULL
    AND created_at < now() - interval '72 hours';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_unconfirmed_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_stale_unconfirmed_users() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_stale_unconfirmed_users() FROM authenticated;

SELECT cron.schedule(
  'cleanup-stale-unconfirmed-users',
  '17 * * * *',
  'SELECT public.cleanup_stale_unconfirmed_users();'
);
