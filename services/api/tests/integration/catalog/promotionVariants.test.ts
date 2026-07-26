import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ID,
  createDataBoundaryApp,
  FakeSupabase,
  seedProfiles,
  sha256,
  validGameGearRom,
  validGenesisRom,
  validNesRom,
} from "../support/dataBoundarySupport.js";

test("admin promotion rejects candidates without explicit hosting permission", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const artifactBytes = validNesRom();
  db.rows.catalog_ingestion_candidates.push({
    artifact_filename: "missing-rights.nes",
    artifact_sha256: sha256(artifactBytes),
    artifact_size: artifactBytes.length,
    artifact_url: "https://raw.githubusercontent.com/example/curated-roms/missing-rights.nes",
    asset_license_spdx: "MIT",
    attribution_text: "Missing Rights attribution",
    code_license_spdx: "MIT",
    cover_license_spdx: null,
    developer_name: "Example Dev",
    developer_url: "https://example.test/dev",
    id: "30303030-3030-4030-8030-303030303030",
    import_status: "needs_review",
    license_url: "https://example.test/license",
    noncommercial_hosting_allowed: null,
    original_release_url: "https://example.test/missing-rights",
    permission_evidence_url: "https://example.test/license",
    platform_id: "nes",
    review_notes: null,
    runtime_id: "mesen",
    runtime_kind: "libretro",
    source_kind: "curated_licensed_rom",
    source_commit: "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    source_entry_path: "curated/nes.json#missing-rights",
    source_repo_url: "https://github.com/example/curated-roms",
    title: "Missing Rights Demo",
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID, artifactBytes);

  const response = await app.inject({
    method: "PATCH",
    payload: { action: "promote", notes: "should fail" },
    url: "/admin/catalog-candidates/30303030-3030-4030-8030-303030303030",
  });

  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.json(), {
    error: "Candidate rights must explicitly allow non-commercial hosting.",
  });
  assert.equal(db.rows.games.length, 0);
  assert.equal(db.rows.game_builds.length, 0);
  assert.equal(db.rows.game_rights.length, 0);
  assert.equal(db.uploadedStorageObjects.length, 0);
  assert.equal(
    db.rows.catalog_ingestion_candidates[0]?.import_status,
    "needs_review",
  );
  await app.close();
});

test("admin can promote a curated Game Gear candidate into a PicoDrive build", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const artifactBytes = validGameGearRom();
  db.rows.catalog_ingestion_candidates.push({
    artifact_filename: "gear.gg",
    artifact_sha256: sha256(artifactBytes),
    artifact_size: artifactBytes.length,
    artifact_url: "https://raw.githubusercontent.com/example/curated-roms/gear.gg",
    asset_license_spdx: "MIT",
    attribution_text: "Gear attribution",
    code_license_spdx: "MIT",
    cover_license_spdx: null,
    developer_name: "Example Dev",
    developer_url: "https://example.test/dev",
    id: "10101010-1010-4010-8010-101010101010",
    import_status: "needs_review",
    license_url: "https://example.test/license",
    noncommercial_hosting_allowed: true,
    original_release_url: "https://example.test/gear",
    permission_evidence_url: "https://example.test/license",
    platform_id: "game_gear",
    review_notes: null,
    runtime_id: "picodrive",
    runtime_kind: "libretro",
    source_kind: "curated_licensed_rom",
    source_commit: "dddddddddddddddddddddddddddddddddddddddd",
    source_entry_path: "curated/sega.json#gear.gg",
    source_repo_url: "https://github.com/example/curated-roms",
    title: "Gear Demo",
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID, artifactBytes);

  const response = await app.inject({
    method: "PATCH",
    payload: { action: "promote", notes: "picodrive reviewed" },
    url: "/admin/catalog-candidates/10101010-1010-4010-8010-101010101010",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(db.rows.games.length, 1);
  assert.equal(db.rows.games[0]?.rom_filename, "gear.gg");
  assert.equal(db.rows.game_builds.length, 1);
  assert.equal(db.rows.game_builds[0]?.runtime_id, "picodrive");
  assert.equal(db.rows.game_builds[0]?.platform_id, "game_gear");
  assert.equal(db.rows.game_builds[0]?.artifact_filename, "gear.gg");
  assert.match(
    db.uploadedStorageObjects[0]?.path || "",
    /^curated-roms\/dddddddddddddddddddddddddddddddddddddddd\/game_gear\//,
  );
  assert.match(
    db.uploadedStorageObjects[1]?.path || "",
    /^covers\/dddddddddddddddddddddddddddddddddddddddd\/game_gear\//,
  );
  assert.equal(
    db.rows.game_rights[0]?.source_url,
    "https://github.com/example/curated-roms/blob/dddddddddddddddddddddddddddddddddddddddd/curated/sega.json#gear.gg",
  );
  assert.equal(
    db.rows.catalog_ingestion_candidates[0]?.import_status,
    "promoted",
  );
  await app.close();
});

test("admin promotion rejects unallowlisted candidate runtime/platform pairs", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const artifactBytes = validGenesisRom();
  db.rows.catalog_ingestion_candidates.push({
    artifact_filename: "drive.md",
    artifact_sha256: sha256(artifactBytes),
    artifact_size: artifactBytes.length,
    artifact_url: "https://raw.githubusercontent.com/example/curated-roms/drive.md",
    asset_license_spdx: "MIT",
    attribution_text: "Mismatch attribution",
    code_license_spdx: "MIT",
    cover_license_spdx: null,
    developer_name: "Example Dev",
    developer_url: null,
    id: "11111111-1111-4111-8111-111111111111",
    import_status: "needs_review",
    license_url: "https://example.test/license",
    noncommercial_hosting_allowed: true,
    original_release_url: null,
    permission_evidence_url: "https://example.test/license",
    platform_id: "genesis",
    review_notes: null,
    runtime_id: "bsnes",
    runtime_kind: "libretro",
    source_kind: "curated_licensed_rom",
    source_commit: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    source_entry_path: "curated/sega.json#drive.md",
    source_repo_url: "https://github.com/example/curated-roms",
    title: "Mismatch Demo",
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID, artifactBytes);

  const response = await app.inject({
    method: "PATCH",
    payload: { action: "promote", notes: "should fail" },
    url: "/admin/catalog-candidates/11111111-1111-4111-8111-111111111111",
  });

  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.json(), {
    error: "Candidate libretro runtime/platform is not allowlisted.",
  });
  assert.equal(db.rows.games.length, 0);
  assert.equal(db.rows.game_builds.length, 0);
  assert.equal(db.rows.game_rights.length, 0);
  assert.equal(db.uploadedStorageObjects.length, 0);
  assert.equal(
    db.rows.catalog_ingestion_candidates[0]?.import_status,
    "needs_review",
  );
  await app.close();
});

test("admin promotion rejects candidates with invalid cartridge headers", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const artifactBytes = Buffer.alloc(0x200);
  db.rows.catalog_ingestion_candidates.push({
    artifact_filename: "drive.md",
    artifact_sha256: sha256(artifactBytes),
    artifact_size: artifactBytes.length,
    artifact_url: "https://raw.githubusercontent.com/example/curated-roms/drive.md",
    asset_license_spdx: "MIT",
    attribution_text: "Invalid header attribution",
    code_license_spdx: "MIT",
    cover_license_spdx: null,
    developer_name: "Example Dev",
    developer_url: null,
    id: "12121212-1212-4121-8121-121212121212",
    import_status: "needs_review",
    license_url: "https://example.test/license",
    noncommercial_hosting_allowed: true,
    original_release_url: null,
    permission_evidence_url: "https://example.test/license",
    platform_id: "genesis",
    review_notes: null,
    runtime_id: "picodrive",
    runtime_kind: "libretro",
    source_kind: "curated_licensed_rom",
    source_commit: "ffffffffffffffffffffffffffffffffffffffff",
    source_entry_path: "curated/sega.json#drive.md",
    source_repo_url: "https://github.com/example/curated-roms",
    title: "Invalid Header Demo",
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID, artifactBytes);

  const response = await app.inject({
    method: "PATCH",
    payload: { action: "promote", notes: "should fail" },
    url: "/admin/catalog-candidates/12121212-1212-4121-8121-121212121212",
  });

  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.json(), {
    error: "Invalid Genesis/Mega Drive cartridge header.",
  });
  assert.equal(db.rows.games.length, 0);
  assert.equal(db.rows.game_builds.length, 0);
  assert.equal(db.rows.game_rights.length, 0);
  assert.equal(db.uploadedStorageObjects.length, 0);
  assert.equal(
    db.rows.catalog_ingestion_candidates[0]?.import_status,
    "needs_review",
  );
  await app.close();
});

test("admin can promote a Debian native candidate without mirroring a ROM artifact", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.rows.catalog_ingestion_candidates.push({
    artifact_filename: null,
    artifact_sha256: null,
    artifact_size: null,
    artifact_url: null,
    asset_license_spdx: "Debian-main",
    attribution_text:
      "Frozen-Bubble from Debian trixie main/games package frozen-bubble 2.212-13+b1.",
    code_license_spdx: "Debian-main",
    cover_license_spdx: null,
    developer_name: "Debian Games Team",
    developer_url: "https://tracker.debian.org/pkg/frozen-bubble",
    id: "12121212-1212-4121-8121-121212121212",
    import_status: "needs_review",
    launch_manifest_id: "frozen-bubble",
    license_url:
      "https://metadata.ftp-master.debian.org/changelogs/main/f/frozen-bubble/frozen-bubble_2.212-13_copyright",
    noncommercial_hosting_allowed: true,
    original_release_url: "https://packages.debian.org/trixie/frozen-bubble",
    package_component: "main",
    package_name: "frozen-bubble",
    package_version: "2.212-13+b1",
    permission_evidence_url:
      "https://metadata.ftp-master.debian.org/changelogs/main/f/frozen-bubble/frozen-bubble_2.212-13_copyright",
    platform_id: "linux",
    review_notes: null,
    runtime_id: "debian-native-v1",
    runtime_kind: "native_linux",
    source_kind: "debian_main_games",
    source_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_entry_path: "trixie/main/games/frozen-bubble/2.212-13+b1",
    source_repo_url: "https://tracker.debian.org/pkg/frozen-bubble",
    title: "Frozen-Bubble",
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID);

  const response = await app.inject({
    method: "PATCH",
    payload: { action: "promote", notes: "native reviewed" },
    url: "/admin/catalog-candidates/12121212-1212-4121-8121-121212121212",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(db.rows.games.length, 1);
  assert.equal(db.rows.games[0]?.rom_filename, "frozen-bubble-native");
  assert.equal(db.rows.games[0]?.rom_url, null);
  assert.equal(db.rows.game_builds.length, 1);
  assert.equal(db.rows.game_builds[0]?.artifact_url, null);
  assert.equal(db.rows.game_builds[0]?.launch_manifest_id, "frozen-bubble");
  assert.equal(db.rows.game_builds[0]?.runtime_kind, "native_linux");
  assert.equal(db.uploadedStorageObjects.length, 1);
  assert.match(
    db.uploadedStorageObjects[0]?.path || "",
    /^covers\/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\/linux\/frozen-bubble\.svg$/,
  );
  assert.equal(db.rows.game_rights[0]?.source_url, "https://tracker.debian.org/pkg/frozen-bubble");
  assert.equal(db.rows.catalog_ingestion_candidates[0]?.import_status, "promoted");
  await app.close();
});
