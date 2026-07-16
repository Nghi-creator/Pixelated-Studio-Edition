CREATE OR REPLACE FUNCTION public.create_submission_candidate(
  p_submission_id uuid,
  p_reviewer_id uuid,
  p_review_notes text,
  p_candidate jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_candidate public.catalog_ingestion_candidates%ROWTYPE;
  v_submission public.game_submissions%ROWTYPE;
BEGIN
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

  INSERT INTO public.catalog_ingestion_candidates (
    artifact_filename,
    artifact_sha256,
    artifact_size,
    artifact_url,
    asset_license_spdx,
    attribution_text,
    code_license_spdx,
    cover_license_spdx,
    developer_name,
    developer_url,
    import_status,
    last_seen_at,
    license_url,
    noncommercial_hosting_allowed,
    original_release_url,
    permission_evidence_url,
    platform_id,
    rights_warnings,
    runtime_id,
    runtime_kind,
    source_commit,
    source_entry_path,
    source_kind,
    source_metadata,
    source_repo_url,
    title
  )
  VALUES (
    p_candidate->>'artifact_filename',
    p_candidate->>'artifact_sha256',
    (p_candidate->>'artifact_size')::bigint,
    p_candidate->>'artifact_url',
    NULLIF(p_candidate->>'asset_license_spdx', ''),
    p_candidate->>'attribution_text',
    p_candidate->>'code_license_spdx',
    NULLIF(p_candidate->>'cover_license_spdx', ''),
    NULLIF(p_candidate->>'developer_name', ''),
    NULLIF(p_candidate->>'developer_url', ''),
    p_candidate->>'import_status',
    (p_candidate->>'last_seen_at')::timestamptz,
    NULLIF(p_candidate->>'license_url', ''),
    (p_candidate->>'noncommercial_hosting_allowed')::boolean,
    NULLIF(p_candidate->>'original_release_url', ''),
    NULLIF(p_candidate->>'permission_evidence_url', ''),
    p_candidate->>'platform_id',
    ARRAY(
      SELECT jsonb_array_elements_text(
        COALESCE(p_candidate->'rights_warnings', '[]'::jsonb)
      )
    ),
    p_candidate->>'runtime_id',
    p_candidate->>'runtime_kind',
    p_candidate->>'source_commit',
    p_candidate->>'source_entry_path',
    p_candidate->>'source_kind',
    COALESCE(p_candidate->'source_metadata', '{}'::jsonb),
    p_candidate->>'source_repo_url',
    p_candidate->>'title'
  )
  RETURNING * INTO v_candidate;

  UPDATE public.game_submissions
  SET
    catalog_candidate_id = v_candidate.id,
    review_notes = p_review_notes,
    reviewed_at = now(),
    reviewed_by = p_reviewer_id,
    status = 'candidate_created',
    updated_at = now()
  WHERE id = p_submission_id
  RETURNING * INTO v_submission;

  RETURN jsonb_build_object(
    'candidate', to_jsonb(v_candidate) - ARRAY[
      'created_at',
      'reviewed_at',
      'reviewed_by',
      'source_metadata',
      'updated_at'
    ],
    'submission', to_jsonb(v_submission)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_submission_candidate(uuid, uuid, text, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_submission_candidate(uuid, uuid, text, jsonb)
TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_comment_report(
  p_report_id uuid,
  p_comment_id uuid,
  p_target_user_id uuid,
  p_action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comment_id uuid;
  v_target_user_id uuid;
BEGIN
  IF p_action NOT IN ('delete_comment', 'ban_user') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_report_action';
  END IF;

  SELECT comment_id
  INTO v_comment_id
  FROM public.reported_comments
  WHERE id = p_report_id
  FOR UPDATE;

  IF NOT FOUND OR v_comment_id IS DISTINCT FROM p_comment_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'report_not_found';
  END IF;

  SELECT user_id
  INTO v_target_user_id
  FROM public.comments
  WHERE id = p_comment_id
  FOR UPDATE;

  IF NOT FOUND OR v_target_user_id IS DISTINCT FROM p_target_user_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'comment_not_found';
  END IF;

  IF p_action = 'ban_user' THEN
    UPDATE public.profiles
    SET is_banned = true
    WHERE id = p_target_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = 'target_user_not_found';
    END IF;
  END IF;

  DELETE FROM public.comments
  WHERE id = p_comment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_comment_report(uuid, uuid, uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_comment_report(uuid, uuid, uuid, text)
TO service_role;
