CREATE INDEX IF NOT EXISTS games_title_idx
ON public.games (title);

CREATE INDEX IF NOT EXISTS games_play_count_desc_idx
ON public.games (play_count DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS profiles_role_idx
ON public.profiles (role);

CREATE INDEX IF NOT EXISTS profiles_created_at_desc_idx
ON public.profiles (created_at DESC);

CREATE INDEX IF NOT EXISTS profiles_username_idx
ON public.profiles (username);

CREATE INDEX IF NOT EXISTS reported_comments_created_at_desc_idx
ON public.reported_comments (created_at DESC);

CREATE INDEX IF NOT EXISTS reported_comments_comment_id_idx
ON public.reported_comments (comment_id);

CREATE INDEX IF NOT EXISTS reported_comments_reporter_id_idx
ON public.reported_comments (reporter_id);

CREATE INDEX IF NOT EXISTS access_logs_user_id_idx
ON public.access_logs (user_id);

CREATE INDEX IF NOT EXISTS access_logs_last_seen_at_desc_idx
ON public.access_logs (last_seen_at DESC);
