import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ID,
  createDataBoundaryApp,
  FakeSupabase,
  seedProfiles,
  sha256,
  validNesRom,
} from "./dataBoundarySupport.js";

test("admin browser smoke flow verifies the artifact and records reviewer evidence", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const artifactBytes = validNesRom();
  const candidateId = "78787878-7878-4878-8878-787878787878";
  db.rows.catalog_ingestion_candidates.push({
    artifact_filename: "smoke.nes",
    artifact_sha256: sha256(artifactBytes),
    artifact_size: artifactBytes.length,
    artifact_url: "https://raw.githubusercontent.com/example/repo/smoke.nes",
    asset_license_spdx: "MIT",
    attribution_text: "Smoke attribution",
    browser_smoke_core_id: null,
    browser_smoke_error: null,
    browser_smoke_status: "not_tested",
    browser_smoke_tested_at: null,
    browser_smoke_tested_by: null,
    code_license_spdx: "MIT",
    cover_license_spdx: null,
    developer_name: "Smoke Dev",
    developer_url: null,
    id: candidateId,
    import_status: "needs_review",
    launch_manifest_id: null,
    license_url: "https://example.test/license",
    noncommercial_hosting_allowed: true,
    original_release_url: null,
    package_component: null,
    package_name: null,
    package_version: null,
    permission_evidence_url: "https://example.test/license",
    platform_id: "nes",
    review_notes: null,
    runtime_id: "mesen",
    runtime_kind: "libretro",
    source_commit: "abababababababababababababababababababab",
    source_entry_path: "entries/smoke/game.json",
    source_kind: "homebrew_hub_nes",
    source_repo_url: "https://github.com/example/repo",
    title: "Smoke Demo",
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID, artifactBytes);

  const listResponse = await app.inject({
    method: "GET",
    url: "/admin/catalog-candidates",
  });
  assert.equal(listResponse.statusCode, 200);
  assert.deepEqual(listResponse.json().candidates[0].browser_compatibility, {
    coreId: "fceumm",
    eligible: true,
    reason: null,
    systemId: "nes",
  });
  assert.deepEqual(listResponse.json().candidates[0].technical_compatibility, {
    compatible: true,
    reason: null,
  });

  const ticketResponse = await app.inject({
    method: "POST",
    url: `/admin/catalog-candidates/${candidateId}/browser-smoke-ticket`,
  });
  assert.equal(ticketResponse.statusCode, 200);
  const { ticket } = ticketResponse.json<{ ticket: string }>();

  const sessionResponse = await app.inject({
    headers: { authorization: `Smoke ${ticket}` },
    method: "GET",
    url: "/browser-smoke/session",
  });
  assert.equal(sessionResponse.statusCode, 200);
  assert.equal(sessionResponse.json().candidateId, candidateId);

  const artifactResponse = await app.inject({
    headers: { authorization: `Smoke ${ticket}` },
    method: "GET",
    url: "/browser-smoke/artifact",
  });
  assert.equal(artifactResponse.statusCode, 200);
  assert.deepEqual(artifactResponse.rawPayload, artifactBytes);
  assert.equal(artifactResponse.headers["cache-control"], "no-store");

  const repeatedArtifactResponse = await app.inject({
    headers: { authorization: `Smoke ${ticket}` },
    method: "GET",
    url: "/browser-smoke/artifact",
  });
  assert.equal(repeatedArtifactResponse.statusCode, 409);

  const resultResponse = await app.inject({
    headers: { authorization: `Smoke ${ticket}` },
    method: "POST",
    payload: { coreId: "fceumm", status: "passed" },
    url: "/browser-smoke/result",
  });
  assert.equal(resultResponse.statusCode, 200);
  assert.equal(db.rows.catalog_ingestion_candidates[0]?.browser_smoke_status, "passed");
  assert.equal(db.rows.catalog_ingestion_candidates[0]?.browser_smoke_core_id, "fceumm");
  assert.equal(db.rows.catalog_ingestion_candidates[0]?.browser_smoke_tested_by, ADMIN_ID);
  assert.ok(db.rows.catalog_ingestion_candidates[0]?.browser_smoke_tested_at);
  assert.equal(
    db.rpcCalls.some((call) => call.fn === "record_browser_smoke_result"),
    true,
  );

  const replayResponse = await app.inject({
    headers: { authorization: `Smoke ${ticket}` },
    method: "POST",
    payload: { coreId: "fceumm", status: "passed" },
    url: "/browser-smoke/result",
  });
  assert.equal(replayResponse.statusCode, 409);
  await app.close();
});

test("browser smoke capability routes share a dedicated IP rate limit", async () => {
  const db = new FakeSupabase();
  let attempts = 0;
  const app = await createDataBoundaryApp(db, ADMIN_ID, validNesRom(), {
    browserSmokeLimiter: {
      consume: async () => {
        attempts += 1;
        return {
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + 60_000,
        };
      },
    },
  });

  const responses = await Promise.all([
    app.inject({ method: "GET", url: "/browser-smoke/session" }),
    app.inject({ method: "GET", url: "/browser-smoke/artifact" }),
    app.inject({
      method: "POST",
      payload: { coreId: "fceumm", status: "passed" },
      url: "/browser-smoke/result",
    }),
  ]);

  assert.equal(attempts, 3);
  for (const response of responses) {
    assert.equal(response.statusCode, 429);
    assert.equal(typeof response.headers["retry-after"], "string");
  }
  await app.close();
});

