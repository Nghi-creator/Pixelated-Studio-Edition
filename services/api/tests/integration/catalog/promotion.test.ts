import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ID,
  createDataBoundaryApp,
  FakeSupabase,
  GAME_ID,
  seedProfiles,
  sha256,
  validNesRom,
  validSnesRom,
} from "../support/dataBoundarySupport.js";

test("browser-eligible candidates cannot be promoted before a passing smoke test", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const artifactBytes = validNesRom();
  const candidateId = "79797979-7979-4979-8979-797979797979";
  db.rows.catalog_ingestion_candidates.push({
    artifact_filename: "untested.nes",
    artifact_sha256: sha256(artifactBytes),
    artifact_size: artifactBytes.length,
    artifact_url: "https://raw.githubusercontent.com/example/repo/untested.nes",
    asset_license_spdx: "MIT",
    attribution_text: "Untested attribution",
    browser_smoke_core_id: null,
    browser_smoke_status: "not_tested",
    code_license_spdx: "MIT",
    cover_license_spdx: null,
    developer_name: "Untested Dev",
    developer_url: null,
    id: candidateId,
    import_status: "needs_review",
    license_url: "https://example.test/license",
    noncommercial_hosting_allowed: true,
    original_release_url: null,
    permission_evidence_url: "https://example.test/license",
    platform_id: "nes",
    review_notes: null,
    runtime_id: "mesen",
    runtime_kind: "libretro",
    source_commit: "acacacacacacacacacacacacacacacacacacacac",
    source_entry_path: "entries/untested/game.json",
    source_kind: "homebrew_hub_nes",
    source_repo_url: "https://github.com/example/repo",
    title: "Untested Demo",
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID, artifactBytes);

  const response = await app.inject({
    method: "PATCH",
    payload: { action: "promote" },
    url: `/admin/catalog-candidates/${candidateId}`,
  });

  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.json(), {
    error: "Run and pass the User Edition browser smoke test before promoting this candidate.",
  });
  assert.equal(db.rows.games.length, 0);
  await app.close();
});

test("admin can promote a catalog ingestion candidate without deleting existing games", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const artifactBytes = validNesRom();
  db.rows.games.push({
    id: GAME_ID,
    publication_status: "draft",
    rom_filename: "nova.nes",
    title: "Old Nova Row",
  });
  db.rows.catalog_ingestion_candidates.push({
    artifact_filename: "nova.nes",
    artifact_sha256: sha256(artifactBytes),
    artifact_size: artifactBytes.length,
    artifact_url: "https://raw.githubusercontent.com/example/repo/nova.nes",
    asset_license_spdx: "GPL-3.0-or-later",
    attribution_text: "Nova attribution",
    browser_smoke_core_id: "fceumm",
    browser_smoke_status: "passed",
    code_license_spdx: "GPL-3.0-or-later",
    cover_license_spdx: null,
    developer_name: "NovaSquirrel",
    developer_url: "https://example.test/nova",
    id: "88888888-8888-4888-8888-888888888888",
    import_status: "needs_review",
    license_url: "https://www.gnu.org/licenses/gpl-3.0.html",
    noncommercial_hosting_allowed: true,
    original_release_url: null,
    permission_evidence_url: "https://www.gnu.org/licenses/gpl-3.0.html",
    platform_id: "nes",
    review_notes: null,
    runtime_id: "mesen",
    runtime_kind: "libretro",
    source_kind: "homebrew_hub_nes",
    source_commit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    source_entry_path: "entries/novathesquirrel/game.json",
    source_repo_url: "https://github.com/nesdev-org/homebrew-db",
    title: "Nova the Squirrel",
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID, artifactBytes);

  const response = await app.inject({
    method: "PATCH",
    payload: { action: "promote", notes: "reviewed" },
    url: "/admin/catalog-candidates/88888888-8888-4888-8888-888888888888",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(db.rows.games.length, 1);
  assert.equal(db.rows.games[0]?.id, GAME_ID);
  assert.equal(db.rows.games[0]?.publication_status, "published");
  assert.equal(db.rows.games[0]?.genre_slug, "other");
  assert.equal(db.rows.games[0]?.title, "Nova the Squirrel");
  assert.equal(db.rows.game_builds.length, 1);
  assert.equal(db.rows.game_builds[0]?.game_id, GAME_ID);
  assert.equal(db.rows.game_builds[0]?.runtime_id, "mesen");
  assert.match(
    String(db.rows.game_builds[0]?.artifact_url),
    /^https:\/\/storage\.example\.test\/catalog_roms\/homebrew-hub\//,
  );
  assert.equal(db.uploadedStorageObjects.length, 2);
  assert.equal(db.uploadedStorageObjects[0]?.bucket, "catalog_roms");
  assert.equal(db.uploadedStorageObjects[0]?.bytes, artifactBytes.length);
  assert.equal(db.uploadedStorageObjects[1]?.bucket, "catalog_artifacts");
  assert.match(
    db.uploadedStorageObjects[1]?.path || "",
    /^covers\/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\/nes\//,
  );
  assert.match(
    String(db.rows.games[0]?.cover_url),
    /^https:\/\/storage\.example\.test\/catalog_artifacts\/covers\//,
  );
  assert.equal(db.rows.games[0]?.backdrop_url, db.rows.games[0]?.cover_url);
  assert.equal(db.rows.game_rights.length, 1);
  assert.equal(db.rows.game_rights[0]?.game_id, GAME_ID);
  assert.equal(db.rows.game_rights[0]?.cover_license_spdx, "CC0-1.0");
  assert.equal(db.rows.game_rights[0]?.noncommercial_hosting_allowed, true);
  assert.equal(
    db.rows.game_rights[0]?.permission_evidence_url,
    "https://www.gnu.org/licenses/gpl-3.0.html",
  );
  assert.equal(
    db.rows.game_rights[0]?.source_url,
    "https://github.com/nesdev-org/homebrew-db/blob/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/entries/novathesquirrel/game.json",
  );
  assert.equal(
    db.rows.catalog_ingestion_candidates[0]?.import_status,
    "promoted",
  );
  assert.equal(db.rows.catalog_ingestion_candidates[0]?.promoted_game_id, GAME_ID);
  await app.close();
});

test("admin can promote a curated SNES candidate into a bsnes build", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const artifactBytes = validSnesRom();
  db.rows.catalog_ingestion_candidates.push({
    artifact_filename: "demo.sfc",
    artifact_sha256: sha256(artifactBytes),
    artifact_size: artifactBytes.length,
    artifact_url: "https://raw.githubusercontent.com/example/curated-roms/demo.sfc",
    asset_license_spdx: "GPL-3.0-or-later",
    attribution_text: "Demo SNES attribution",
    code_license_spdx: "GPL-3.0-or-later",
    cover_license_spdx: null,
    developer_name: "Example Dev",
    developer_url: "https://example.test/dev",
    id: "99999999-9999-4999-8999-999999999999",
    import_status: "needs_review",
    license_url: "https://example.test/license",
    noncommercial_hosting_allowed: true,
    original_release_url: "https://example.test/demo-snes",
    permission_evidence_url: "https://example.test/license",
    platform_id: "snes",
    review_notes: null,
    runtime_id: "bsnes",
    runtime_kind: "libretro",
    source_kind: "curated_licensed_rom",
    source_commit: "cccccccccccccccccccccccccccccccccccccccc",
    source_entry_path: "curated/snes.json#demo.sfc",
    source_repo_url: "https://github.com/example/curated-roms",
    title: "Demo SNES",
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID, artifactBytes);

  const response = await app.inject({
    method: "PATCH",
    payload: { action: "promote", notes: "curated reviewed" },
    url: "/admin/catalog-candidates/99999999-9999-4999-8999-999999999999",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(db.rows.games.length, 1);
  assert.equal(db.rows.games[0]?.rom_filename, "demo.sfc");
  assert.match(
    String(db.rows.games[0]?.rom_url),
    /^https:\/\/storage\.example\.test\/catalog_roms\/curated-roms\//,
  );
  assert.equal(db.rows.game_builds.length, 1);
  assert.equal(db.rows.game_builds[0]?.runtime_id, "bsnes");
  assert.equal(db.rows.game_builds[0]?.platform_id, "snes");
  assert.equal(db.rows.game_builds[0]?.artifact_filename, "demo.sfc");
  assert.match(
    String(db.rows.game_builds[0]?.artifact_url),
    /^https:\/\/storage\.example\.test\/catalog_roms\/curated-roms\//,
  );
  assert.equal(db.uploadedStorageObjects.length, 2);
  assert.match(
    db.uploadedStorageObjects[0]?.path || "",
    /^curated-roms\/cccccccccccccccccccccccccccccccccccccccc\/snes\//,
  );
  assert.match(
    db.uploadedStorageObjects[1]?.path || "",
    /^covers\/cccccccccccccccccccccccccccccccccccccccc\/snes\//,
  );
  assert.equal(
    db.rows.game_rights[0]?.source_url,
    "https://github.com/example/curated-roms/blob/cccccccccccccccccccccccccccccccccccccccc/curated/snes.json#demo.sfc",
  );
  assert.equal(
    db.rows.catalog_ingestion_candidates[0]?.import_status,
    "promoted",
  );
  await app.close();
});

test("admin promotion replaces generated fallback with captured gameplay artwork when available", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const artifactBytes = validNesRom();
  db.rows.catalog_ingestion_candidates.push({
    artifact_filename: "capture-demo.nes",
    artifact_sha256: sha256(artifactBytes),
    artifact_size: artifactBytes.length,
    artifact_url: "https://raw.githubusercontent.com/example/curated-roms/capture-demo.nes",
    asset_license_spdx: "MIT",
    attribution_text: "Capture Demo attribution",
    browser_smoke_core_id: "fceumm",
    browser_smoke_status: "passed",
    code_license_spdx: "MIT",
    cover_license_spdx: null,
    developer_name: "Capture Dev",
    developer_url: "https://example.test/dev",
    id: "20202020-2020-4020-8020-202020202020",
    import_status: "needs_review",
    license_url: "https://example.test/license",
    noncommercial_hosting_allowed: true,
    original_release_url: "https://example.test/capture-demo",
    permission_evidence_url: "https://example.test/license",
    platform_id: "nes",
    review_notes: null,
    runtime_id: "mesen",
    runtime_kind: "libretro",
    source_kind: "curated_licensed_rom",
    source_commit: "abababababababababababababababababababab",
    source_entry_path: "curated/nes.json#capture-demo",
    source_repo_url: "https://github.com/example/curated-roms",
    title: "Capture Demo",
  });
  const capturePng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x63, 0x61, 0x70, 0x74, 0x75, 0x72, 0x65, 0x64,
  ]);
  const app = await createDataBoundaryApp(db, ADMIN_ID, artifactBytes, {
    captureGameplayArtwork: async ({ artifactBytes: capturedArtifactBytes }) => {
      assert.deepEqual(capturedArtifactBytes, artifactBytes);
      return { bytes: capturePng, extension: ".png" };
    },
  });

  const response = await app.inject({
    method: "PATCH",
    payload: { action: "promote", notes: "capture reviewed" },
    url: "/admin/catalog-candidates/20202020-2020-4020-8020-202020202020",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(db.rows.games.length, 1);
  assert.match(
    String(db.rows.games[0]?.cover_url),
    /^https:\/\/storage\.example\.test\/catalog_artifacts\/gameplay-captures\//,
  );
  assert.match(
    String(db.rows.games[0]?.backdrop_url),
    /^https:\/\/storage\.example\.test\/catalog_artifacts\/gameplay-captures\//,
  );
  assert.equal(db.uploadedStorageObjects.length, 4);
  assert.match(
    db.uploadedStorageObjects[1]?.path || "",
    /^covers\/abababababababababababababababababababab\/nes\//,
  );
  assert.match(
    db.uploadedStorageObjects[2]?.path || "",
    /^gameplay-captures\/[^/]+\/.+-backdrop\.svg$/,
  );
  assert.match(
    db.uploadedStorageObjects[3]?.path || "",
    /^gameplay-captures\/[^/]+\/.+-cover\.png$/,
  );
  assert.match(
    String(db.rows.catalog_ingestion_candidates[0]?.review_notes),
    /Gameplay cover path: catalog_artifacts\/gameplay-captures\//,
  );
  await app.close();
});
