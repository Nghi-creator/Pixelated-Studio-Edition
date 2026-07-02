ALTER TABLE public.game_submissions
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS catalog_candidate_id uuid REFERENCES public.catalog_ingestion_candidates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS game_submissions_admin_review_idx
ON public.game_submissions(status, created_at DESC);

ALTER TABLE public.catalog_ingestion_candidates
  DROP CONSTRAINT IF EXISTS catalog_ingestion_candidates_source_kind_check;

ALTER TABLE public.catalog_ingestion_candidates
  ADD CONSTRAINT catalog_ingestion_candidates_source_kind_check CHECK (
    source_kind IN (
      'homebrew_hub_gb',
      'homebrew_hub_gba',
      'homebrew_hub_nes',
      'debian_main_games',
      'curated_licensed_rom',
      'user_submission'
    )
  );
