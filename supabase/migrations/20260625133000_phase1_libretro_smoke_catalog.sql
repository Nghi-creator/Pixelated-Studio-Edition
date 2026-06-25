-- Phase 1: publish a small reviewed libretro smoke catalog covering NES, GB,
-- GBC, and GBA. Artifacts are pinned to immutable upstream commits and exact
-- checksums so cloud sessions cannot choose arbitrary cores or files.

INSERT INTO public.games (
  id,
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
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'Nova the Squirrel',
    'nova.nes',
    'https://raw.githubusercontent.com/nesdev-org/homebrew-db/95ba342830260e3b7587b5ed230b65f72ec11c2b/entries/novathesquirrel/nova.nes',
    NULL,
    NULL,
    'NovaSquirrel',
    'NovaSquirrel',
    'https://github.com/nesdev-org/homebrew-db/blob/95ba342830260e3b7587b5ed230b65f72ec11c2b/entries/novathesquirrel/game.json',
    'published'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Rex Runner GB',
    'rex-runner.gb',
    'https://raw.githubusercontent.com/gbdev/database/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rex-runner-gb/rex-runner.gb',
    NULL,
    NULL,
    'Homebrew Hub contributor',
    'Homebrew Hub contributor',
    'https://github.com/gbdev/database/blob/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rex-runner-gb/game.json',
    'published'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'Rebound',
    'Rebound.gbc',
    'https://raw.githubusercontent.com/gbdev/database/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rebound/Rebound.gbc',
    NULL,
    NULL,
    'deved',
    'deved',
    'https://deved.itch.io/rebound',
    'published'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'xniq',
    'xniq-alpha.gba',
    'https://raw.githubusercontent.com/gbadev-org/games/9111a814b212318db107a91adb0947b63d1e19a7/entries/xniq/xniq-alpha.gba',
    NULL,
    NULL,
    'exelotl',
    'exelotl',
    'https://exelotl.itch.io/xniq',
    'published'
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  rom_filename = EXCLUDED.rom_filename,
  rom_url = EXCLUDED.rom_url,
  cover_url = EXCLUDED.cover_url,
  backdrop_url = EXCLUDED.backdrop_url,
  author_name = EXCLUDED.author_name,
  developer_name = EXCLUDED.developer_name,
  developer_url = EXCLUDED.developer_url,
  publication_status = EXCLUDED.publication_status;

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
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'libretro',
    'mesen',
    'nes',
    'https://raw.githubusercontent.com/nesdev-org/homebrew-db/95ba342830260e3b7587b5ed230b65f72ec11c2b/entries/novathesquirrel/nova.nes',
    'nova.nes',
    262160,
    'e4780e90b9d1587489bfb797d2ca395be21371ea9262fa9f87f99324ec6960ab',
    true
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'libretro',
    'mgba',
    'gb',
    'https://raw.githubusercontent.com/gbdev/database/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rex-runner-gb/rex-runner.gb',
    'rex-runner.gb',
    32768,
    '91bd12159d30e86cf4eb0312f28ff1c394e701085d6a8ca641ed92b2bcc8429c',
    true
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'libretro',
    'mgba',
    'gbc',
    'https://raw.githubusercontent.com/gbdev/database/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rebound/Rebound.gbc',
    'Rebound.gbc',
    131072,
    '195765b8ca3b0fb7d37b7b92d0242d6c7e01ec71f27f93e565fa081e449cbb92',
    true
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'libretro',
    'mgba',
    'gba',
    'https://raw.githubusercontent.com/gbadev-org/games/9111a814b212318db107a91adb0947b63d1e19a7/entries/xniq/xniq-alpha.gba',
    'xniq-alpha.gba',
    1436448,
    '49da35070ebfc3760a07354a0f90a68c16bd0590046cc99d8a7dfcd947563cc1',
    true
  )
ON CONFLICT (game_id, runtime_id, platform_id) DO UPDATE SET
  runtime_kind = EXCLUDED.runtime_kind,
  artifact_url = EXCLUDED.artifact_url,
  artifact_filename = EXCLUDED.artifact_filename,
  artifact_size = EXCLUDED.artifact_size,
  artifact_sha256 = EXCLUDED.artifact_sha256,
  enabled = EXCLUDED.enabled,
  updated_at = now();

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
  reviewed_values.game_id,
  game_builds.id,
  reviewed_values.license,
  reviewed_values.license,
  reviewed_values.license_url,
  reviewed_values.source_url,
  reviewed_values.original_release_url,
  reviewed_values.attribution_text,
  true,
  true,
  '2026-06-25 00:00:00+00'::timestamptz,
  reviewed_values.review_notes
FROM (
  VALUES
    (
      '11111111-1111-4111-8111-111111111111'::uuid,
      'GPL-3.0-or-later',
      'https://www.gnu.org/licenses/gpl-3.0.html',
      'https://github.com/nesdev-org/homebrew-db/blob/95ba342830260e3b7587b5ed230b65f72ec11c2b/entries/novathesquirrel/game.json',
      NULL,
      'Nova the Squirrel by NovaSquirrel. License: GPL-3.0-or-later. Source evidence: Homebrew Hub NES entry pinned at commit 95ba342830260e3b7587b5ed230b65f72ec11c2b.',
      'Homebrew Hub NES metadata marks the playable ROM with gameLicense GPL-3.0-or-later.'
    ),
    (
      '22222222-2222-4222-8222-222222222222'::uuid,
      'MIT',
      'https://opensource.org/license/mit',
      'https://github.com/gbdev/database/blob/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rex-runner-gb/game.json',
      NULL,
      'Rex Runner GB. License: MIT. Source evidence: Homebrew Hub GB entry pinned at commit 8a36461e5e2fada5c73484afd87b7e9a9d4e05df.',
      'Homebrew Hub GB metadata marks the playable ROM with license MIT.'
    ),
    (
      '33333333-3333-4333-8333-333333333333'::uuid,
      'MIT',
      'https://opensource.org/license/mit',
      'https://github.com/gbdev/database/blob/8a36461e5e2fada5c73484afd87b7e9a9d4e05df/entries/rebound/game.json',
      'https://deved.itch.io/rebound',
      'Rebound by deved. License: MIT. Source evidence: Homebrew Hub GBC entry pinned at commit 8a36461e5e2fada5c73484afd87b7e9a9d4e05df.',
      'Homebrew Hub GBC metadata marks the playable ROM with license MIT.'
    ),
    (
      '44444444-4444-4444-8444-444444444444'::uuid,
      'MIT',
      'https://opensource.org/license/mit',
      'https://github.com/gbadev-org/games/blob/9111a814b212318db107a91adb0947b63d1e19a7/entries/xniq/game.json',
      'https://exelotl.itch.io/xniq',
      'xniq by exelotl. License: MIT. Source evidence: Homebrew Hub GBA entry pinned at commit 9111a814b212318db107a91adb0947b63d1e19a7.',
      'Homebrew Hub GBA metadata marks the playable ROM with gameLicense MIT.'
    )
) AS reviewed_values(
  game_id,
  license,
  license_url,
  source_url,
  original_release_url,
  attribution_text,
  review_notes
)
JOIN public.game_builds
  ON game_builds.game_id = reviewed_values.game_id
 AND game_builds.runtime_kind = 'libretro'
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
