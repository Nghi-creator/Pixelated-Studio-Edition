import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { cleanupControlPlaneState } from "../../src/modules/maintenance/controlPlaneCleanup.js";
import { registerLocalPairingRoutes } from "../../src/modules/multiplayer/http/localPairingRoutes.js";
import { registerMetricRoutes } from "../../src/modules/observability/http/metricRoutes.js";
import { registerMultiplayerRoutes } from "../../src/modules/multiplayer/http/multiplayerRoutes.js";
import { registerSessionRoutes } from "../../src/modules/auth/http/sessionRoutes.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const GAME_ID = "33333333-3333-4333-8333-333333333333";

type TableName =
  | "backend_sessions"
  | "game_builds"
  | "game_rights"
  | "games"
  | "local_engine_pairings"
  | "multiplayer_lobbies"
  | "stream_metrics";

type RecordRow = Record<string, unknown>;

type QueryResult<T> = {
  data: T | null;
  error: Error | null;
};

type Filter = {
  field: string;
  op: "eq" | "gt" | "in" | "is" | "lt" | "not";
  value: unknown;
};

class FakeSupabase {
  games = new Map<string, RecordRow>();
  gameBuilds = new Map<string, RecordRow>();
  gameRights = new Map<string, RecordRow>();
  sessions = new Map<string, RecordRow>();
  pairings = new Map<string, RecordRow>();
  multiplayerLobbies = new Map<string, RecordRow>();
  metrics: RecordRow[] = [];

  from(table: TableName) {
    return new FakeQueryBuilder(this, table);
  }

  tableRows(table: TableName) {
    if (table === "games") return Array.from(this.games.values());
    if (table === "game_builds") return Array.from(this.gameBuilds.values());
    if (table === "game_rights") return Array.from(this.gameRights.values());
    if (table === "backend_sessions") return Array.from(this.sessions.values());
    if (table === "local_engine_pairings") return Array.from(this.pairings.values());
    if (table === "multiplayer_lobbies") {
      return Array.from(this.multiplayerLobbies.values());
    }
    return this.metrics;
  }
}

class FakeQueryBuilder {
  private action:
    | "delete"
    | "insert"
    | "select"
    | "update"
    | "upsert"
    | null = null;
  private filters: Filter[] = [];
  private limitCount: number | null = null;
  private orderConfig: { ascending: boolean; field: string } | null = null;
  private payload: RecordRow | RecordRow[] | null = null;

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: TableName,
  ) {}

  select() {
    this.action = this.action || "select";
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, op: "eq", value });
    return this;
  }

  gt(field: string, value: unknown) {
    this.filters.push({ field, op: "gt", value });
    return this;
  }

  in(field: string, value: unknown[]) {
    this.filters.push({ field, op: "in", value });
    return this;
  }

  is(field: string, value: unknown) {
    this.filters.push({ field, op: "is", value });
    return this;
  }

  lt(field: string, value: unknown) {
    this.filters.push({ field, op: "lt", value });
    return this;
  }

  not(field: string, _operator: string, value: unknown) {
    this.filters.push({ field, op: "not", value });
    return this;
  }

  order(field: string, options: { ascending: boolean }) {
    this.orderConfig = { ascending: options.ascending, field };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  insert(payload: RecordRow) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: RecordRow) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: RecordRow) {
    this.action = "upsert";
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  async single<T>(): Promise<QueryResult<T>> {
    const rows = await this.executeRows();
    return { data: (rows[0] as T) || null, error: rows[0] ? null : new Error("Not found") };
  }

  async maybeSingle<T>(): Promise<QueryResult<T>> {
    const rows = await this.executeRows();
    return { data: (rows[0] as T) || null, error: null };
  }

  async returns<T>(): Promise<QueryResult<T>> {
    const rows = await this.executeRows();
    return { data: rows as T, error: null };
  }

  then<TResult1 = QueryResult<unknown>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute()
      .then(onfulfilled || undefined)
      .catch(onrejected || undefined);
  }

  private async execute(): Promise<QueryResult<unknown>> {
    const rows = await this.executeRows();
    return { data: rows, error: null };
  }

  private async executeRows() {
    if (this.action === "insert" && this.payload && !Array.isArray(this.payload)) {
      this.insertRow(this.payload);
    }

    if (this.action === "upsert" && this.payload && !Array.isArray(this.payload)) {
      this.upsertRow(this.payload);
    }

    if (this.action === "update" && this.payload && !Array.isArray(this.payload)) {
      for (const row of this.filteredRows()) {
        Object.assign(row, this.payload);
      }
    }

    if (this.action === "delete") {
      this.deleteRows();
      return [];
    }

    const rows = this.filteredRows();
    if (this.orderConfig) {
      rows.sort((left, right) => {
        const leftValue = String(left[this.orderConfig?.field || ""]);
        const rightValue = String(right[this.orderConfig?.field || ""]);
        return this.orderConfig?.ascending
          ? leftValue.localeCompare(rightValue)
          : rightValue.localeCompare(leftValue);
      });
    }

    return this.limitCount === null ? rows : rows.slice(0, this.limitCount);
  }

  private filteredRows() {
    return this.db
      .tableRows(this.table)
      .filter((row) =>
        this.filters.every((filter) => this.matchesFilter(row, filter)),
      );
  }

  private matchesFilter(row: RecordRow, filter: Filter) {
    const value = row[filter.field];
    if (filter.op === "eq") return value === filter.value;
    if (filter.op === "gt") return String(value) > String(filter.value);
    if (filter.op === "in" && Array.isArray(filter.value)) {
      return filter.value.includes(value);
    }
    if (filter.op === "lt") return String(value) < String(filter.value);
    if (filter.op === "is") return value === filter.value;
    return value !== filter.value;
  }

  private insertRow(row: RecordRow) {
    if (this.table === "stream_metrics") {
      this.db.metrics.push({ ...row });
      return;
    }

    this.upsertRow(row);
  }

  private upsertRow(row: RecordRow) {
    if (this.table === "backend_sessions") {
      this.db.sessions.set(String(row.id), { ...row });
      return;
    }

    if (this.table === "game_builds") {
      this.db.gameBuilds.set(String(row.id), { ...row });
      return;
    }

    if (this.table === "game_rights") {
      this.db.gameRights.set(String(row.id), { ...row });
      return;
    }

    if (this.table === "local_engine_pairings") {
      const existing = this.db.pairings.get(String(row.user_id));
      this.db.pairings.set(String(row.user_id), {
        created_at: existing?.created_at || new Date().toISOString(),
        id: existing?.id || "pairing-1",
        ...existing,
        ...row,
      });
    }

    if (this.table === "multiplayer_lobbies") {
      const key = `${row.host_user_id}:${row.session_id}`;
      const existing = this.db.multiplayerLobbies.get(key);
      this.db.multiplayerLobbies.set(key, {
        created_at: existing?.created_at || new Date().toISOString(),
        id: existing?.id || "lobby-1",
        ...existing,
        ...row,
      });
    }
  }

  private deleteRows() {
    const rows = this.filteredRows();
    if (this.table === "backend_sessions") {
      for (const row of rows) this.db.sessions.delete(String(row.id));
    }
    if (this.table === "local_engine_pairings") {
      for (const row of rows) this.db.pairings.delete(String(row.user_id));
    }
    if (this.table === "stream_metrics") {
      this.db.metrics = this.db.metrics.filter((row) => !rows.includes(row));
    }
    if (this.table === "multiplayer_lobbies") {
      for (const row of rows) {
        this.db.multiplayerLobbies.delete(
          `${row.host_user_id}:${row.session_id}`,
        );
      }
    }
  }
}

function requireUser(userId = USER_ID) {
  return async (request: FastifyRequest) => {
    request.user = {
      app_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
      id: userId,
      user_metadata: {},
    };
    return undefined;
  };
}

function seedPublishedGame(
  db: FakeSupabase,
  game: RecordRow & { id: string },
) {
  const buildId = `${game.id}-build`;
  db.games.set(game.id, {
    publication_status: "published",
    ...game,
  });
  db.gameBuilds.set(buildId, {
    artifact_filename: game.rom_filename || `${game.id}.nes`,
    artifact_sha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    artifact_size: 1234,
    artifact_url: game.rom_url || null,
    enabled: true,
    game_id: game.id,
    id: buildId,
    platform_id: "nes",
    runtime_id: "mesen",
    runtime_kind: "libretro",
  });
  db.gameRights.set(`${game.id}-rights`, {
    game_build_id: buildId,
    game_id: game.id,
    id: `${game.id}-rights`,
    noncommercial_hosting_allowed: true,
    verified_at: new Date().toISOString(),
  });
}

async function createTestApp(db: FakeSupabase, userId = USER_ID) {
  const app = Fastify({ logger: false });
  const options = {
    optionalUser: requireUser(userId),
    requireUser: requireUser(userId),
    supabase: db as never,
  };

  await registerSessionRoutes(app, options);
  await registerLocalPairingRoutes(app, options);
  await registerMetricRoutes(app, options);
  await registerMultiplayerRoutes(app, options);
  return app;
}

test("sessions persist hashed tokens and verify approved boot targets", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "fallback.nes",
    rom_url: "https://pxksbsloksyfwiqyfkrz.supabase.co/game.nes",
  });
  const build = db.gameBuilds.get(`${GAME_ID}-build`);
  if (build) {
    build.artifact_size = 1234;
    build.artifact_sha256 =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  }
  const app = await createTestApp(db);

  const createResponse = await app.inject({
    method: "POST",
    payload: { clientSessionId: "session-1", gameId: GAME_ID, mode: "cloud" },
    url: "/sessions",
  });

  assert.equal(createResponse.statusCode, 200);
  const created = createResponse.json<{
    sessionId: string;
    sessionToken: string;
  }>();
  const storedSession = db.sessions.get("session-1");
  assert.ok(storedSession);
  assert.equal(storedSession.session_token_hash === created.sessionToken, false);

  const verifyResponse = await app.inject({
    method: "POST",
    payload: { sessionToken: created.sessionToken },
    url: `/sessions/${created.sessionId}/verify`,
  });

  assert.equal(verifyResponse.statusCode, 200);
  assert.equal(
    verifyResponse.json<{ boot: { romUrl: string } }>().boot.romUrl,
    "https://pxksbsloksyfwiqyfkrz.supabase.co/game.nes",
  );
  assert.equal(
    verifyResponse.json<{ boot: { runtimeId: string } }>().boot.runtimeId,
    "mesen",
  );
  assert.equal(
    verifyResponse.json<{ boot: { runtimeKind: string } }>().boot.runtimeKind,
    "libretro",
  );
  assert.equal(
    verifyResponse.json<{ boot: { artifactSize: number } }>().boot.artifactSize,
    1234,
  );
  assert.equal(
    verifyResponse.json<{ boot: { artifactSha256: string } }>().boot.artifactSha256,
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );

  const badVerifyResponse = await app.inject({
    method: "POST",
    payload: { sessionToken: "definitely-not-the-token" },
    url: `/sessions/${created.sessionId}/verify`,
  });

  assert.equal(badVerifyResponse.statusCode, 401);
  await app.close();
});

test("sessions reject oversized client-provided session ids", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "fallback.nes",
    rom_url: "https://pxksbsloksyfwiqyfkrz.supabase.co/game.nes",
  });
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    payload: {
      clientSessionId: "s".repeat(81),
      gameId: GAME_ID,
      mode: "cloud",
    },
    url: "/sessions",
  });

  assert.equal(response.statusCode, 400);
  assert.equal(db.sessions.size, 0);
  await app.close();
});

test("anonymous users can create playable cloud sessions", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "public.gb",
    rom_url: "https://pxksbsloksyfwiqyfkrz.supabase.co/public.gb",
  });
  const build = db.gameBuilds.get(`${GAME_ID}-build`);
  if (build) {
    build.artifact_filename = "public.gb";
    build.platform_id = "gb";
    build.runtime_id = "mgba";
  }
  const app = Fastify({ logger: false });
  await registerSessionRoutes(app, {
    optionalUser: async () => undefined,
    requireUser: requireUser(USER_ID),
    supabase: db as never,
  });

  const createResponse = await app.inject({
    method: "POST",
    payload: { clientSessionId: "anonymous-session", gameId: GAME_ID },
    url: "/sessions",
  });

  assert.equal(createResponse.statusCode, 200);
  const created = createResponse.json<{
    sessionId: string;
    sessionToken: string;
    user: { id: string | null };
  }>();
  assert.equal(created.user.id, null);
  assert.equal(db.sessions.get("anonymous-session")?.user_id, null);

  const verifyResponse = await app.inject({
    method: "POST",
    payload: { sessionToken: created.sessionToken },
    url: `/sessions/${created.sessionId}/verify`,
  });

  assert.equal(verifyResponse.statusCode, 200);
  assert.equal(
    verifyResponse.json<{ boot: { runtimeId: string } }>().boot.runtimeId,
    "mgba",
  );
  assert.equal(
    verifyResponse.json<{ user: { id: string | null } }>().user.id,
    null,
  );
  await app.close();
});

test("native Linux sessions persist launch manifests without ROM targets", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "native-placeholder",
    rom_url: null,
  });
  const build = db.gameBuilds.get(`${GAME_ID}-build`);
  if (build) {
    build.artifact_filename = null;
    build.artifact_sha256 = null;
    build.artifact_size = null;
    build.artifact_url = null;
    build.launch_manifest_id = "frozen-bubble";
    build.platform_id = "linux";
    build.runtime_id = "debian-native-v1";
    build.runtime_kind = "native_linux";
  }
  const app = await createTestApp(db);

  const createResponse = await app.inject({
    method: "POST",
    payload: { clientSessionId: "native-session-1", gameId: GAME_ID, mode: "cloud" },
    url: "/sessions",
  });

  assert.equal(createResponse.statusCode, 200);
  const created = createResponse.json<{
    boot: { launchManifestId: string; romUrl: string | null };
    sessionId: string;
    sessionToken: string;
  }>();
  assert.equal(created.boot.launchManifestId, "frozen-bubble");
  assert.equal(created.boot.romUrl, null);
  assert.equal(
    createResponse.json<{ boot: { runtimeKind: string } }>().boot.runtimeKind,
    "native_linux",
  );

  const verifyResponse = await app.inject({
    method: "POST",
    payload: { sessionToken: created.sessionToken },
    url: `/sessions/${created.sessionId}/verify`,
  });

  assert.equal(verifyResponse.statusCode, 200);
  assert.equal(
    verifyResponse.json<{ boot: { launchManifestId: string } }>().boot
      .launchManifestId,
    "frozen-bubble",
  );
  assert.equal(
    verifyResponse.json<{ boot: { runtimeId: string } }>().boot.runtimeId,
    "debian-native-v1",
  );
  assert.equal(
    verifyResponse.json<{ boot: { runtimeKind: string } }>().boot.runtimeKind,
    "native_linux",
  );
  await app.close();
});

test("session creation rejects unbootable libretro build metadata", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "game.gba",
    rom_url: "https://pxksbsloksyfwiqyfkrz.supabase.co/game.gba",
  });
  const build = db.gameBuilds.get(`${GAME_ID}-build`);
  if (build) {
    build.artifact_sha256 = null;
    build.platform_id = "nes";
    build.runtime_id = "mesen";
  }
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    payload: { clientSessionId: "bad-build-session", gameId: GAME_ID },
    url: "/sessions",
  });

  assert.equal(response.statusCode, 422);
  assert.match(response.json<{ error: string }>().error, /extension .gba/);
  assert.equal(db.sessions.has("bad-build-session"), false);
  await app.close();
});

test("session creation requires immutable libretro artifact evidence", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "game.nes",
    rom_url: "https://pxksbsloksyfwiqyfkrz.supabase.co/game.nes",
  });
  const build = db.gameBuilds.get(`${GAME_ID}-build`);
  if (build) {
    build.artifact_sha256 = null;
  }
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    payload: { clientSessionId: "missing-evidence-session", gameId: GAME_ID },
    url: "/sessions",
  });

  assert.equal(response.statusCode, 422);
  assert.match(response.json<{ error: string }>().error, /checksum/);
  assert.equal(db.sessions.has("missing-evidence-session"), false);
  await app.close();
});

test("session creation rejects native builds outside the manifest contract", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "native-placeholder",
    rom_url: null,
  });
  const build = db.gameBuilds.get(`${GAME_ID}-build`);
  if (build) {
    build.artifact_filename = null;
    build.artifact_sha256 = null;
    build.artifact_size = null;
    build.artifact_url = null;
    build.launch_manifest_id = "unknown-game";
    build.platform_id = "linux";
    build.runtime_id = "debian-native-v1";
    build.runtime_kind = "native_linux";
  }
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    payload: { clientSessionId: "bad-native-session", gameId: GAME_ID },
    url: "/sessions",
  });

  assert.equal(response.statusCode, 422);
  assert.match(response.json<{ error: string }>().error, /native runtime/);
  assert.equal(db.sessions.has("bad-native-session"), false);
  await app.close();
});

test("session creation rejects games without verified rights", async () => {
  const db = new FakeSupabase();
  db.games.set(GAME_ID, {
    id: GAME_ID,
    publication_status: "published",
    rom_filename: "unreviewed.nes",
  });
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    payload: { clientSessionId: "session-unreviewed", gameId: GAME_ID },
    url: "/sessions",
  });

  assert.equal(response.statusCode, 404);
  assert.equal(db.sessions.has("session-unreviewed"), false);
  await app.close();
});

test("session ownership protects authenticated lookup", async () => {
  const db = new FakeSupabase();
  db.sessions.set("session-owned", {
    boot_rom_filename: "game.nes",
    boot_rom_url: null,
    deleted_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    game_id: GAME_ID,
    id: "session-owned",
    mode: "cloud",
    session_token_hash: "hash",
    user_id: OTHER_USER_ID,
  });
  const app = await createTestApp(db, USER_ID);

  const response = await app.inject({
    method: "GET",
    url: "/sessions/session-owned",
  });

  assert.equal(response.statusCode, 404);
  await app.close();
});

test("session lookup and verification report missing service configuration", async () => {
  const app = Fastify({ logger: false });
  await registerSessionRoutes(app, {
    requireUser: requireUser(USER_ID),
    supabase: null,
  });

  const lookupResponse = await app.inject({
    method: "GET",
    url: "/sessions/session-owned",
  });
  assert.equal(lookupResponse.statusCode, 503);

  const verifyResponse = await app.inject({
    method: "POST",
    payload: { sessionToken: "definitely-long-enough-token" },
    url: "/sessions/session-owned/verify",
  });
  assert.equal(verifyResponse.statusCode, 503);
  await app.close();
});

test("session creation cannot overwrite another user's active session", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "game.nes",
    rom_url: null,
  });
  db.sessions.set("shared-session", {
    boot_rom_filename: "original.nes",
    boot_rom_url: null,
    deleted_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    game_id: GAME_ID,
    id: "shared-session",
    mode: "cloud",
    session_token_hash: "original-hash",
    user_id: OTHER_USER_ID,
  });
  const app = await createTestApp(db, USER_ID);

  const response = await app.inject({
    method: "POST",
    payload: {
      clientSessionId: "shared-session",
      gameId: GAME_ID,
      mode: "cloud",
    },
    url: "/sessions",
  });

  assert.equal(response.statusCode, 409);
  assert.equal(db.sessions.get("shared-session")?.user_id, OTHER_USER_ID);
  assert.equal(
    db.sessions.get("shared-session")?.session_token_hash,
    "original-hash",
  );
  await app.close();
});

test("session token verification is rate limited", async () => {
  const db = new FakeSupabase();
  db.sessions.set("rate-limited-session", {
    boot_rom_filename: "game.nes",
    boot_rom_url: null,
    deleted_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    game_id: GAME_ID,
    id: "rate-limited-session",
    mode: "cloud",
    session_token_hash: "not-a-valid-sha256-hash",
    user_id: USER_ID,
  });
  const app = await createTestApp(db);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await app.inject({
      method: "POST",
      payload: { sessionToken: "definitely-not-the-token" },
      url: "/sessions/rate-limited-session/verify",
    });
    assert.equal(response.statusCode, 401);
  }

  const blockedResponse = await app.inject({
    method: "POST",
    payload: { sessionToken: "definitely-not-the-token" },
    url: "/sessions/rate-limited-session/verify",
  });
  assert.equal(blockedResponse.statusCode, 429);
  assert.equal(blockedResponse.headers["retry-after"], "60");
  await app.close();
});

test("local pairings are persisted, readable, and deletable", async () => {
  const db = new FakeSupabase();
  const app = await createTestApp(db);

  const pairResponse = await app.inject({
    method: "POST",
    payload: { engineUrl: "http://localhost:8080/" },
    url: "/local-pairings",
  });

  assert.equal(pairResponse.statusCode, 200);
  assert.equal(
    pairResponse.json<{ pairing: { engineUrl: string } }>().pairing.engineUrl,
    "http://localhost:8080",
  );

  const getResponse = await app.inject({
    method: "GET",
    url: "/local-pairings/current",
  });
  assert.equal(getResponse.statusCode, 200);

  const deleteResponse = await app.inject({
    method: "DELETE",
    url: "/local-pairings/current",
  });
  assert.equal(deleteResponse.statusCode, 204);
  assert.equal(db.pairings.has(USER_ID), false);
  await app.close();
});

test("local pairings reject non-http engine URLs", async () => {
  const db = new FakeSupabase();
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    payload: { engineUrl: "ftp://localhost:8080" },
    url: "/local-pairings",
  });

  assert.equal(response.statusCode, 400);
  assert.equal(db.pairings.size, 0);
  await app.close();
});

test("stream metrics persist and rate-limit per user session", async () => {
  const db = new FakeSupabase();
  const app = await createTestApp(db);
  const metric = {
    bitrateKbps: 1200,
    connectionState: "connected",
    fps: 60,
    iceConnectionState: "connected",
    jitterMs: 3,
    packetsLost: 0,
    sessionId: "session-1",
    timestamp: new Date().toISOString(),
  };

  const firstResponse = await app.inject({
    method: "POST",
    payload: metric,
    url: "/metrics/stream",
  });
  const secondResponse = await app.inject({
    method: "POST",
    payload: metric,
    url: "/metrics/stream",
  });

  assert.equal(firstResponse.statusCode, 202);
  assert.equal(firstResponse.json<{ accepted: boolean }>().accepted, true);
  assert.equal(secondResponse.statusCode, 202);
  assert.equal(secondResponse.json<{ accepted: boolean }>().accepted, false);
  assert.equal(db.metrics.length, 1);

  const recentResponse = await app.inject({
    method: "GET",
    url: "/metrics/stream/recent",
  });
  assert.equal(recentResponse.statusCode, 200);
  assert.equal(recentResponse.json<{ metrics: unknown[] }>().metrics.length, 1);
  await app.close();
});

test("multiplayer lobbies persist metadata without storing engine tokens", async () => {
  const db = new FakeSupabase();
  const app = await createTestApp(db);

  const saveResponse = await app.inject({
    method: "PUT",
    payload: {
      engineUrl: "http://192.168.1.10:8080/",
      exposureMode: "lan",
      gameId: GAME_ID,
      maxPlayers: 4,
      participants: [
        { displayName: "Host", playerIndex: 1, role: "host" },
        { displayName: "Guest", playerIndex: null, role: "spectator" },
      ],
    },
    url: "/multiplayer/lobbies/session-1",
  });

  assert.equal(saveResponse.statusCode, 200);
  const storedLobby = db.multiplayerLobbies.get(`${USER_ID}:session-1`);
  assert.ok(storedLobby);
  assert.equal(storedLobby.engine_url, "http://192.168.1.10:8080");
  assert.equal("engine_token" in storedLobby, false);

  const recentResponse = await app.inject({
    method: "GET",
    url: "/multiplayer/lobbies/recent",
  });
  assert.equal(recentResponse.statusCode, 200);
  assert.equal(
    recentResponse.json<{ lobbies: unknown[] }>().lobbies.length,
    1,
  );

  const deleteResponse = await app.inject({
    method: "DELETE",
    url: "/multiplayer/lobbies/session-1",
  });
  assert.equal(deleteResponse.statusCode, 204);
  assert.equal(
    db.multiplayerLobbies.get(`${USER_ID}:session-1`)?.status,
    "ended",
  );
  await app.close();
});

test("multiplayer lobbies reject unsafe engine URLs and oversized session ids", async () => {
  const db = new FakeSupabase();
  const app = await createTestApp(db);
  const lobbyPayload = {
    engineUrl: "javascript:alert(1)",
    exposureMode: "lan",
    gameId: GAME_ID,
    maxPlayers: 4,
    participants: [{ displayName: "Host", playerIndex: 1, role: "host" }],
  };

  const unsafeUrlResponse = await app.inject({
    method: "PUT",
    payload: lobbyPayload,
    url: "/multiplayer/lobbies/session-1",
  });
  const oversizedSessionResponse = await app.inject({
    method: "PUT",
    payload: {
      ...lobbyPayload,
      engineUrl: "http://192.168.1.10:8080",
    },
    url: `/multiplayer/lobbies/${"s".repeat(81)}`,
  });

  assert.equal(unsafeUrlResponse.statusCode, 400);
  assert.equal(oversizedSessionResponse.statusCode, 400);
  assert.equal(db.multiplayerLobbies.size, 0);
  await app.close();
});

test("control-plane cleanup removes expired sessions and old metrics", async () => {
  const db = new FakeSupabase();
  const app = Fastify({ logger: false });
  const now = new Date("2026-05-27T12:00:00.000Z");
  db.sessions.set("expired", {
    expires_at: "2026-05-27T11:59:00.000Z",
    id: "expired",
  });
  db.sessions.set("deleted", {
    deleted_at: "2026-05-27T11:58:00.000Z",
    expires_at: "2026-05-27T12:15:00.000Z",
    id: "deleted",
  });
  db.sessions.set("active", {
    deleted_at: null,
    expires_at: "2026-05-27T12:15:00.000Z",
    id: "active",
  });
  db.metrics.push(
    { received_at: "2026-05-20T11:59:00.000Z" },
    { received_at: "2026-05-27T11:59:00.000Z" },
  );

  await cleanupControlPlaneState(app, {
    metricRetentionDays: 7,
    now,
    supabase: db as never,
  });

  assert.equal(db.sessions.has("expired"), false);
  assert.equal(db.sessions.has("deleted"), false);
  assert.equal(db.sessions.has("active"), true);
  assert.equal(db.metrics.length, 1);
  await app.close();
});
