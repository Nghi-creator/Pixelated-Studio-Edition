-- Anonymous Auth users exist only to own short-lived public gameplay sessions.
-- Do not create social profiles for them or let them use permanent-account writes.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF new.is_anonymous IS TRUE THEN
    RETURN new;
  END IF;

  INSERT INTO public.profiles (id, email, username, avatar_url)
  VALUES (
    new.id,
    new.email,
    COALESCE(
      NULLIF(new.raw_user_meta_data->>'username', ''),
      NULLIF(new.raw_user_meta_data->>'user_name', ''),
      NULLIF(split_part(COALESCE(new.email, ''), '@', 1), ''),
      'player'
    ),
    NULL
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

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
    AND is_anonymous IS NOT TRUE
    AND created_at < now() - interval '72 hours';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_unconfirmed_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_stale_unconfirmed_users() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_stale_unconfirmed_users() FROM authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_stale_anonymous_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM auth.users
  WHERE is_anonymous IS TRUE
    AND created_at < now() - interval '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_anonymous_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_stale_anonymous_users() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_stale_anonymous_users() FROM authenticated;

SELECT cron.schedule(
  'cleanup-stale-anonymous-users',
  '23 3 * * *',
  'SELECT public.cleanup_stale_anonymous_users();'
);

CREATE POLICY "Permanent users can insert profiles"
ON public.profiles AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false);

CREATE POLICY "Permanent users can update profiles"
ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
USING (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false)
WITH CHECK (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false);

CREATE POLICY "Permanent users can insert favorites"
ON public.favorites AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false);

CREATE POLICY "Permanent users can delete favorites"
ON public.favorites AS RESTRICTIVE FOR DELETE TO authenticated
USING (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false);

CREATE POLICY "Permanent users can insert likes"
ON public.likes AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false);

CREATE POLICY "Permanent users can update likes"
ON public.likes AS RESTRICTIVE FOR UPDATE TO authenticated
USING (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false)
WITH CHECK (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false);

CREATE POLICY "Permanent users can delete likes"
ON public.likes AS RESTRICTIVE FOR DELETE TO authenticated
USING (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false);

CREATE POLICY "Permanent users can insert comments"
ON public.comments AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false);

CREATE POLICY "Permanent users can delete comments"
ON public.comments AS RESTRICTIVE FOR DELETE TO authenticated
USING (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false);

CREATE POLICY "Permanent users can insert comment likes"
ON public.comment_likes AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false);

CREATE POLICY "Permanent users can update comment likes"
ON public.comment_likes AS RESTRICTIVE FOR UPDATE TO authenticated
USING (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false)
WITH CHECK (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false);

CREATE POLICY "Permanent users can delete comment likes"
ON public.comment_likes AS RESTRICTIVE FOR DELETE TO authenticated
USING (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false);

CREATE POLICY "Permanent users can submit reports"
ON public.reported_comments AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false);

CREATE POLICY "Permanent users can upload account assets"
ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket_id NOT IN ('avatars', 'submissions')
  OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false
);

CREATE POLICY "Permanent users can update account assets"
ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  bucket_id NOT IN ('avatars', 'submissions')
  OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false
)
WITH CHECK (
  bucket_id NOT IN ('avatars', 'submissions')
  OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false
);

CREATE POLICY "Permanent users can delete account assets"
ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  bucket_id NOT IN ('avatars', 'submissions')
  OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false
);
