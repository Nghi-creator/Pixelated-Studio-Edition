import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ID,
  createDataBoundaryApp,
  FakeSupabase,
  OTHER_USER_ID,
  seedProfiles,
  sha256,
  SUBMISSION_ID,
  USER_ID,
  validNesRom,
} from "../support/dataBoundarySupport.js";

const STORAGE_BASE =
  process.env.SUPABASE_URL?.replace(/\/+$/, "") || "https://example.com";
test("admins can list pending game submissions for intake review", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.rows.game_submissions.push(
    {
      author_name: "Pixel Dev",
      created_at: "2026-07-02T10:00:00.000Z",
      email: "dev@example.com",
      game_title: "Tiny Quest",
      id: SUBMISSION_ID,
      rom_url: `${STORAGE_BASE}/storage/v1/object/public/submissions/user/roms/tiny.nes`,
      status: "pending",
      submitter_id: USER_ID,
    },
    {
      author_name: "Other Dev",
      created_at: "2026-07-01T10:00:00.000Z",
      email: "other@example.com",
      game_title: "Reviewed Quest",
      id: "99999999-9999-4999-8999-999999999999",
      rom_url: `${STORAGE_BASE}/storage/v1/object/public/submissions/user/roms/reviewed.nes`,
      status: "candidate_created",
      submitter_id: OTHER_USER_ID,
    },
  );
  const app = await createDataBoundaryApp(db, ADMIN_ID);

  const response = await app.inject({
    method: "GET",
    url: "/admin/submissions?status=pending",
  });

  assert.equal(response.statusCode, 200);
  const body = response.json<{
    submissions: { game_title: string; id: string; rom_url: string }[];
    total: number;
  }>();
  assert.equal(body.total, 1);
  assert.match(body.submissions[0]?.rom_url || "", /\/object\/sign\/submissions\//);
  assert.deepEqual(
    db.signedStorageUrls.map(({ bucket, path }) => ({ bucket, path })),
    [{ bucket: "submissions", path: "user/roms/tiny.nes" }],
  );
  assert.deepEqual(body.submissions, [
    { ...body.submissions[0], game_title: "Tiny Quest", id: SUBMISSION_ID },
  ]);
  await app.close();
});

test("admins can reject game submissions with review notes", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.rows.game_submissions.push({
    author_name: "Pixel Dev",
    created_at: "2026-07-02T10:00:00.000Z",
    email: "dev@example.com",
    game_title: "Tiny Quest",
    id: SUBMISSION_ID,
    rom_url: `${STORAGE_BASE}/storage/v1/object/public/submissions/user/roms/tiny.nes`,
    status: "pending",
    submitter_id: USER_ID,
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID);

  const response = await app.inject({
    method: "PATCH",
    payload: { action: "reject", notes: "Needs clearer rights evidence." },
    url: `/admin/submissions/${SUBMISSION_ID}`,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(db.rows.game_submissions[0]?.status, "rejected");
  assert.equal(
    db.rows.game_submissions[0]?.review_notes,
    "Needs clearer rights evidence.",
  );
  assert.equal(db.rows.game_submissions[0]?.reviewed_by, ADMIN_ID);
  assert.equal(db.rpcCalls.at(-1)?.fn, "reject_game_submission");
  await app.close();
});

test("concurrent submission reviews cannot overwrite the winning decision", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.rows.game_submissions.push({
    author_name: "Pixel Dev",
    created_at: "2026-07-02T10:00:00.000Z",
    email: "dev@example.com",
    game_title: "Tiny Quest",
    id: SUBMISSION_ID,
    rom_url: `${STORAGE_BASE}/storage/v1/object/public/submissions/user/roms/tiny.nes`,
    status: "pending",
    submitter_id: USER_ID,
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID);

  const responses = await Promise.all(
    ["First decision", "Conflicting decision"].map((notes) =>
      app.inject({
        method: "PATCH",
        payload: { action: "reject", notes },
        url: `/admin/submissions/${SUBMISSION_ID}`,
      }),
    ),
  );

  assert.deepEqual(
    responses.map((response) => response.statusCode).sort(),
    [200, 409],
  );
  assert.equal(db.rows.game_submissions[0]?.review_notes, "First decision");
  await app.close();
});

test("atomic submission rejection preserves not-found and conflict responses", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.rows.game_submissions.push({
    author_name: "Pixel Dev",
    created_at: "2026-07-02T10:00:00.000Z",
    email: "dev@example.com",
    game_title: "Reviewed Quest",
    id: SUBMISSION_ID,
    rom_url: `${STORAGE_BASE}/storage/v1/object/public/submissions/user/roms/tiny.nes`,
    status: "rejected",
    submitter_id: USER_ID,
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID);

  const reviewed = await app.inject({
    method: "PATCH",
    payload: { action: "reject", notes: "Second decision" },
    url: `/admin/submissions/${SUBMISSION_ID}`,
  });
  const missing = await app.inject({
    method: "PATCH",
    payload: { action: "reject", notes: "Missing submission" },
    url: "/admin/submissions/77777777-7777-4777-8777-777777777777",
  });

  assert.equal(reviewed.statusCode, 409);
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(
    db.rpcCalls.slice(-2).map(({ fn }) => fn),
    ["reject_game_submission", "reject_game_submission"],
  );
  await app.close();
});

test("admins can turn a game submission into a catalog candidate", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const romBytes = validNesRom();
  const romUrl =
    `${STORAGE_BASE}/storage/v1/object/public/submissions/user/roms/tiny.nes`;
  db.rows.game_submissions.push({
    author_name: "Pixel Dev",
    banner_url: "https://example.com/banner.png",
    cover_url: "https://example.com/cover.png",
    created_at: "2026-07-02T10:00:00.000Z",
    description: "A tiny NES game",
    email: "dev@example.com",
    game_title: "Tiny Quest",
    id: SUBMISSION_ID,
    rom_url: romUrl,
    status: "pending",
    submitter_id: USER_ID,
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID, romBytes);

  const response = await app.inject({
    method: "PATCH",
    payload: {
      action: "create_candidate",
      asset_license_spdx: "MIT",
      attribution_text: "Tiny Quest by Pixel Dev. Used with permission.",
      code_license_spdx: "MIT",
      license_url: "https://example.com/license",
      noncommercial_hosting_allowed: true,
      notes: "Ready for final candidate review.",
      permission_evidence_url: "https://example.com/permission",
      rights_warnings: ["Confirm submitted art can be used as cover art."],
      source_repo_url: "https://example.com/tiny-quest",
    },
    url: `/admin/submissions/${SUBMISSION_ID}`,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(db.rows.catalog_ingestion_candidates.length, 1);
  assert.equal(db.rows.catalog_ingestion_candidates[0]?.source_kind, "user_submission");
  assert.equal(db.rows.catalog_ingestion_candidates[0]?.title, "Tiny Quest");
  assert.equal(db.rows.catalog_ingestion_candidates[0]?.runtime_id, "mesen");
  assert.equal(db.rows.catalog_ingestion_candidates[0]?.platform_id, "nes");
  assert.equal(db.rows.catalog_ingestion_candidates[0]?.artifact_size, romBytes.length);
  assert.equal(db.rows.catalog_ingestion_candidates[0]?.artifact_sha256, sha256(romBytes));
  assert.equal(db.rows.catalog_ingestion_candidates[0]?.code_license_spdx, "MIT");
  assert.equal(db.rows.catalog_ingestion_candidates[0]?.noncommercial_hosting_allowed, true);
  assert.deepEqual(
    db.signedStorageUrls.map(({ bucket, path }) => ({ bucket, path })),
    [{ bucket: "submissions", path: "user/roms/tiny.nes" }],
  );
  assert.equal(db.rows.game_submissions[0]?.status, "candidate_created");
  assert.equal(
    db.rows.game_submissions[0]?.catalog_candidate_id,
    db.rows.catalog_ingestion_candidates[0]?.id,
  );
  assert.equal(db.rpcCalls.at(-1)?.fn, "create_submission_candidate");
  await app.close();
});

test("candidate creation preserves the pending submission when its transaction fails", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const romBytes = validNesRom();
  const romUrl =
    `${STORAGE_BASE}/storage/v1/object/public/submissions/user/roms/tiny.nes`;
  db.rows.game_submissions.push({
    author_name: "Pixel Dev",
    banner_url: null,
    cover_url: null,
    created_at: "2026-07-02T10:00:00.000Z",
    description: "A tiny NES game",
    email: "dev@example.com",
    game_title: "Tiny Quest",
    id: SUBMISSION_ID,
    rom_url: romUrl,
    status: "pending",
    submitter_id: USER_ID,
  });
  db.rpcErrors.set(
    "create_submission_candidate",
    new Error("atomic candidate write failed"),
  );
  const app = await createDataBoundaryApp(db, ADMIN_ID, romBytes);

  const response = await app.inject({
    method: "PATCH",
    payload: {
      action: "create_candidate",
      attribution_text: "Tiny Quest by Pixel Dev.",
      code_license_spdx: "MIT",
      license_url: "https://example.com/license",
      noncommercial_hosting_allowed: true,
      source_repo_url: "https://example.com/tiny-quest",
    },
    url: `/admin/submissions/${SUBMISSION_ID}`,
  });

  assert.equal(response.statusCode, 500);
  assert.equal(db.rows.catalog_ingestion_candidates.length, 0);
  assert.equal(db.rows.game_submissions[0]?.status, "pending");
  assert.equal(db.rows.game_submissions[0]?.catalog_candidate_id, undefined);
  await app.close();
});

test("admin submission candidate review rejects oversized ROM artifacts", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const romUrl =
    `${STORAGE_BASE}/storage/v1/object/public/submissions/user/roms/tiny.nes`;
  db.rows.game_submissions.push({
    author_name: "Pixel Dev",
    banner_url: "https://example.com/banner.png",
    cover_url: "https://example.com/cover.png",
    created_at: "2026-07-02T10:00:00.000Z",
    description: "A tiny NES game",
    email: "dev@example.com",
    game_title: "Tiny Quest",
    id: SUBMISSION_ID,
    rom_url: romUrl,
    status: "pending",
    submitter_id: USER_ID,
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID, Buffer.from(""), {
    fetchArtifact: async () =>
      new Response(null, {
        headers: { "content-length": String(64 * 1024 * 1024 + 1) },
      }),
  });

  const response = await app.inject({
    method: "PATCH",
    payload: {
      action: "create_candidate",
      asset_license_spdx: "MIT",
      attribution_text: "Tiny Quest by Pixel Dev. Used with permission.",
      code_license_spdx: "MIT",
      license_url: "https://example.com/license",
      noncommercial_hosting_allowed: true,
      permission_evidence_url: "https://example.com/permission",
      source_repo_url: "https://example.com/tiny-quest",
    },
    url: `/admin/submissions/${SUBMISSION_ID}`,
  });

  assert.equal(response.statusCode, 413);
  assert.equal(db.rows.catalog_ingestion_candidates.length, 0);
  assert.equal(db.rows.game_submissions[0]?.status, "pending");
  await app.close();
});
