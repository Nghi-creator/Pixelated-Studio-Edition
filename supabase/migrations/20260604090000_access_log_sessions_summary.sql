ALTER TABLE public.access_logs
ADD COLUMN IF NOT EXISTS session_id text,
ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS access_count integer DEFAULT 1 NOT NULL;

UPDATE public.access_logs
SET
  session_id = COALESCE(session_id, id::text),
  last_seen_at = COALESCE(last_seen_at, created_at),
  access_count = GREATEST(COALESCE(access_count, 1), 1)
WHERE session_id IS NULL
  OR last_seen_at IS NULL
  OR access_count IS NULL
  OR access_count < 1;

ALTER TABLE public.access_logs
ALTER COLUMN session_id SET NOT NULL;

ALTER TABLE public.access_logs
ALTER COLUMN last_seen_at SET DEFAULT timezone('utc'::text, now());

ALTER TABLE public.access_logs
ALTER COLUMN last_seen_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS access_logs_session_id_key
ON public.access_logs (session_id);

CREATE OR REPLACE FUNCTION public.admin_access_log_summary(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS TABLE (
  first_seen_at timestamp with time zone,
  last_seen_at timestamp with time zone,
  sessions_count bigint,
  total_count bigint,
  user_id uuid,
  username text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH grouped_logs AS (
    SELECT
      access_logs.user_id,
      profiles.username,
      MIN(access_logs.created_at) AS first_seen_at,
      MAX(access_logs.last_seen_at) AS last_seen_at,
      COUNT(*) AS sessions_count
    FROM public.access_logs
    LEFT JOIN public.profiles
      ON profiles.id = access_logs.user_id
    GROUP BY access_logs.user_id, profiles.username
  ),
  counted_logs AS (
    SELECT
      grouped_logs.*,
      COUNT(*) OVER () AS total_count
    FROM grouped_logs
  )
  SELECT
    counted_logs.first_seen_at,
    counted_logs.last_seen_at,
    counted_logs.sessions_count,
    counted_logs.total_count,
    counted_logs.user_id,
    counted_logs.username
  FROM counted_logs
  ORDER BY counted_logs.last_seen_at DESC
  LIMIT LEAST(GREATEST(p_page_size, 1), 100)
  OFFSET (GREATEST(p_page, 1) - 1) * LEAST(GREATEST(p_page_size, 1), 100);
$$;
