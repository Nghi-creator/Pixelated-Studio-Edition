-- Phase 4: allow Debian native package candidates in the shared review queue.
--
-- Native builds are installed into an engine image from a locked package
-- manifest, so candidate rows carry a launch manifest/package identity instead
-- of a downloadable ROM artifact.

ALTER TABLE public.catalog_ingestion_candidates
  ADD COLUMN IF NOT EXISTS launch_manifest_id text,
  ADD COLUMN IF NOT EXISTS package_name text,
  ADD COLUMN IF NOT EXISTS package_version text,
  ADD COLUMN IF NOT EXISTS package_component text;

ALTER TABLE public.catalog_ingestion_candidates
  ALTER COLUMN artifact_url DROP NOT NULL,
  ALTER COLUMN artifact_filename DROP NOT NULL,
  ALTER COLUMN artifact_size DROP NOT NULL,
  ALTER COLUMN artifact_sha256 DROP NOT NULL;

ALTER TABLE public.catalog_ingestion_candidates
  DROP CONSTRAINT IF EXISTS catalog_ingestion_candidates_source_kind_check;

ALTER TABLE public.catalog_ingestion_candidates
  ADD CONSTRAINT catalog_ingestion_candidates_source_kind_check CHECK (
    source_kind IN (
      'homebrew_hub_gb',
      'homebrew_hub_gba',
      'homebrew_hub_nes',
      'debian_main_games'
    )
  );

ALTER TABLE public.catalog_ingestion_candidates
  DROP CONSTRAINT IF EXISTS catalog_ingestion_candidates_runtime_payload_check;

ALTER TABLE public.catalog_ingestion_candidates
  ADD CONSTRAINT catalog_ingestion_candidates_runtime_payload_check CHECK (
    (
      runtime_kind = 'libretro'
      AND launch_manifest_id IS NULL
      AND artifact_url IS NOT NULL
      AND artifact_filename IS NOT NULL
      AND artifact_size IS NOT NULL
      AND artifact_sha256 IS NOT NULL
    )
    OR (
      runtime_kind = 'native_linux'
      AND launch_manifest_id IS NOT NULL
      AND package_name IS NOT NULL
      AND package_version IS NOT NULL
      AND package_component = 'main'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS catalog_ingestion_candidates_native_manifest_idx
ON public.catalog_ingestion_candidates(
  source_kind,
  source_commit,
  source_entry_path,
  launch_manifest_id
);
