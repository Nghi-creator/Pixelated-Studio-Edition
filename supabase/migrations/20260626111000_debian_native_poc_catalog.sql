-- Phase 3 proof-of-concept native catalog entries. These rows select
-- engine-owned launch manifests only; no executable path or shell command is
-- accepted from the database or client.

WITH native_games AS (
  SELECT *
  FROM (
    VALUES
      (
        'Frozen-Bubble',
        'frozen-bubble-native',
        'Frozen-Bubble Debian package',
        'https://tracker.debian.org/pkg/frozen-bubble'
      ),
      (
        'Neverball',
        'neverball-native',
        'Neverball Debian package',
        'https://tracker.debian.org/pkg/neverball'
      )
  ) AS rows(title, rom_filename, developer_name, developer_url)
)
INSERT INTO public.games (
  title,
  rom_filename,
  rom_url,
  cover_url,
  backdrop_url,
  author_name,
  developer_name,
  developer_url,
  publication_status
)
SELECT
  native_games.title,
  native_games.rom_filename,
  NULL,
  NULL,
  NULL,
  native_games.developer_name,
  native_games.developer_name,
  native_games.developer_url,
  'published'
FROM native_games
WHERE NOT EXISTS (
  SELECT 1
  FROM public.games
  WHERE games.rom_filename = native_games.rom_filename
);

WITH native_builds AS (
  SELECT *
  FROM (
    VALUES
      (
        'frozen-bubble-native',
        'frozen-bubble',
        'https://metadata.ftp-master.debian.org/changelogs/main/f/frozen-bubble/frozen-bubble_2.212-13_copyright',
        'https://tracker.debian.org/pkg/frozen-bubble',
        'Frozen-Bubble packaged by Debian main. Native launch manifest: frozen-bubble.'
      ),
      (
        'neverball-native',
        'neverball',
        'https://metadata.ftp-master.debian.org/changelogs/main/n/neverball/neverball_1.6.0+git20180603-3_copyright',
        'https://tracker.debian.org/pkg/neverball',
        'Neverball packaged by Debian main. Native launch manifest: neverball.'
      )
  ) AS rows(
    rom_filename,
    launch_manifest_id,
    license_url,
    source_url,
    attribution_text
  )
)
INSERT INTO public.game_builds (
  game_id,
  runtime_kind,
  runtime_id,
  platform_id,
  artifact_url,
  artifact_filename,
  artifact_size,
  artifact_sha256,
  launch_manifest_id,
  enabled
)
SELECT
  games.id,
  'native_linux',
  'debian-native-v1',
  'linux',
  NULL,
  NULL,
  NULL,
  NULL,
  native_builds.launch_manifest_id,
  true
FROM native_builds
JOIN public.games
  ON games.rom_filename = native_builds.rom_filename
ON CONFLICT (game_id, runtime_id, platform_id) DO UPDATE SET
  artifact_url = EXCLUDED.artifact_url,
  artifact_filename = EXCLUDED.artifact_filename,
  artifact_size = EXCLUDED.artifact_size,
  artifact_sha256 = EXCLUDED.artifact_sha256,
  launch_manifest_id = EXCLUDED.launch_manifest_id,
  runtime_kind = EXCLUDED.runtime_kind,
  enabled = EXCLUDED.enabled,
  updated_at = now();

WITH native_rights AS (
  SELECT *
  FROM (
    VALUES
      (
        'frozen-bubble-native',
        'frozen-bubble',
        'https://metadata.ftp-master.debian.org/changelogs/main/f/frozen-bubble/frozen-bubble_2.212-13_copyright',
        'https://tracker.debian.org/pkg/frozen-bubble',
        'Frozen-Bubble packaged by Debian main. See Debian copyright file for package license details.'
      ),
      (
        'neverball-native',
        'neverball',
        'https://metadata.ftp-master.debian.org/changelogs/main/n/neverball/neverball_1.6.0+git20180603-3_copyright',
        'https://tracker.debian.org/pkg/neverball',
        'Neverball packaged by Debian main. See Debian copyright file for package license details.'
      )
  ) AS rows(
    rom_filename,
    launch_manifest_id,
    license_url,
    source_url,
    attribution_text
  )
)
INSERT INTO public.game_rights (
  game_id,
  game_build_id,
  code_license_spdx,
  asset_license_spdx,
  license_url,
  source_url,
  original_release_url,
  attribution_text,
  commercial_use_allowed,
  modification_allowed,
  verified_at,
  review_notes
)
SELECT
  games.id,
  game_builds.id,
  'Debian-main',
  'Debian-main',
  native_rights.license_url,
  native_rights.source_url,
  native_rights.source_url,
  native_rights.attribution_text,
  true,
  true,
  '2026-06-26 00:00:00+00'::timestamptz,
  'Native Debian proof-of-concept entry. Package is installed by the native engine image and launched only through an engine-owned manifest.'
FROM native_rights
JOIN public.games
  ON games.rom_filename = native_rights.rom_filename
JOIN public.game_builds
  ON game_builds.game_id = games.id
 AND game_builds.launch_manifest_id = native_rights.launch_manifest_id
ON CONFLICT (
  game_id,
  (COALESCE(game_build_id, '00000000-0000-0000-0000-000000000000'::uuid))
) DO UPDATE SET
  code_license_spdx = EXCLUDED.code_license_spdx,
  asset_license_spdx = EXCLUDED.asset_license_spdx,
  license_url = EXCLUDED.license_url,
  source_url = EXCLUDED.source_url,
  original_release_url = EXCLUDED.original_release_url,
  attribution_text = EXCLUDED.attribution_text,
  commercial_use_allowed = EXCLUDED.commercial_use_allowed,
  modification_allowed = EXCLUDED.modification_allowed,
  verified_at = EXCLUDED.verified_at,
  review_notes = EXCLUDED.review_notes,
  updated_at = now();
