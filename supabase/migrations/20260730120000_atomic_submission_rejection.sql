-- Keep rejection and candidate creation behind equivalent row-locking review
-- boundaries so every submission can transition away from pending only once.
CREATE OR REPLACE FUNCTION public.reject_game_submission(
  p_submission_id uuid,
  p_reviewer_id uuid,
  p_review_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_submission public.game_submissions%ROWTYPE;
BEGIN
  IF p_review_notes IS NULL
    OR length(btrim(p_review_notes)) = 0
    OR length(p_review_notes) > 2000
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_submission_review_notes';
  END IF;

  SELECT *
  INTO v_submission
  FROM public.game_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'submission_not_found';
  END IF;

  IF v_submission.status <> 'pending' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'submission_already_reviewed';
  END IF;

  UPDATE public.game_submissions
  SET
    review_notes = btrim(p_review_notes),
    reviewed_at = now(),
    reviewed_by = p_reviewer_id,
    status = 'rejected',
    updated_at = now()
  WHERE id = p_submission_id
  RETURNING * INTO v_submission;

  RETURN to_jsonb(v_submission);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_game_submission(uuid, uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_game_submission(uuid, uuid, text)
TO service_role;
