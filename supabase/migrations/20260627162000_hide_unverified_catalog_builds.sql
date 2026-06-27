-- Hide legacy catalog entries that do not have verified redistribution rights.
--
-- This preserves historical rows and storage objects, but removes them from the
-- public catalog path used by the current API. A game can be re-published later
-- by adding a verified game_rights row and re-enabling its reviewed build.

UPDATE public.game_builds
SET
  enabled = false,
  updated_at = now()
WHERE enabled = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.game_rights
    WHERE game_rights.game_id = game_builds.game_id
      AND (
        game_rights.game_build_id IS NULL
        OR game_rights.game_build_id = game_builds.id
      )
      AND game_rights.verified_at IS NOT NULL
  );

UPDATE public.games
SET publication_status = 'disabled'
WHERE publication_status = 'published'
  AND NOT EXISTS (
    SELECT 1
    FROM public.game_builds
    JOIN public.game_rights
      ON game_rights.game_id = game_builds.game_id
     AND (
       game_rights.game_build_id IS NULL
       OR game_rights.game_build_id = game_builds.id
     )
     AND game_rights.verified_at IS NOT NULL
    WHERE game_builds.game_id = games.id
      AND game_builds.enabled = true
  );
