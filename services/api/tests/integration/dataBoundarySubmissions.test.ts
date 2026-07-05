import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ID,
  createDataBoundaryApp,
  FakeSupabase,
  GAME_ID,
  OTHER_USER_ID,
  type RecordRow,
  seedProfiles,
  sha256,
  SUBMISSION_ID,
  SUPER_ADMIN_ID,
  USER_ID,
  validNesRom,
  validSubmissionPayload,
} from "./dataBoundarySupport.js";

test("submissions persist metadata for the authenticated submitter", async () => {
  const db = new FakeSupabase();
  let notifiedSubmission: RecordRow | null = null;
  const app = await createDataBoundaryApp(db, USER_ID, Buffer.from("test-artifact"), {
    notifySubmission: async (submission: RecordRow) => {
      notifiedSubmission = submission;
    },
  });
  const storageBase =
    process.env.SUPABASE_URL?.replace(/\/+$/, "") || "https://example.com";
  const romUrl = `${storageBase}/storage/v1/object/public/submissions/${USER_ID}/roms/tiny.gba`;

  const response = await app.inject({
    method: "POST",
    payload: validSubmissionPayload({
      bannerUrl: `${storageBase}/storage/v1/object/public/submissions/${USER_ID}/banners/banner.png`,
      coverUrl: `${storageBase}/storage/v1/object/public/submissions/${USER_ID}/covers/cover.png`,
      romUrl,
    }),
    url: "/submissions/games",
  });

  assert.equal(response.statusCode, 201);
  assert.equal(db.rows.game_submissions.length, 1);
  assert.equal(db.rows.game_submissions[0]?.submitter_id, USER_ID);
  assert.equal(db.rows.game_submissions[0]?.game_title, "Tiny Quest");
  assert.equal(db.rows.game_submissions[0]?.attribution_text, "Tiny Quest by Pixel Dev");
  assert.equal(db.rows.game_submissions[0]?.ownership_status, "creator");
  assert.equal(db.rows.game_submissions[0]?.hosting_confirmed, true);
  assert.equal(db.rows.game_submissions[0]?.rom_url, romUrl);
  assert.match(String(notifiedSubmission?.romUrl), /\/object\/sign\/submissions\//);
  assert.match(String(notifiedSubmission?.coverUrl), /\/object\/sign\/submissions\//);
  assert.match(String(notifiedSubmission?.bannerUrl), /\/object\/sign\/submissions\//);
  assert.deepEqual(
    db.signedStorageUrls.map(({ bucket, path }) => ({ bucket, path })),
    [
      { bucket: "submissions", path: `${USER_ID}/roms/tiny.gba` },
      { bucket: "submissions", path: `${USER_ID}/covers/cover.png` },
      { bucket: "submissions", path: `${USER_ID}/banners/banner.png` },
    ],
  );
  await app.close();
});

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
      rom_url: "https://example.com/storage/v1/object/public/submissions/user/roms/tiny.nes",
      status: "pending",
      submitter_id: USER_ID,
    },
    {
      author_name: "Other Dev",
      created_at: "2026-07-01T10:00:00.000Z",
      email: "other@example.com",
      game_title: "Reviewed Quest",
      id: "99999999-9999-4999-8999-999999999999",
      rom_url: "https://example.com/storage/v1/object/public/submissions/user/roms/reviewed.nes",
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
    submissions: { game_title: string; id: string }[];
    total: number;
  }>();
  assert.equal(body.total, 1);
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
    rom_url: "https://example.com/storage/v1/object/public/submissions/user/roms/tiny.nes",
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
  await app.close();
});

test("admins can turn a game submission into a catalog candidate", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const romBytes = validNesRom();
  const romUrl =
    "https://example.com/storage/v1/object/public/submissions/user/roms/tiny.nes";
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
  assert.equal(db.rows.game_submissions[0]?.status, "candidate_created");
  assert.equal(
    db.rows.game_submissions[0]?.catalog_candidate_id,
    db.rows.catalog_ingestion_candidates[0]?.id,
  );
  await app.close();
});

test("admin submission candidate review rejects oversized ROM artifacts", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const romUrl =
    "https://example.com/storage/v1/object/public/submissions/user/roms/tiny.nes";
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

test("submissions reject unsupported ROM extensions", async () => {
  const db = new FakeSupabase();
  const app = await createDataBoundaryApp(db, USER_ID);
  const storageBase =
    process.env.SUPABASE_URL?.replace(/\/+$/, "") || "https://example.com";

  const response = await app.inject({
    method: "POST",
    payload: validSubmissionPayload({
      romUrl: `${storageBase}/storage/v1/object/public/submissions/${USER_ID}/roms/tiny.zip`,
    }),
    url: "/submissions/games",
  });

  assert.equal(response.statusCode, 400);
  assert.match(
    response.json<{ error: string }>().error,
    /supported game file/,
  );
  assert.equal(db.rows.game_submissions.length, 0);
  await app.close();
});

test("super admins cannot submit games for review", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const app = await createDataBoundaryApp(db, SUPER_ADMIN_ID);
  const storageBase =
    process.env.SUPABASE_URL?.replace(/\/+$/, "") || "https://example.com";

  const response = await app.inject({
    method: "POST",
    payload: validSubmissionPayload({
      authorName: "Root",
      email: "root@example.com",
      gameTitle: "Root Quest",
      romUrl: `${storageBase}/storage/v1/object/public/submissions/${SUPER_ADMIN_ID}/roms/root.nes`,
    }),
    url: "/submissions/games",
  });

  assert.equal(response.statusCode, 403);
  assert.equal(db.rows.game_submissions.length, 0);
  await app.close();
});

test("submissions reject files outside the authenticated user's folder", async () => {
  const db = new FakeSupabase();
  const app = await createDataBoundaryApp(db, USER_ID);
  const storageBase =
    process.env.SUPABASE_URL?.replace(/\/+$/, "") || "https://example.com";

  const response = await app.inject({
    method: "POST",
    payload: validSubmissionPayload({
      romUrl: `${storageBase}/storage/v1/object/public/submissions/${OTHER_USER_ID}/roms/tiny.nes`,
    }),
    url: "/submissions/games",
  });

  assert.equal(response.statusCode, 400);
  assert.equal(db.rows.game_submissions.length, 0);
  await app.close();
});

test("submissions are rate limited per authenticated user", async () => {
  const db = new FakeSupabase();
  const recentTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  db.rows.game_submissions.push(
    { created_at: recentTime, submitter_id: USER_ID },
    { created_at: recentTime, submitter_id: USER_ID },
    { created_at: recentTime, submitter_id: USER_ID },
    { created_at: recentTime, submitter_id: OTHER_USER_ID },
  );
  const app = await createDataBoundaryApp(db, USER_ID);
  const storageBase =
    process.env.SUPABASE_URL?.replace(/\/+$/, "") || "https://example.com";

  const response = await app.inject({
    method: "POST",
    payload: validSubmissionPayload({
      romUrl: `${storageBase}/storage/v1/object/public/submissions/${USER_ID}/roms/tiny.nes`,
    }),
    url: "/submissions/games",
  });

  assert.equal(response.statusCode, 429);
  assert.equal(db.rows.game_submissions.length, 4);
  await app.close();
});

test("play counts are incremented through the backend RPC boundary", async () => {
  const db = new FakeSupabase();
  const app = await createDataBoundaryApp(db, USER_ID);

  const response = await app.inject({
    method: "POST",
    url: `/games/${GAME_ID}/play-count`,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(db.rpcCalls, [
    { fn: "increment_play_count", params: { game_id: GAME_ID } },
  ]);
  await app.close();
});

test("local pairings stay scoped to the authenticated user", async () => {
  const db = new FakeSupabase();
  const app = await createDataBoundaryApp(db, USER_ID);

  const createResponse = await app.inject({
    method: "POST",
    payload: { engineUrl: "http://localhost:8080/" },
    url: "/local-pairings",
  });
  assert.equal(createResponse.statusCode, 200);
  assert.equal(db.rows.local_engine_pairings[0]?.user_id, USER_ID);
  assert.equal(db.rows.local_engine_pairings[0]?.engine_url, "http://localhost:8080");

  const otherApp = await createDataBoundaryApp(db, OTHER_USER_ID);
  const otherResponse = await otherApp.inject({
    method: "GET",
    url: "/local-pairings/current",
  });
  assert.equal(otherResponse.statusCode, 404);
  await app.close();
  await otherApp.close();
});

test("stream metrics are written and read only for the authenticated user", async () => {
  const db = new FakeSupabase();
  db.rows.stream_metrics.push({
    bitrate_kbps: 900,
    connection_state: "connected",
    fps: 30,
    ice_connection_state: "connected",
    jitter_ms: 5,
    metric_timestamp: "2026-05-27T12:00:00.000Z",
    packets_lost: 1,
    received_at: "2026-05-27T12:00:00.000Z",
    session_id: "other-session",
    user_id: OTHER_USER_ID,
  });
  const app = await createDataBoundaryApp(db, USER_ID);

  const response = await app.inject({
    method: "POST",
    payload: {
      bitrateKbps: 1200,
      connectionState: "connected",
      fps: 60,
      iceConnectionState: "connected",
      jitterMs: 3,
      packetsLost: 0,
      sessionId: "session-1",
      timestamp: "2026-05-27T12:01:00.000Z",
    },
    url: "/metrics/stream",
  });
  assert.equal(response.statusCode, 202);
  assert.equal(response.json<{ accepted: boolean }>().accepted, true);
  assert.equal(db.rows.stream_metrics.length, 2);

  const recentResponse = await app.inject({
    method: "GET",
    url: "/metrics/stream/recent",
  });
  const metrics = recentResponse.json<{ metrics: { sessionId: string }[] }>().metrics;
  assert.equal(recentResponse.statusCode, 200);
  assert.deepEqual(metrics.map((metric) => metric.sessionId), ["session-1"]);
  await app.close();
});
