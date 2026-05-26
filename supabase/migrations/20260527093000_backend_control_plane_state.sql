CREATE TABLE public.backend_sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('cloud', 'local')),
  session_token_hash text NOT NULL,
  boot_rom_url text,
  boot_rom_filename text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at timestamptz NOT NULL,
  deleted_at timestamptz
);

CREATE INDEX backend_sessions_user_id_idx
  ON public.backend_sessions(user_id);

CREATE INDEX backend_sessions_expires_at_idx
  ON public.backend_sessions(expires_at);

CREATE TABLE public.local_engine_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  engine_url text NOT NULL,
  token_stored_by text NOT NULL DEFAULT 'browser-local-storage'
    CHECK (token_stored_by = 'browser-local-storage'),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX local_engine_pairings_user_id_idx
  ON public.local_engine_pairings(user_id);

CREATE TABLE public.stream_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  fps numeric,
  bitrate_kbps numeric,
  packets_lost integer NOT NULL,
  jitter_ms numeric,
  ice_connection_state text NOT NULL,
  connection_state text NOT NULL,
  metric_timestamp timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX stream_metrics_user_received_idx
  ON public.stream_metrics(user_id, received_at DESC);

CREATE INDEX stream_metrics_user_session_received_idx
  ON public.stream_metrics(user_id, session_id, received_at DESC);

ALTER TABLE public.backend_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_engine_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own local engine pairing"
ON public.local_engine_pairings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can read own recent stream metrics"
ON public.stream_metrics FOR SELECT
USING (auth.uid() = user_id);
