-- Phase 1: publish a small reviewed libretro smoke catalog covering NES, GB,
-- GBC, and GBA. Artifacts are pinned to immutable upstream commits and exact
-- checksums so cloud sessions cannot choose arbitrary cores or files.
--
-- Important: this migration is intentionally non-destructive. If a game with
-- the same rom_filename already exists, keep that row/id and attach the
-- reviewed build + rights record to it instead of deleting/replacing it.

WITH reviewed_games AS (
  SELECT *
  FROM (
    VALUES
      (
        'Nova the Squirrel',
        'nova.nes',
        'https://raw.githubusercontent.com/nesdev-org/homebrew-db/95ba342830260e3b7587b5ed230b65f72ec11c2b/entries/novathesquirrel/nova.nes',
        'NovaSquirrel',
        'NovaSquirrel',
        'https://github.com/nesdev-org/homebrew-db/blob/95ba342830260e3b7587b5ed230b65f72ec11c2b/entries/novathesquirrel/game.json'
      ),
      (
        'Rex Runner GB',
        'rex-runner.gb',
        'https://raw.githubusercontent.com/gbdev/database/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rex-runner-gb/rex-runner.gb',
        'Homebrew Hub contributor',
        'Homebrew Hub contributor',
        'https://github.com/gbdev/database/blob/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rex-runner-gb/game.json'
      ),
      (
        'Rebound',
        'Rebound.gbc',
        'https://raw.githubusercontent.com/gbdev/database/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rebound/Rebound.gbc',
        'deved',
        'deved',
        'https://deved.itch.io/rebound'
      ),
      (
        'xniq',
        'xniq-alpha.gba',
        'https://raw.githubusercontent.com/gbadev-org/games/9111a814b212318db107a91adb0947b63d1e19a7/entries/xniq/xniq-alpha.gba',
        'exelotl',
        'exelotl',
        'https://exelotl.itch.io/xniq'
      )
  ) AS rows(
    title,
    rom_filename,
    rom_url,
    author_name,
    developer_name,
    developer_url
  )
)
UPDATE public.games
SET
  title = reviewed_games.title,
  rom_url = reviewed_games.rom_url,
  author_name = reviewed_games.author_name,
  developer_name = reviewed_games.developer_name,
  developer_url = reviewed_games.developer_url,
  publication_status = 'published'
FROM reviewed_games
WHERE games.rom_filename = reviewed_games.rom_filename;

WITH reviewed_games AS (
  SELECT *
  FROM (
    VALUES
      (
        'Nova the Squirrel',
        'nova.nes',
        'https://raw.githubusercontent.com/nesdev-org/homebrew-db/95ba342830260e3b7587b5ed230b65f72ec11c2b/entries/novathesquirrel/nova.nes',
        'NovaSquirrel',
        'NovaSquirrel',
        'https://github.com/nesdev-org/homebrew-db/blob/95ba342830260e3b7587b5ed230b65f72ec11c2b/entries/novathesquirrel/game.json'
      ),
      (
        'Rex Runner GB',
        'rex-runner.gb',
        'https://raw.githubusercontent.com/gbdev/database/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rex-runner-gb/rex-runner.gb',
        'Homebrew Hub contributor',
        'Homebrew Hub contributor',
        'https://github.com/gbdev/database/blob/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rex-runner-gb/game.json'
      ),
      (
        'Rebound',
        'Rebound.gbc',
        'https://raw.githubusercontent.com/gbdev/database/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rebound/Rebound.gbc',
        'deved',
        'deved',
        'https://deved.itch.io/rebound'
      ),
      (
        'xniq',
        'xniq-alpha.gba',
        'https://raw.githubusercontent.com/gbadev-org/games/9111a814b212318db107a91adb0947b63d1e19a7/entries/xniq/xniq-alpha.gba',
        'exelotl',
        'exelotl',
        'https://exelotl.itch.io/xniq'
      )
  ) AS rows(
    title,
    rom_filename,
    rom_url,
    author_name,
    developer_name,
    developer_url
  )
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
  reviewed_games.title,
  reviewed_games.rom_filename,
  reviewed_games.rom_url,
  NULL,
  NULL,
  reviewed_games.author_name,
  reviewed_games.developer_name,
  reviewed_games.developer_url,
  'published'
FROM reviewed_games
WHERE NOT EXISTS (
  SELECT 1
  FROM public.games
  WHERE games.rom_filename = reviewed_games.rom_filename
);

WITH reviewed_builds AS (
  SELECT *
  FROM (
    VALUES
      (
        'nova.nes',
        'libretro',
        'mesen',
        'nes',
        'https://raw.githubusercontent.com/nesdev-org/homebrew-db/95ba342830260e3b7587b5ed230b65f72ec11c2b/entries/novathesquirrel/nova.nes',
        'nova.nes',
        262160::bigint,
        'e4780e90b9d1587489bfb797d2ca395be21371ea9262fa9f87f99324ec6960ab'
      ),
      (
        'rex-runner.gb',
        'libretro',
        'mgba',
        'gb',
        'https://raw.githubusercontent.com/gbdev/database/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rex-runner-gb/rex-runner.gb',
        'rex-runner.gb',
        32768::bigint,
        '91bd12159d30e86cf4eb0312f28ff1c394e701085d6a8ca641ed92b2bcc8429c'
      ),
      (
        'Rebound.gbc',
        'libretro',
        'mgba',
        'gbc',
        'https://raw.githubusercontent.com/gbdev/database/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rebound/Rebound.gbc',
        'Rebound.gbc',
        131072::bigint,
        '195765b8ca3b0fb7d37b7b92d0242d6c7e01ec71f27f93e565fa081e449cbb92'
      ),
      (
        'xniq-alpha.gba',
        'libretro',
        'mgba',
        'gba',
        'https://raw.githubusercontent.com/gbadev-org/games/9111a814b212318db107a91adb0947b63d1e19a7/entries/xniq/xniq-alpha.gba',
        'xniq-alpha.gba',
        1436448::bigint,
        '49da35070ebfc3760a07354a0f90a68c16bd0590046cc99d8a7dfcd947563cc1'
      )
  ) AS rows(
    rom_filename,
    runtime_kind,
    runtime_id,
    platform_id,
    artifact_url,
    artifact_filename,
    artifact_size,
    artifact_sha256
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
  enabled
)
SELECT
  games.id,
  reviewed_builds.runtime_kind,
  reviewed_builds.runtime_id,
  reviewed_builds.platform_id,
  reviewed_builds.artifact_url,
  reviewed_builds.artifact_filename,
  reviewed_builds.artifact_size,
  reviewed_builds.artifact_sha256,
  true
FROM reviewed_builds
JOIN public.games
  ON games.rom_filename = reviewed_builds.rom_filename
ON CONFLICT (game_id, runtime_id, platform_id) DO UPDATE SET
  runtime_kind = EXCLUDED.runtime_kind,
  artifact_url = EXCLUDED.artifact_url,
  artifact_filename = EXCLUDED.artifact_filename,
  artifact_size = EXCLUDED.artifact_size,
  artifact_sha256 = EXCLUDED.artifact_sha256,
  enabled = EXCLUDED.enabled,
  updated_at = now();

WITH reviewed_rights AS (
  SELECT *
  FROM (
    VALUES
      (
        'nova.nes',
        'mesen',
        'nes',
        'GPL-3.0-or-later',
        'https://www.gnu.org/licenses/gpl-3.0.html',
        'https://github.com/nesdev-org/homebrew-db/blob/95ba342830260e3b7587b5ed230b65f72ec11c2b/entries/novathesquirrel/game.json',
        NULL,
        'Nova the Squirrel by NovaSquirrel. License: GPL-3.0-or-later. Source evidence: Homebrew Hub NES entry pinned at commit 95ba342830260e3b7587b5ed230b65f72ec11c2b.',
        'Homebrew Hub NES metadata marks the playable ROM with gameLicense GPL-3.0-or-later.'
      ),
      (
        'rex-runner.gb',
        'mgba',
        'gb',
        'MIT',
        'https://opensource.org/license/mit',
        'https://github.com/gbdev/database/blob/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rex-runner-gb/game.json',
        NULL,
        'Rex Runner GB. License: MIT. Source evidence: Homebrew Hub GB entry pinned at commit 8a36461e5e2fada5c73484afd87b7e9a9d4e05df.',
        'Homebrew Hub GB metadata marks the playable ROM with license MIT.'
      ),
      (
        'Rebound.gbc',
        'mgba',
        'gbc',
        'MIT',
        'https://opensource.org/license/mit',
        'https://github.com/gbdev/database/blob/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rebound/game.json',
        'https://deved.itch.io/rebound',
        'Rebound by deved. License: MIT. Source evidence: Homebrew Hub GBC entry pinned at commit 8a36461e5e2fada5c73484afd87b7e9a9d4e05df.',
        'Homebrew Hub GBC metadata marks the playable ROM with license MIT.'
      ),
      (
        'xniq-alpha.gba',
        'mgba',
        'gba',
        'MIT',
        'https://opensource.org/license/mit',
        'https://github.com/gbadev-org/games/blob/9111a814b212318db107a91adb0947b63d1e19a7/entries/xniq/game.json',
        'https://exelotl.itch.io/xniq',
        'xniq by exelotl. License: MIT. Source evidence: Homebrew Hub GBA entry pinned at commit 9111a814b212318db107a91adb0947b63d1e19a7.',
        'Homebrew Hub GBA metadata marks the playable ROM with gameLicense MIT.'
      )
  ) AS rows(
    rom_filename,
    runtime_id,
    platform_id,
    license,
    license_url,
    source_url,
    original_release_url,
    attribution_text,
    review_notes
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
  reviewed_rights.license,
  reviewed_rights.license,
  reviewed_rights.license_url,
  reviewed_rights.source_url,
  reviewed_rights.original_release_url,
  reviewed_rights.attribution_text,
  true,
  true,
  '2026-06-25 00:00:00+00'::timestamptz,
  reviewed_rights.review_notes
FROM reviewed_rights
JOIN public.games
  ON games.rom_filename = reviewed_rights.rom_filename
JOIN public.game_builds
  ON game_builds.game_id = games.id
 AND game_builds.runtime_id = reviewed_rights.runtime_id
 AND game_builds.platform_id = reviewed_rights.platform_id
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
