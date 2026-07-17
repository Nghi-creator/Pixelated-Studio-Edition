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

CREATE POLICY "Users can view own game activity"
  ON public.user_game_activity
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_game_play(
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
  IF p_client_edition NOT IN ('studio', 'user') THEN
    RAISE EXCEPTION 'Invalid client edition';
  END IF;
  IF p_runtime_kind NOT IN ('wasm', 'webrtc', 'native') THEN
    RAISE EXCEPTION 'Invalid runtime kind';
  END IF;

  UPDATE public.games
  SET play_count = COALESCE(play_count, 0) + 1
  WHERE id = p_game_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  INSERT INTO public.user_game_activity (
    user_id,
    game_id,
    client_edition,
    runtime_kind,
    play_count,
    last_played_at
  )
  VALUES (p_user_id, p_game_id, p_client_edition, p_runtime_kind, 1, now())
  ON CONFLICT (user_id, game_id, client_edition, runtime_kind)
  DO UPDATE SET
    play_count = public.user_game_activity.play_count + 1,
    last_played_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_game_play(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_game_play(uuid, uuid, text, text) TO service_role;
