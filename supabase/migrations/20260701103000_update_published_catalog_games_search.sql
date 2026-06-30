-- Add server-side search support to the public catalog RPC without mutating
-- the already-created base migration.

DROP FUNCTION IF EXISTS public.published_catalog_games(uuid, integer, text);

CREATE OR REPLACE FUNCTION public.published_catalog_games(
  p_game_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 1000,
  p_order text DEFAULT 'title',
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  author_name text,
  developer_name text,
  developer_url text,
  rom_url text,
  rom_filename text,
  cover_url text,
  backdrop_url text,
  play_count integer,
  publication_status text,
  game_builds jsonb,
  game_rights jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH verified_builds AS (
    SELECT game_builds.*
    FROM public.game_builds
    WHERE game_builds.enabled = true
      AND EXISTS (
        SELECT 1
        FROM public.game_rights
        WHERE game_rights.game_id = game_builds.game_id
          AND (
            game_rights.game_build_id IS NULL
            OR game_rights.game_build_id = game_builds.id
          )
          AND game_rights.verified_at IS NOT NULL
      )
  ),
  eligible_games AS (
    SELECT games.id
    FROM public.games
    JOIN verified_builds
      ON verified_builds.game_id = games.id
    WHERE games.publication_status = 'published'
      AND (p_game_id IS NULL OR games.id = p_game_id)
      AND (
        NULLIF(trim(COALESCE(p_search, '')), '') IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM regexp_split_to_table(lower(trim(p_search)), '\s+') AS search_terms(term)
          WHERE lower(
            COALESCE(games.title, '') || ' ' ||
            COALESCE(games.author_name, '') || ' ' ||
            COALESCE(games.developer_name, '')
          ) NOT LIKE '%' || search_terms.term || '%'
        )
      )
    GROUP BY games.id
    HAVING count(verified_builds.id) = 1
  )
  SELECT
    games.id,
    games.title,
    games.author_name,
    games.developer_name,
    games.developer_url,
    games.rom_url,
    games.rom_filename,
    games.cover_url,
    games.backdrop_url,
    games.play_count,
    games.publication_status,
    (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', verified_builds.id,
            'game_id', verified_builds.game_id,
            'runtime_kind', verified_builds.runtime_kind,
            'runtime_id', verified_builds.runtime_id,
            'platform_id', verified_builds.platform_id,
            'artifact_url', verified_builds.artifact_url,
            'artifact_filename', verified_builds.artifact_filename,
            'artifact_size', verified_builds.artifact_size,
            'artifact_sha256', verified_builds.artifact_sha256,
            'launch_manifest_id', verified_builds.launch_manifest_id,
            'enabled', verified_builds.enabled
          )
          ORDER BY verified_builds.id
        ),
        '[]'::jsonb
      )
      FROM verified_builds
      WHERE verified_builds.game_id = games.id
    ) AS game_builds,
    (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', game_rights.id,
            'game_id', game_rights.game_id,
            'game_build_id', game_rights.game_build_id,
            'code_license_spdx', game_rights.code_license_spdx,
            'asset_license_spdx', game_rights.asset_license_spdx,
            'cover_license_spdx', game_rights.cover_license_spdx,
            'license_url', game_rights.license_url,
            'source_url', game_rights.source_url,
            'original_release_url', game_rights.original_release_url,
            'permission_evidence_url', game_rights.permission_evidence_url,
            'attribution_text', game_rights.attribution_text,
            'commercial_use_allowed', game_rights.commercial_use_allowed,
            'modification_allowed', game_rights.modification_allowed,
            'review_notes', game_rights.review_notes,
            'verified_at', game_rights.verified_at
          )
          ORDER BY game_rights.verified_at DESC NULLS LAST, game_rights.id
        ),
        '[]'::jsonb
      )
      FROM public.game_rights
      WHERE game_rights.game_id = games.id
        AND game_rights.verified_at IS NOT NULL
    ) AS game_rights
  FROM public.games
  JOIN eligible_games
    ON eligible_games.id = games.id
  ORDER BY
    CASE WHEN p_order = 'play_count_desc' THEN games.play_count END DESC NULLS LAST,
    CASE WHEN p_order = 'title' THEN lower(games.title) END ASC NULLS LAST,
    games.id
  LIMIT greatest(0, least(coalesce(p_limit, 1000), 5000));
$$;

GRANT EXECUTE ON FUNCTION public.published_catalog_games(uuid, integer, text, text)
TO anon, authenticated, service_role;
