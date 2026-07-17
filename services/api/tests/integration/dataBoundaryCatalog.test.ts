import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createCatalogRouteContext } from "../../src/modules/catalog/http/catalogRouteContext.js";
import {
  registerGamesCatalogRoutes,
  warmGamesCatalogCache,
} from "../../src/modules/catalog/http/gamesRoutes.js";
import {
  ADMIN_ID,
  createDataBoundaryApp,
  FakeSupabase,
  GAME_ID,
  seedProfiles,
  seedPublishedGames,
  sha256,
  USER_ID,
  validGameGearRom,
  validGenesisRom,
  validNesRom,
  validSnesRom,
} from "./dataBoundarySupport.js";

test("catalog and favorites are served through backend routes", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(db, { id: GAME_ID, title: "Zeta" });
  db.rows.favorites.push({
    game_id: GAME_ID,
    games: { id: GAME_ID, title: "Zeta" },
    user_id: USER_ID,
  });
  const app = await createDataBoundaryApp(db);

  const gamesResponse = await app.inject({ method: "GET", url: "/games" });
  assert.equal(gamesResponse.statusCode, 200);
  assert.equal(gamesResponse.json<{ games: unknown[] }>().games.length, 1);
  assert.equal(
    db.rpcCalls.some((call) => call.fn === "published_catalog_games"),
    true,
  );

  const favoriteResponse = await app.inject({
    method: "GET",
    url: `/favorites/${GAME_ID}`,
  });
  assert.equal(favoriteResponse.statusCode, 200);
  assert.equal(favoriteResponse.json<{ favorited: boolean }>().favorited, true);

  const deleteResponse = await app.inject({
    method: "DELETE",
    url: `/favorites/${GAME_ID}`,
  });
  assert.equal(deleteResponse.statusCode, 204);
  assert.equal(db.rows.favorites.length, 0);
  await app.close();
});

test("catalog hides games without an enabled build and verified rights", async () => {
  const db = new FakeSupabase();
  db.rows.games.push({
    id: "unreviewed-game",
    publication_status: "published",
    title: "Unreviewed",
  });
  const app = await createDataBoundaryApp(db);

  const response = await app.inject({ method: "GET", url: "/games" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json<{ games: unknown[] }>().games, []);
  await app.close();
});

test("catalog route paginates, searches, and returns featured games", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(
    db,
    { cover_url: "/a.png", id: "game-a", play_count: 2, title: "Alpha Quest" },
    { cover_url: "/b.png", id: "game-b", play_count: 20, title: "Beta Quest" },
    { cover_url: "/c.png", id: "game-c", play_count: 5, title: "Gamma Run" },
    { cover_url: "/d.png", id: "game-d", play_count: 7, title: "Quest Drift" },
    { cover_url: "/e.png", id: "game-e", play_count: 3, title: "Delta Run" },
    { cover_url: "/f.png", id: "game-f", play_count: 1, title: "Echo Run" },
  );
  const app = await createDataBoundaryApp(db);

  const unsearchedResponse = await app.inject({
    method: "GET",
    url: "/games?page=2&pageSize=2",
  });

  assert.equal(unsearchedResponse.statusCode, 200);
  assert.deepEqual(
    unsearchedResponse
      .json<{ games: { id: string }[] }>()
      .games.map((game) => game.id),
    ["game-e", "game-f"],
  );

  const response = await app.inject({
    method: "GET",
    url: "/games?page=2&pageSize=2&search=quest",
  });

  assert.equal(response.statusCode, 200);
  const body = response.json<{
    featuredGames: { id: string }[];
    games: { id: string }[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>();
  assert.deepEqual(
    body.games.map((game) => game.id),
    ["game-a"],
  );
  assert.deepEqual(
    body.featuredGames.map((game) => game.id),
    ["game-b", "game-d", "game-c", "game-e", "game-a"],
  );
  assert.equal(body.page, 2);
  assert.equal(body.pageSize, 2);
  assert.equal(body.total, 3);
  assert.equal(body.totalPages, 2);
  await app.close();
});

test("catalog search is pushed into the published catalog RPC", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(
    db,
    ...Array.from({ length: 1005 }, (_, index) => ({
      id: `filler-${index.toString().padStart(4, "0")}`,
      title: `Filler ${index.toString().padStart(4, "0")}`,
    })),
    { id: "omega-hidden", title: "Omega Hidden Quest" },
  );
  const app = await createDataBoundaryApp(db);

  const response = await app.inject({
    method: "GET",
    url: "/games?search=omega&pageSize=5",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.json<{ games: { id: string }[] }>().games.map((game) => game.id),
    ["omega-hidden"],
  );
  assert.equal(
    db.rpcCalls.some(
      (call) =>
        call.fn === "published_catalog_games" && call.params.p_search === "omega",
    ),
    true,
  );
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

test("catalog candidate review requires admin access", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.rows.catalog_ingestion_candidates.push({
    artifact_filename: "game.gb",
    artifact_sha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    artifact_size: 32768,
    artifact_url: "https://raw.githubusercontent.com/example/repo/game.gb",
    asset_license_spdx: "MIT",
    attribution_text: "Game attribution",
    code_license_spdx: "MIT",
    cover_license_spdx: null,
    developer_name: "dev",
    developer_url: null,
    id: "99999999-9999-4999-8999-999999999999",
    import_status: "needs_review",
    license_url: "https://opensource.org/license/mit",
    noncommercial_hosting_allowed: true,
    original_release_url: null,
    permission_evidence_url: "https://opensource.org/license/mit",
    platform_id: "gb",
    review_notes: null,
    runtime_id: "mgba",
    runtime_kind: "libretro",
    source_commit: "cccccccccccccccccccccccccccccccccccccccc",
    source_entry_path: "entries/game/game.json",
    source_repo_url: "https://github.com/gbdev/database",
    title: "Game",
  });
  const app = await createDataBoundaryApp(db, USER_ID);

  const response = await app.inject({
    method: "PATCH",
    payload: { action: "promote" },
    url: "/admin/catalog-candidates/99999999-9999-4999-8999-999999999999",
  });

  assert.equal(response.statusCode, 403);
  assert.equal(db.rows.games.length, 0);
  assert.equal(db.rows.catalog_ingestion_candidates[0]?.import_status, "needs_review");
  await app.close();
});

test("catalog route caches public game pages briefly", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(db, {
    id: "cache-game-a",
    play_count: 1,
    title: "Cache Alpha",
  });
  const app = await createDataBoundaryApp(db);

  const firstResponse = await app.inject({
    method: "GET",
    url: "/games?page=1&pageSize=15&search=cache-alpha-unique",
  });
  seedPublishedGames(db, {
    id: "cache-game-b",
    play_count: 20,
    title: "Cache Alpha Unique",
  });
  const secondResponse = await app.inject({
    method: "GET",
    url: "/games?page=1&pageSize=15&search=cache-alpha-unique",
  });

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(firstResponse.headers["x-pixelated-cache"], "MISS");
  assert.equal(secondResponse.headers["x-pixelated-cache"], "HIT");
  assert.equal(firstResponse.json<{ total: number }>().total, 0);
  assert.equal(secondResponse.json<{ total: number }>().total, 0);
  await app.close();
});

test("catalog startup warmup covers the default home request and featured games", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(
    db,
    {
      cover_url: "/featured.png",
      id: "warm-featured",
      play_count: 10,
      title: "Warm Featured",
    },
    {
      cover_url: "/alpha.png",
      id: "warm-alpha",
      play_count: 1,
      title: "Warm Alpha",
    },
  );
  const app = Fastify({ logger: false });
  const context = createCatalogRouteContext({ supabase: db as never });
  registerGamesCatalogRoutes(app, context);

  await warmGamesCatalogCache(context);
  const warmupRpcCallCount = db.rpcCalls.length;

  const response = await app.inject({
    method: "GET",
    url: "/games",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-pixelated-cache"], "HIT");
  assert.equal(db.rpcCalls.length, warmupRpcCallCount);
  assert.deepEqual(
    response.json<{ games: { id: string }[] }>().games.map((game) => game.id),
    ["warm-alpha", "warm-featured"],
  );
  assert.deepEqual(
    response
      .json<{ featuredGames: { id: string }[] }>()
      .featuredGames.map((game) => game.id),
    ["warm-featured", "warm-alpha"],
  );
  await app.close();
});

test("catalog cache keeps featured games fresh", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(db, {
    cover_url: "/a.png",
    id: "cache-featured-a",
    play_count: 1,
    title: "Cache Featured Alpha",
  });
  const app = await createDataBoundaryApp(db);

  const firstResponse = await app.inject({
    method: "GET",
    url: "/games?page=1&pageSize=15&search=cache-featured-alpha",
  });
  seedPublishedGames(db, {
    cover_url: "/b.png",
    id: "cache-featured-b",
    play_count: 20,
    title: "Cache Featured Beta",
  });
  const secondResponse = await app.inject({
    method: "GET",
    url: "/games?page=1&pageSize=15&search=cache-featured-alpha",
  });

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(secondResponse.headers["x-pixelated-cache"], "HIT");
  assert.deepEqual(
    secondResponse
      .json<{ featuredGames: { id: string }[] }>()
      .featuredGames.map((game) => game.id),
    ["cache-featured-b", "cache-featured-a"],
  );
  await app.close();
});

test("featured games route bypasses shared catalog cache headers", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(db, {
    id: "featured-a",
    play_count: 1,
    title: "Featured A",
  });
  const app = await createDataBoundaryApp(db);

  const response = await app.inject({
    method: "GET",
    url: "/games/featured",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(
    response
      .json<{ featuredGames: { id: string }[] }>()
      .featuredGames.map((game) => game.id),
    ["featured-a"],
  );
  await app.close();
});

test("featured games route returns a wider pool while all play counts are zero", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(
    db,
    { id: "zero-featured-a", play_count: 0, title: "Zero Featured A" },
    { id: "zero-featured-b", play_count: 0, title: "Zero Featured B" },
    { id: "zero-featured-c", play_count: 0, title: "Zero Featured C" },
    { id: "zero-featured-d", play_count: 0, title: "Zero Featured D" },
    { id: "zero-featured-e", play_count: 0, title: "Zero Featured E" },
    { id: "zero-featured-f", play_count: 0, title: "Zero Featured F" },
  );
  const app = await createDataBoundaryApp(db);

  const response = await app.inject({
    method: "GET",
    url: "/games/featured",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.json<{ featuredGames: { id: string }[] }>().featuredGames.length,
    5,
  );
  await app.close();
});
