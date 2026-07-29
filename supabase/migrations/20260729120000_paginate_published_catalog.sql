-- Keep catalog payload construction bounded to the requested page. The previous
-- endpoint fetched up to 5,000 complete games (including nested builds/rights)
-- and discarded almost all of them in Node.

CREATE OR REPLACE FUNCTION public.published_catalog_games_page(
  p_offset integer DEFAULT 0,
  p_page_size integer DEFAULT 15,
  p_search text DEFAULT NULL,
  p_genre text DEFAULT NULL,
  p_license_spdx text DEFAULT NULL,
  p_platform text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  author_name text,
  developer_name text,
  developer_url text,
  genre_slug text,
  rom_url text,
  rom_filename text,
  cover_url text,
  backdrop_url text,
  play_count integer,
  publication_status text,
  game_builds jsonb,
  game_rights jsonb,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH verified_builds AS (
    SELECT game_builds.*
    FROM public.game_builds
    WHERE game_builds.enabled IS TRUE
      AND EXISTS (
        SELECT 1
        FROM public.game_rights
        WHERE game_rights.game_id = game_builds.game_id
          AND (
            game_rights.game_build_id IS NULL
            OR game_rights.game_build_id = game_builds.id
          )
          AND game_rights.verified_at IS NOT NULL
          AND game_rights.noncommercial_hosting_allowed IS TRUE
      )
  ),
  eligible_games AS (
    SELECT games.*
    FROM public.games
    JOIN verified_builds ON verified_builds.game_id = games.id
    WHERE games.publication_status = 'published'
      AND (p_genre IS NULL OR games.genre_slug = p_genre)
      AND (
        NULLIF(trim(COALESCE(p_platform, '')), '') IS NULL
        OR EXISTS (
          SELECT 1
          FROM verified_builds platform_build
          WHERE platform_build.game_id = games.id
            AND platform_build.platform_id = p_platform
        )
      )
      AND (
        NULLIF(trim(COALESCE(p_license_spdx, '')), '') IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.game_rights
          WHERE game_rights.game_id = games.id
            AND game_rights.verified_at IS NOT NULL
            AND game_rights.noncommercial_hosting_allowed IS TRUE
            AND (
              game_rights.code_license_spdx = p_license_spdx
              OR game_rights.asset_license_spdx = p_license_spdx
            )
        )
      )
      AND (
        NULLIF(trim(COALESCE(p_search, '')), '') IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM regexp_split_to_table(lower(trim(p_search)), '\s+') AS terms(term)
          WHERE lower(COALESCE(games.title, '')) NOT LIKE '%' || terms.term || '%'
        )
      )
    GROUP BY games.id
    HAVING count(verified_builds.id) = 1
  ),
  catalog_total AS (
    SELECT count(*) AS total_count
    FROM eligible_games
  ),
  counted_games AS (
    SELECT eligible_games.*, count(*) OVER () AS total_count
    FROM eligible_games
  ),
  page_games AS (
    SELECT *
    FROM counted_games
    ORDER BY
      CASE
        WHEN NULLIF(trim(COALESCE(p_search, '')), '') IS NULL THEN 0
        WHEN lower(title) = lower(trim(p_search)) THEN 0
        WHEN lower(title) LIKE lower(trim(p_search)) || '%' THEN 1
        WHEN lower(title) LIKE '%' || lower(trim(p_search)) || '%'
          THEN 2 + strpos(lower(title), lower(trim(p_search)))::numeric / 100
        ELSE 3
      END,
      lower(title) ASC NULLS LAST,
      id
    OFFSET greatest(0, coalesce(p_offset, 0))
    LIMIT greatest(1, least(coalesce(p_page_size, 15), 50))
  )
  SELECT
    page_games.id,
    page_games.title,
    page_games.author_name,
    page_games.developer_name,
    page_games.developer_url,
    page_games.genre_slug,
    page_games.rom_url,
    page_games.rom_filename,
    page_games.cover_url,
    page_games.backdrop_url,
    page_games.play_count,
    page_games.publication_status,
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
          ) ORDER BY verified_builds.id
        ),
        '[]'::jsonb
      )
      FROM verified_builds
      WHERE verified_builds.game_id = page_games.id
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
            'noncommercial_hosting_allowed', game_rights.noncommercial_hosting_allowed,
            'review_notes', game_rights.review_notes,
            'verified_at', game_rights.verified_at
          ) ORDER BY game_rights.verified_at DESC NULLS LAST, game_rights.id
        ),
        '[]'::jsonb
      )
      FROM public.game_rights
      WHERE game_rights.game_id = page_games.id
        AND game_rights.verified_at IS NOT NULL
        AND game_rights.noncommercial_hosting_allowed IS TRUE
    ) AS game_rights,
    page_games.total_count
  FROM page_games

  UNION ALL

  -- Preserve the real total when the requested offset is beyond the final page.
  -- The API discards this empty sentinel because it has no approved build.
  SELECT
    NULL::uuid,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::integer,
    NULL::text,
    '[]'::jsonb,
    '[]'::jsonb,
    catalog_total.total_count
  FROM catalog_total
  WHERE NOT EXISTS (SELECT 1 FROM page_games);
$$;

CREATE OR REPLACE FUNCTION public.published_catalog_filters()
RETURNS TABLE (genres text[], licenses text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH verified_builds AS (
    SELECT game_builds.*
    FROM public.game_builds
    WHERE game_builds.enabled IS TRUE
      AND EXISTS (
        SELECT 1
        FROM public.game_rights
        WHERE game_rights.game_id = game_builds.game_id
          AND (
            game_rights.game_build_id IS NULL
            OR game_rights.game_build_id = game_builds.id
          )
          AND game_rights.verified_at IS NOT NULL
          AND game_rights.noncommercial_hosting_allowed IS TRUE
      )
  ),
  eligible_games AS (
    SELECT games.id, games.genre_slug
    FROM public.games
    JOIN verified_builds ON verified_builds.game_id = games.id
    WHERE games.publication_status = 'published'
    GROUP BY games.id
    HAVING count(verified_builds.id) = 1
  )
  SELECT
    coalesce(
      (SELECT array_agg(DISTINCT genre_slug ORDER BY genre_slug)
       FROM eligible_games WHERE genre_slug IS NOT NULL),
      ARRAY[]::text[]
    ),
    coalesce(
      (
        SELECT array_agg(DISTINCT license ORDER BY license)
        FROM (
          SELECT game_rights.code_license_spdx AS license
          FROM public.game_rights
          JOIN eligible_games ON eligible_games.id = game_rights.game_id
          WHERE game_rights.verified_at IS NOT NULL
            AND game_rights.noncommercial_hosting_allowed IS TRUE
          UNION
          SELECT game_rights.asset_license_spdx
          FROM public.game_rights
          JOIN eligible_games ON eligible_games.id = game_rights.game_id
          WHERE game_rights.verified_at IS NOT NULL
            AND game_rights.noncommercial_hosting_allowed IS TRUE
        ) rights_licenses
        WHERE license IS NOT NULL
      ),
      ARRAY[]::text[]
    );
$$;

REVOKE ALL ON FUNCTION public.published_catalog_games_page(
  integer, integer, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.published_catalog_games_page(
  integer, integer, text, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.published_catalog_filters()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.published_catalog_filters()
  TO service_role;
