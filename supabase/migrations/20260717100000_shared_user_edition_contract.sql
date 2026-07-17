-- Shared schema contract for Studio Edition and User Edition.
-- This repository (Pixelated-Studio-Edition) is the sole migration authority.

-- Keep executable ROMs private while public artwork remains in catalog_artifacts.
INSERT INTO storage.buckets (id, name, public)
VALUES ('catalog_roms', 'catalog_roms', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Catalog ROMs are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Catalog ROMs are readable by authenticated users" ON storage.objects;

-- Record which frontend/runtime created a backend session.
ALTER TABLE public.backend_sessions
  ADD COLUMN IF NOT EXISTS client_edition text NOT NULL DEFAULT 'studio',
  ADD COLUMN IF NOT EXISTS client_runtime_kind text NOT NULL DEFAULT 'webrtc',
  ADD COLUMN IF NOT EXISTS browser_core_id text,
  ADD COLUMN IF NOT EXISTS browser_system_id text;

ALTER TABLE public.backend_sessions
  DROP CONSTRAINT IF EXISTS backend_sessions_client_edition_check,
  DROP CONSTRAINT IF EXISTS backend_sessions_client_runtime_kind_check,
  DROP CONSTRAINT IF EXISTS backend_sessions_browser_core_id_check,
  DROP CONSTRAINT IF EXISTS backend_sessions_browser_system_id_check;

ALTER TABLE public.backend_sessions
  ADD CONSTRAINT backend_sessions_client_edition_check
    CHECK (client_edition IN ('studio', 'user')),
  ADD CONSTRAINT backend_sessions_client_runtime_kind_check
    CHECK (client_runtime_kind IN ('wasm', 'webrtc', 'native')),
  ADD CONSTRAINT backend_sessions_browser_core_id_check
    CHECK (browser_core_id IS NULL OR browser_core_id IN ('fceumm')),
  ADD CONSTRAINT backend_sessions_browser_system_id_check
    CHECK (browser_system_id IS NULL OR browser_system_id IN ('nes'));

CREATE INDEX IF NOT EXISTS backend_sessions_edition_runtime_idx
  ON public.backend_sessions (client_edition, client_runtime_kind, expires_at DESC);

-- Edition-aware recent activity shared by both clients.
CREATE TABLE IF NOT EXISTS public.user_game_activity (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  client_edition text NOT NULL CHECK (client_edition IN ('studio', 'user')),
  runtime_kind text NOT NULL CHECK (runtime_kind IN ('wasm', 'webrtc', 'native')),
  play_count integer NOT NULL DEFAULT 1 CHECK (play_count > 0),
  last_played_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id, client_edition, runtime_kind)
);

CREATE INDEX IF NOT EXISTS user_game_activity_recent_idx
  ON public.user_game_activity (user_id, last_played_at DESC);

ALTER TABLE public.user_game_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own game activity"
  ON public.user_game_activity;
CREATE POLICY "Users can view own game activity"
  ON public.user_game_activity
  FOR SELECT
  USING (auth.uid() = user_id);

-- One immutable event id makes retries idempotent.
CREATE TABLE IF NOT EXISTS public.game_play_events (
  event_id text PRIMARY KEY CHECK (
    char_length(event_id) BETWEEN 16 AND 100
    AND event_id ~ '^[a-zA-Z0-9_-]+$'
  ),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  client_edition text NOT NULL CHECK (client_edition IN ('studio', 'user')),
  runtime_kind text NOT NULL CHECK (runtime_kind IN ('wasm', 'webrtc', 'native')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_play_events_user_created_idx
  ON public.game_play_events (user_id, created_at DESC);

ALTER TABLE public.game_play_events ENABLE ROW LEVEL SECURITY;

-- Keep the existing four-argument overload during rollout so the currently
-- deployed API remains compatible until the new API version is live.
CREATE OR REPLACE FUNCTION public.record_game_play(
  p_event_id text,
  p_game_id uuid,
  p_user_id uuid,
  p_client_edition text,
  p_runtime_kind text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event_id IS NULL
    OR char_length(p_event_id) NOT BETWEEN 16 AND 100
    OR p_event_id !~ '^[a-zA-Z0-9_-]+$'
  THEN
    RAISE EXCEPTION 'Invalid play event id';
  END IF;
  IF p_client_edition NOT IN ('studio', 'user') THEN
    RAISE EXCEPTION 'Invalid client edition';
  END IF;
  IF p_runtime_kind NOT IN ('wasm', 'webrtc', 'native') THEN
    RAISE EXCEPTION 'Invalid runtime kind';
  END IF;

  INSERT INTO public.game_play_events (
    event_id, user_id, game_id, client_edition, runtime_kind
  )
  VALUES (
    p_event_id, p_user_id, p_game_id, p_client_edition, p_runtime_kind
  )
  ON CONFLICT (event_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.games
  SET play_count = COALESCE(play_count, 0) + 1
  WHERE id = p_game_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  INSERT INTO public.user_game_activity (
    user_id, game_id, client_edition, runtime_kind, play_count, last_played_at
  )
  VALUES (
    p_user_id, p_game_id, p_client_edition, p_runtime_kind, 1, now()
  )
  ON CONFLICT (user_id, game_id, client_edition, runtime_kind)
  DO UPDATE SET
    play_count = public.user_game_activity.play_count + 1,
    last_played_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_game_play(text, uuid, uuid, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_game_play(text, uuid, uuid, text, text)
  FROM anon;
REVOKE ALL ON FUNCTION public.record_game_play(text, uuid, uuid, text, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_game_play(text, uuid, uuid, text, text)
  TO service_role;
