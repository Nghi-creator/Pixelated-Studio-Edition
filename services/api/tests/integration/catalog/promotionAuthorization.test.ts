import assert from "node:assert/strict";
import test from "node:test";
import {
  createDataBoundaryApp,
  FakeSupabase,
  seedProfiles,
  USER_ID,
} from "../support/dataBoundarySupport.js";

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
