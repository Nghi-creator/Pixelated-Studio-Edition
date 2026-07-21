-- Add Gambatte as the User Edition browser core for Game Boy and Game Boy
-- Color. This only expands constrained session/smoke-test metadata; ROMs and
-- catalog rows remain unchanged.

ALTER TABLE public.backend_sessions
  DROP CONSTRAINT IF EXISTS backend_sessions_browser_core_id_check,
  DROP CONSTRAINT IF EXISTS backend_sessions_browser_system_id_check;

ALTER TABLE public.backend_sessions
  ADD CONSTRAINT backend_sessions_browser_core_id_check
    CHECK (browser_core_id IS NULL OR browser_core_id IN ('fceumm', 'gambatte')),
  ADD CONSTRAINT backend_sessions_browser_system_id_check
    CHECK (browser_system_id IS NULL OR browser_system_id IN ('nes', 'gb', 'gbc'));

CREATE OR REPLACE FUNCTION public.record_browser_smoke_result(
  p_artifact_sha256 text,
  p_candidate_id uuid,
  p_core_id text,
  p_error text,
  p_issued_at timestamptz,
  p_reviewer_id uuid,
  p_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_count integer;
BEGIN
  IF p_core_id IS NULL OR p_core_id NOT IN ('fceumm', 'gambatte')
    OR p_status IS NULL OR p_status NOT IN ('passed', 'failed') THEN
    RAISE EXCEPTION 'Invalid browser smoke result';
  END IF;
  IF p_status = 'failed' AND NULLIF(trim(p_error), '') IS NULL THEN
    RAISE EXCEPTION 'Failed browser smoke result requires an error';
  END IF;

  UPDATE public.catalog_ingestion_candidates
  SET
    browser_smoke_core_id = p_core_id,
    browser_smoke_error = CASE WHEN p_status = 'failed' THEN p_error ELSE NULL END,
    browser_smoke_status = p_status,
    browser_smoke_tested_at = now(),
    browser_smoke_tested_by = p_reviewer_id,
    updated_at = now()
  WHERE id = p_candidate_id
    AND lower(artifact_sha256) = lower(p_artifact_sha256)
    AND (
      browser_smoke_tested_at IS NULL
      OR browser_smoke_tested_at < p_issued_at
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END;
$$;
