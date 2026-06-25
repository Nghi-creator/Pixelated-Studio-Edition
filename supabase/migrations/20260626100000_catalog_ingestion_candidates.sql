-- Phase 2: candidate queue for licensed upstream ROM imports.
--
-- Importers write here only. Nothing in this table is public catalog content
-- until a reviewer approves and promotes it into games/game_builds/game_rights.

CREATE TABLE IF NOT EXISTS public.catalog_ingestion_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind text NOT NULL CHECK (
    source_kind IN ('homebrew_hub_gb', 'homebrew_hub_gba', 'homebrew_hub_nes')
  ),
  source_repo_url text NOT NULL,
  source_commit text NOT NULL CHECK (source_commit ~ '^[a-f0-9]{40}$'),
  source_entry_path text NOT NULL,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  title text NOT NULL,
  developer_name text,
  developer_url text,
  runtime_kind text NOT NULL CHECK (runtime_kind IN ('libretro', 'native_linux')),
  runtime_id text NOT NULL,
  platform_id text NOT NULL,
  artifact_url text NOT NULL,
  artifact_filename text NOT NULL,
  artifact_size bigint NOT NULL CHECK (artifact_size > 0),
  artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  code_license_spdx text NOT NULL,
  asset_license_spdx text,
  cover_license_spdx text,
  license_url text,
  original_release_url text,
  attribution_text text NOT NULL,
  rights_warnings text[] NOT NULL DEFAULT '{}',
  import_status text NOT NULL DEFAULT 'needs_review' CHECK (
    import_status IN ('needs_review', 'approved', 'rejected', 'promoted')
  ),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  promoted_game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  promoted_build_id uuid REFERENCES public.game_builds(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_candidates_review_state CHECK (
    import_status NOT IN ('approved', 'rejected', 'promoted')
    OR reviewed_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_ingestion_candidates_source_artifact_idx
ON public.catalog_ingestion_candidates(
  source_kind,
  source_commit,
  source_entry_path,
  artifact_filename
);

CREATE INDEX IF NOT EXISTS catalog_ingestion_candidates_review_idx
ON public.catalog_ingestion_candidates(import_status, source_kind, platform_id, last_seen_at DESC);

ALTER TABLE public.catalog_ingestion_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read catalog ingestion candidates"
ON public.catalog_ingestion_candidates;

CREATE POLICY "Admins can read catalog ingestion candidates"
ON public.catalog_ingestion_candidates FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "Service role owns catalog ingestion candidates"
ON public.catalog_ingestion_candidates;

CREATE POLICY "Service role owns catalog ingestion candidates"
ON public.catalog_ingestion_candidates
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
