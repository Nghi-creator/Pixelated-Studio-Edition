-- Persist the result of an authenticated User Edition browser smoke test.
-- Technical/browser eligibility remains derived by the API from the candidate
-- metadata so it cannot drift when the supported browser core registry changes.

ALTER TABLE public.catalog_ingestion_candidates
  ADD COLUMN IF NOT EXISTS browser_smoke_status text NOT NULL DEFAULT 'not_tested',
  ADD COLUMN IF NOT EXISTS browser_smoke_core_id text,
  ADD COLUMN IF NOT EXISTS browser_smoke_error text,
  ADD COLUMN IF NOT EXISTS browser_smoke_tested_at timestamptz,
  ADD COLUMN IF NOT EXISTS browser_smoke_tested_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.catalog_ingestion_candidates
  DROP CONSTRAINT IF EXISTS catalog_candidates_browser_smoke_status_check;

ALTER TABLE public.catalog_ingestion_candidates
  ADD CONSTRAINT catalog_candidates_browser_smoke_status_check CHECK (
    browser_smoke_status IN ('not_tested', 'passed', 'failed')
  );

ALTER TABLE public.catalog_ingestion_candidates
  DROP CONSTRAINT IF EXISTS catalog_candidates_browser_smoke_evidence_check;

ALTER TABLE public.catalog_ingestion_candidates
  ADD CONSTRAINT catalog_candidates_browser_smoke_evidence_check CHECK (
    (
      browser_smoke_status = 'not_tested'
      AND browser_smoke_core_id IS NULL
      AND browser_smoke_error IS NULL
      AND browser_smoke_tested_at IS NULL
      AND browser_smoke_tested_by IS NULL
    )
    OR (
      browser_smoke_status = 'passed'
      AND browser_smoke_core_id IS NOT NULL
      AND browser_smoke_error IS NULL
      AND browser_smoke_tested_at IS NOT NULL
    )
    OR (
      browser_smoke_status = 'failed'
      AND browser_smoke_core_id IS NOT NULL
      AND browser_smoke_error IS NOT NULL
      AND browser_smoke_tested_at IS NOT NULL
    )
  );
