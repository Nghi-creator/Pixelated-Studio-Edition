-- Phase 5: allow manually curated, license-evidenced ROM manifests for
-- additional libretro platforms such as SNES/SFC.

ALTER TABLE public.catalog_ingestion_candidates
  DROP CONSTRAINT IF EXISTS catalog_ingestion_candidates_source_kind_check;

ALTER TABLE public.catalog_ingestion_candidates
  ADD CONSTRAINT catalog_ingestion_candidates_source_kind_check CHECK (
    source_kind IN (
      'homebrew_hub_gb',
      'homebrew_hub_gba',
      'homebrew_hub_nes',
      'debian_main_games',
      'curated_licensed_rom'
    )
  );
