-- Phase 0: separate catalog identity from executable builds and rights review.
-- Existing legacy rows are preserved, but public/API publication should now
-- require an enabled build and a verified rights record.

ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS publication_status text NOT NULL DEFAULT 'draft'
  CHECK (publication_status IN ('draft', 'pending_review', 'published', 'disabled')),
ADD COLUMN IF NOT EXISTS developer_name text,
ADD COLUMN IF NOT EXISTS developer_url text;

UPDATE public.games
SET developer_name = COALESCE(developer_name, author_name)
WHERE developer_name IS NULL
  AND author_name IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.game_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  runtime_kind text NOT NULL CHECK (runtime_kind IN ('libretro', 'native_linux')),
  runtime_id text NOT NULL,
  platform_id text NOT NULL,
  artifact_url text,
  artifact_filename text,
  artifact_size bigint CHECK (artifact_size IS NULL OR artifact_size >= 0),
  artifact_sha256 text CHECK (
    artifact_sha256 IS NULL OR artifact_sha256 ~ '^[a-f0-9]{64}$'
  ),
  launch_manifest_id text,
  multiplayer_max_players integer NOT NULL DEFAULT 1
    CHECK (multiplayer_max_players BETWEEN 1 AND 8),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_builds_libretro_artifact_required CHECK (
    runtime_kind <> 'libretro'
    OR COALESCE(artifact_url, artifact_filename) IS NOT NULL
  ),
  CONSTRAINT game_builds_native_manifest_required CHECK (
    runtime_kind <> 'native_linux'
    OR launch_manifest_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS game_builds_game_runtime_platform_idx
ON public.game_builds(game_id, runtime_id, platform_id);

CREATE INDEX IF NOT EXISTS game_builds_public_lookup_idx
ON public.game_builds(game_id, enabled, runtime_id, platform_id);

CREATE TABLE IF NOT EXISTS public.game_rights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  game_build_id uuid REFERENCES public.game_builds(id) ON DELETE CASCADE,
  code_license_spdx text,
  asset_license_spdx text,
  cover_license_spdx text,
  license_url text,
  source_url text,
  original_release_url text,
  attribution_text text,
  permission_evidence_url text,
  commercial_use_allowed boolean,
  modification_allowed boolean,
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_rights_verified_evidence_required CHECK (
    verified_at IS NULL
    OR (
      license_url IS NOT NULL
      AND source_url IS NOT NULL
      AND attribution_text IS NOT NULL
      AND (
        code_license_spdx IS NOT NULL
        OR asset_license_spdx IS NOT NULL
        OR permission_evidence_url IS NOT NULL
      )
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS game_rights_game_build_scope_idx
ON public.game_rights(game_id, COALESCE(game_build_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS game_rights_verified_lookup_idx
ON public.game_rights(game_id, game_build_id, verified_at)
WHERE verified_at IS NOT NULL;

INSERT INTO public.game_builds (
  game_id,
  runtime_kind,
  runtime_id,
  platform_id,
  artifact_url,
  artifact_filename,
  enabled
)
SELECT
  games.id,
  'libretro',
  'mesen',
  'nes',
  NULLIF(games.rom_url, ''),
  NULLIF(games.rom_filename, ''),
  true
FROM public.games
WHERE (
    NULLIF(games.rom_url, '') IS NOT NULL
    OR NULLIF(games.rom_filename, '') IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.game_builds
    WHERE game_builds.game_id = games.id
      AND game_builds.runtime_id = 'mesen'
      AND game_builds.platform_id = 'nes'
  );

-- Keep new submissions private until reviewer tooling creates signed access.
UPDATE storage.buckets
SET public = false
WHERE id = 'submissions';

ALTER TABLE public.game_builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_rights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Games are viewable by everyone"
ON public.games;

DROP POLICY IF EXISTS "Published rights-cleared games are viewable by everyone"
ON public.games;

CREATE POLICY "Published rights-cleared games are viewable by everyone"
ON public.games FOR SELECT
USING (
  publication_status = 'published'
  AND EXISTS (
    SELECT 1
    FROM public.game_builds
    WHERE game_builds.game_id = games.id
      AND game_builds.enabled = true
      AND EXISTS (
        SELECT 1
        FROM public.game_rights
        WHERE game_rights.game_id = games.id
          AND (
            game_rights.game_build_id IS NULL
            OR game_rights.game_build_id = game_builds.id
          )
          AND game_rights.verified_at IS NOT NULL
      )
  )
);

DROP POLICY IF EXISTS "Published game builds are viewable by everyone"
ON public.game_builds;

CREATE POLICY "Published game builds are viewable by everyone"
ON public.game_builds FOR SELECT
USING (
  enabled = true
  AND EXISTS (
    SELECT 1
    FROM public.games
    WHERE games.id = game_builds.game_id
      AND games.publication_status = 'published'
  )
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
);

DROP POLICY IF EXISTS "Admins can manage game builds"
ON public.game_builds;

CREATE POLICY "Admins can manage game builds"
ON public.game_builds FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "Published game rights are viewable by everyone"
ON public.game_rights;

CREATE POLICY "Published game rights are viewable by everyone"
ON public.game_rights FOR SELECT
USING (
  verified_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.games
    WHERE games.id = game_rights.game_id
      AND games.publication_status = 'published'
  )
);

DROP POLICY IF EXISTS "Admins can manage game rights"
ON public.game_rights;

CREATE POLICY "Admins can manage game rights"
ON public.game_rights FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
  )
);
