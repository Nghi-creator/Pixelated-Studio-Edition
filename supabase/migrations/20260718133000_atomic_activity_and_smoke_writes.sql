-- Increment access-log sessions atomically. A guest session may be upgraded to
-- its authenticated owner, but an attributed session cannot be overwritten by
-- an anonymous or different authenticated caller.
CREATE OR REPLACE FUNCTION public.record_access_log(
  p_path text,
  p_session_id text,
  p_user_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.access_logs (
    access_count,
    last_seen_at,
    path,
    session_id,
    user_id
  )
  VALUES (1, now(), p_path, p_session_id, p_user_id)
  ON CONFLICT (session_id) DO UPDATE SET
    access_count = public.access_logs.access_count + 1,
    last_seen_at = EXCLUDED.last_seen_at,
    path = EXCLUDED.path,
    user_id = COALESCE(public.access_logs.user_id, EXCLUDED.user_id)
  WHERE public.access_logs.user_id IS NULL
    OR public.access_logs.user_id = EXCLUDED.user_id;
$$;

REVOKE ALL ON FUNCTION public.record_access_log(text, text, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_access_log(text, text, uuid)
TO service_role;

-- Persist artifact-ticket consumption so one ticket cannot download repeatedly
-- across API instances. Expired claims are removed opportunistically.
CREATE TABLE IF NOT EXISTS public.browser_smoke_artifact_claims (
  nonce text PRIMARY KEY,
  candidate_id uuid NOT NULL
    REFERENCES public.catalog_ingestion_candidates(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS browser_smoke_artifact_claims_expires_idx
ON public.browser_smoke_artifact_claims (expires_at);

ALTER TABLE public.browser_smoke_artifact_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.browser_smoke_artifact_claims
FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.browser_smoke_artifact_claims TO service_role;

CREATE OR REPLACE FUNCTION public.claim_browser_smoke_artifact(
  p_candidate_id uuid,
  p_expires_at timestamptz,
  p_nonce text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inserted_count integer;
BEGIN
  IF p_expires_at <= now() OR char_length(p_nonce) NOT BETWEEN 16 AND 128 THEN
    RETURN false;
  END IF;

  DELETE FROM public.browser_smoke_artifact_claims
  WHERE expires_at <= now();

  INSERT INTO public.browser_smoke_artifact_claims (
    nonce,
    candidate_id,
    expires_at
  )
  VALUES (p_nonce, p_candidate_id, p_expires_at)
  ON CONFLICT (nonce) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_browser_smoke_artifact(uuid, timestamptz, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_browser_smoke_artifact(uuid, timestamptz, text)
TO service_role;

-- Consume smoke-test results with one conditional update so concurrent uses of
-- the same ticket cannot race and overwrite reviewer evidence.
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
  IF p_core_id <> 'fceumm' OR p_status NOT IN ('passed', 'failed') THEN
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

REVOKE ALL ON FUNCTION public.record_browser_smoke_result(
  text,
  uuid,
  text,
  text,
  timestamptz,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_browser_smoke_result(
  text,
  uuid,
  text,
  text,
  timestamptz,
  uuid,
  text
) TO service_role;
