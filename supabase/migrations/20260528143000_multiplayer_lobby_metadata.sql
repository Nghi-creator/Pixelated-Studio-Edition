CREATE TABLE public.multiplayer_lobbies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  game_id text NOT NULL,
  engine_url text,
  exposure_mode text NOT NULL DEFAULT 'unknown'
    CHECK (exposure_mode IN ('local', 'lan', 'unknown')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended')),
  max_players integer NOT NULL DEFAULT 4
    CHECK (max_players BETWEEN 1 AND 4),
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (host_user_id, session_id)
);

CREATE INDEX multiplayer_lobbies_host_updated_idx
  ON public.multiplayer_lobbies(host_user_id, updated_at DESC);

CREATE INDEX multiplayer_lobbies_status_updated_idx
  ON public.multiplayer_lobbies(status, updated_at DESC);

ALTER TABLE public.multiplayer_lobbies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own multiplayer lobbies"
ON public.multiplayer_lobbies FOR SELECT
USING (auth.uid() = host_user_id);
