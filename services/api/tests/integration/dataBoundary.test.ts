import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import type { User } from "@supabase/supabase-js";
import { registerAccessLogRoutes } from "../../src/modules/observability/http/accessLogRoutes.js";
import { registerAdminSubmissionRoutes } from "../../src/modules/catalog/http/adminSubmissionRoutes.js";
import { registerAdminUserRoutes } from "../../src/modules/users/http/adminUserRoutes.js";
import { registerCatalogCandidateRoutes } from "../../src/modules/catalog/http/catalogCandidateRoutes.js";
import { registerAuthMethodsRoutes } from "../../src/modules/auth/http/authMethodsRoutes.js";
import { registerCatalogRoutes } from "../../src/modules/catalog/http/registerCatalogRoutes.js";
import { registerPlayCountRoutes } from "../../src/modules/catalog/http/playCountRoutes.js";
import { registerLocalPairingRoutes } from "../../src/modules/multiplayer/http/localPairingRoutes.js";
import { registerMeRoutes } from "../../src/modules/auth/http/meRoutes.js";
import { registerMetricRoutes } from "../../src/modules/observability/http/metricRoutes.js";
import { registerModerationRoutes } from "../../src/modules/moderation/http/registerModerationRoutes.js";
import { registerProfileRoutes } from "../../src/modules/users/http/profileRoutes.js";
import { registerSubmissionRoutes } from "../../src/modules/catalog/http/registerSubmissionRoutes.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_ID = "33333333-3333-4333-8333-333333333333";
const SUPER_ADMIN_ID = "44444444-4444-4444-8444-444444444444";
const GAME_ID = "55555555-5555-4555-8555-555555555555";
const COMMENT_ID = "66666666-6666-4666-8666-666666666666";
const REPORT_ID = "77777777-7777-4777-8777-777777777777";
const SUBMISSION_ID = "88888888-8888-4888-8888-888888888888";

type TableName =
  | "access_logs"
  | "comment_likes"
  | "comments"
  | "favorites"
  | "catalog_ingestion_candidates"
  | "game_builds"
  | "game_rights"
  | "game_submissions"
  | "games"
  | "likes"
  | "local_engine_pairings"
  | "reported_comments"
  | "stream_metrics"
  | "profiles";

type RecordRow = Record<string, unknown>;

type Filter = {
  field: string;
  op: "eq" | "gte" | "ilike" | "in" | "not_in";
  value: unknown;
};

type TestRequest = FastifyRequest & {
  user?: User;
};

class FakeSupabase {
  authListUsersCalls = 0;
  authUsers: User[] = [];
  deletedUsers: string[] = [];
  storageErrors = new Set<string>();
  signedStorageUrls: { bucket: string; expiresIn: number; path: string }[] = [];
  storageObjects: Record<string, string[]> = {
    avatars: [],
    submissions: [],
  };
  removedStorageObjects: { bucket: string; paths: string[] }[] = [];
  uploadedStorageObjects: {
    bucket: string;
    bytes: number;
    path: string;
  }[] = [];
  rows: Record<TableName, RecordRow[]> = {
    access_logs: [],
    catalog_ingestion_candidates: [],
    comment_likes: [],
    comments: [],
    favorites: [],
    game_builds: [],
    game_rights: [],
    game_submissions: [],
    games: [],
    likes: [],
    local_engine_pairings: [],
    reported_comments: [],
    stream_metrics: [],
    profiles: [],
  };
  rpcCalls: { fn: string; params: RecordRow }[] = [];
  rpcErrors = new Map<string, Error>();
  auth = {
    admin: {
      deleteUser: async (userId: string) => {
        this.deletedUsers.push(userId);
        return { error: null };
      },
      listUsers: async ({
        page = 1,
        perPage = 1000,
      }: {
        page?: number;
        perPage?: number;
      } = {}) => {
        this.authListUsersCalls += 1;
        const start = (page - 1) * perPage;
        return {
          data: { users: this.authUsers.slice(start, start + perPage) },
          error: null,
        };
      },
    },
    getUser: async (token: string) => ({
      data: {
        user: this.authUsers.find((user) => user.id === token) || null,
      },
      error: null,
    }),
  };
  storage = {
    from: (bucket: string) => ({
      list: async (prefix: string) => {
        if (this.storageErrors.has(bucket)) {
          return { data: null, error: new Error(`${bucket} storage unavailable`) };
        }

        const childEntries = new Map<string, { id: string | null; name: string }>();
        for (const path of this.storageObjects[bucket] || []) {
          if (!path.startsWith(`${prefix}/`)) continue;

          const remainingPath = path.slice(prefix.length + 1);
          const [name, ...rest] = remainingPath.split("/");
          childEntries.set(name, {
            id: rest.length === 0 ? path : null,
            name,
          });
        }

        return { data: [...childEntries.values()], error: null };
      },
      remove: async (paths: string[]) => {
        if (this.storageErrors.has(bucket)) {
          return { data: null, error: new Error(`${bucket} storage unavailable`) };
        }

        const pathSet = new Set(paths);
        this.storageObjects[bucket] = (this.storageObjects[bucket] || []).filter(
          (path) => !pathSet.has(path),
        );
        this.removedStorageObjects.push({ bucket, paths });
        return { data: paths, error: null };
      },
      upload: async (path: string, body: Blob | Buffer | Uint8Array) => {
        if (this.storageErrors.has(bucket)) {
          return { data: null, error: new Error(`${bucket} storage unavailable`) };
        }

        const bytes =
          body instanceof Blob
            ? body.size
            : Buffer.isBuffer(body)
              ? body.length
              : body.byteLength;
        this.storageObjects[bucket] = [
          ...(this.storageObjects[bucket] || []).filter(
            (existingPath) => existingPath !== path,
          ),
          path,
        ];
        this.uploadedStorageObjects.push({ bucket, bytes, path });
        return { data: { path }, error: null };
      },
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://storage.example.test/${bucket}/${path}` },
      }),
      createSignedUrl: async (path: string, expiresIn: number) => {
        if (this.storageErrors.has(bucket)) {
          return { data: null, error: new Error(`${bucket} storage unavailable`) };
        }

        this.signedStorageUrls.push({ bucket, expiresIn, path });
        return {
          data: {
            signedUrl: `https://storage.example.test/object/sign/${bucket}/${path}?token=signed-${expiresIn}`,
          },
          error: null,
        };
      },
    }),
  };

  from(table: TableName) {
    return new FakeQueryBuilder(this, table);
  }

  async rpc(fn: string, params: RecordRow) {
    this.rpcCalls.push({ fn, params });
    const rpcError = this.rpcErrors.get(fn);
    if (rpcError) return { data: null, error: rpcError };

    if (fn === "set_game_reaction") {
      this.setReaction("likes", "game_id", params.p_game_id, params);
      return { data: null, error: null };
    }

    if (fn === "set_comment_reaction") {
      this.setReaction("comment_likes", "comment_id", params.p_comment_id, params);
      return { data: null, error: null };
    }

    if (fn === "admin_access_log_summary") {
      const page = Math.max(1, Number(params.p_page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(params.p_page_size || 25)));
      const profiles = new Map(
        this.rows.profiles.map((profile) => [
          profile.id,
          profile.username || null,
        ]),
      );
      const grouped = new Map<
        string,
        {
          first_seen_at: string;
          last_seen_at: string;
          sessions_count: number;
          user_id: string | null;
          username: unknown;
        }
      >();

      for (const log of this.rows.access_logs) {
        const userId = typeof log.user_id === "string" ? log.user_id : null;
        const groupKey = userId || "guest";
        const createdAt = String(log.created_at);
        const lastSeenAt = String(log.last_seen_at || log.created_at);
        const existing = grouped.get(groupKey);
        if (existing) {
          existing.first_seen_at =
            createdAt < existing.first_seen_at ? createdAt : existing.first_seen_at;
          existing.last_seen_at =
            lastSeenAt > existing.last_seen_at ? lastSeenAt : existing.last_seen_at;
          existing.sessions_count += 1;
        } else {
          grouped.set(groupKey, {
            first_seen_at: createdAt,
            last_seen_at: lastSeenAt,
            sessions_count: 1,
            user_id: userId,
            username: userId ? profiles.get(userId) || null : null,
          });
        }
      }

      const summaries = [...grouped.values()].sort((left, right) =>
        right.last_seen_at.localeCompare(left.last_seen_at),
      );
      const totalCount = summaries.length;
      const start = (page - 1) * pageSize;
      return {
        data: summaries.slice(start, start + pageSize).map((summary) => ({
          ...summary,
          total_count: totalCount,
        })),
        error: null,
      };
    }

    if (fn === "published_catalog_games") {
      const gameId =
        typeof params.p_game_id === "string" ? params.p_game_id : null;
      const limit = Math.min(5000, Math.max(0, Number(params.p_limit || 1000)));
      const order =
        params.p_order === "play_count_desc" ? "play_count_desc" : "title";
      const search =
        typeof params.p_search === "string" ? params.p_search.trim() : "";
      const rows = this.getPublishedCatalogGameRows(gameId, order, search).slice(
        0,
        limit,
      );
      return { data: rows, error: null };
    }

    return { data: null, error: null };
  }

  private getPublishedCatalogGameRows(
    gameId: string | null,
    order: "play_count_desc" | "title",
    search: string,
  ) {
    const searchTokens = search.toLowerCase().split(/\s+/).filter(Boolean);
    return this.rows.games
      .filter(
        (game) =>
          game.publication_status === "published" &&
          (!gameId || game.id === gameId) &&
          searchTokens.every((token) =>
            [
              game.title,
              game.author_name,
              game.developer_name,
            ].some((value) => String(value || "").toLowerCase().includes(token)),
          ),
      )
      .map((game) => {
        const verifiedBuilds = this.rows.game_builds.filter((build) => {
          if (build.game_id !== game.id || build.enabled !== true) return false;
          return this.rows.game_rights.some(
            (rights) =>
              rights.game_id === game.id &&
              rights.verified_at &&
              rights.noncommercial_hosting_allowed === true &&
              (!rights.game_build_id || rights.game_build_id === build.id),
          );
        });

        if (verifiedBuilds.length !== 1) return null;

        return {
          ...game,
          game_builds: verifiedBuilds,
          game_rights: this.rows.game_rights.filter(
            (rights) =>
              rights.game_id === game.id &&
              rights.verified_at &&
              rights.noncommercial_hosting_allowed === true,
          ),
        };
      })
      .filter((game): game is RecordRow => Boolean(game))
      .sort((left, right) => {
        if (order === "play_count_desc") {
          const playDiff =
            Number(right.play_count || 0) - Number(left.play_count || 0);
          if (playDiff !== 0) return playDiff;
        }

        return String(left.title || "").localeCompare(String(right.title || ""));
      });
  }

  private setReaction(
    table: "comment_likes" | "likes",
    targetField: "comment_id" | "game_id",
    targetId: unknown,
    params: RecordRow,
  ) {
    const existing = this.rows[table].find(
      (row) =>
        row.user_id === params.p_user_id && row[targetField] === targetId,
    );

    if (params.p_is_like === null) {
      this.rows[table] = this.rows[table].filter((row) => row !== existing);
    } else if (existing) {
      existing.is_like = params.p_is_like;
    } else {
      this.rows[table].push({
        [targetField]: targetId,
        is_like: params.p_is_like,
        user_id: params.p_user_id,
      });
    }
  }
}

class FakeQueryBuilder {
  private action: "delete" | "insert" | "select" | "update" | "upsert" | null =
    null;
  private filters: Filter[] = [];
  private limitCount: number | null = null;
  private orderConfig: { ascending: boolean; field: string } | null = null;
  private payload: RecordRow | null = null;
  private rangeConfig: { end: number; start: number } | null = null;
  private shouldCount = false;

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: TableName,
  ) {}

  select(_columns?: string, options?: { count?: "exact" }) {
    this.action = this.action || "select";
    this.shouldCount = options?.count === "exact";
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, op: "eq", value });
    return this;
  }

  gte(field: string, value: unknown) {
    this.filters.push({ field, op: "gte", value });
    return this;
  }

  ilike(field: string, value: string) {
    this.filters.push({ field, op: "ilike", value });
    return this;
  }

  in(field: string, value: unknown[]) {
    this.filters.push({ field, op: "in", value });
    return this;
  }

  not(field: string, operator: "in", value: string) {
    if (operator === "in") {
      this.filters.push({
        field,
        op: "not_in",
        value: value.replace(/^\(|\)$/g, "").split(","),
      });
    }
    return this;
  }

  order(field: string, options: { ascending: boolean } = { ascending: true }) {
    this.orderConfig = { ascending: options.ascending, field };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  returns<T>() {
    return this.execute().then((result) => ({
      data: result.data as T,
      error: result.error,
    }));
  }

  range(start: number, end: number) {
    this.rangeConfig = { end, start };
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

  upsert(payload: RecordRow, _options?: RecordRow) {
    this.action = "upsert";
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  async single<T>() {
    const rows = await this.executeRows();
    return { data: (rows[0] as T) || null, error: rows[0] ? null : new Error("Not found") };
  }

  async maybeSingle<T>() {
    const rows = await this.executeRows();
    return { data: (rows[0] as T) || null, error: null };
  }

  then<TResult1 = { data: unknown; error: Error | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: Error | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute()
      .then(onfulfilled || undefined)
      .catch(onrejected || undefined);
  }

  private async execute() {
    const rows = await this.executeRows();
    return {
      count: this.shouldCount ? this.filteredRows().length : null,
      data: rows,
      error: null,
    };
  }

  private async executeRows() {
    if (this.action === "insert" && this.payload) {
      this.db.rows[this.table].push({
        id: `${this.table}-${this.db.rows[this.table].length + 1}`,
        ...this.payload,
      });
    }

    if (this.action === "upsert" && this.payload) {
      const existing =
        this.filteredRows()[0] ||
        (this.table === "local_engine_pairings"
          ? this.db.rows[this.table].find(
              (row) => row.user_id === this.payload?.user_id,
            )
          : this.table === "access_logs"
            ? this.db.rows[this.table].find(
                (row) => row.session_id === this.payload?.session_id,
              )
          : undefined);
      if (existing) Object.assign(existing, this.payload);
      else {
        this.db.rows[this.table].push({
          created_at: new Date().toISOString(),
          id: `${this.table}-${this.db.rows[this.table].length + 1}`,
          ...this.payload,
        });
      }
    }

    if (this.action === "update" && this.payload) {
      for (const row of this.filteredRows()) {
        Object.assign(row, this.payload);
      }
    }

    if (this.action === "delete") {
      const rowsToDelete = new Set(this.filteredRows());
      this.db.rows[this.table] = this.db.rows[this.table].filter(
        (row) => !rowsToDelete.has(row),
      );
      return [];
    }

    let rows = this.filteredRows();
    if (this.orderConfig) {
      rows = [...rows].sort((left, right) => {
        const leftRawValue = left[this.orderConfig?.field || ""];
        const rightRawValue = right[this.orderConfig?.field || ""];
        if (
          typeof leftRawValue === "number" &&
          typeof rightRawValue === "number"
        ) {
          return this.orderConfig?.ascending
            ? leftRawValue - rightRawValue
            : rightRawValue - leftRawValue;
        }

        const leftValue = String(leftRawValue || "");
        const rightValue = String(rightRawValue || "");
        return this.orderConfig?.ascending
          ? leftValue.localeCompare(rightValue)
          : rightValue.localeCompare(leftValue);
      });
    }
    if (this.rangeConfig) {
      rows = rows.slice(this.rangeConfig.start, this.rangeConfig.end + 1);
    }
    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return rows;
  }

  private filteredRows() {
    return this.db.rows[this.table].filter((row) =>
      this.filters.every((filter) => {
        const rowValue = getNestedValue(row, filter.field);
        if (filter.op === "gte") {
          return String(rowValue) >= String(filter.value);
        }
        if (filter.op === "ilike") {
          const pattern = String(filter.value)
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replaceAll("%", ".*");
          return new RegExp(`^${pattern}$`, "i").test(
            String(rowValue || ""),
          );
        }
        if (filter.op === "in" && Array.isArray(filter.value)) {
          return filter.value.includes(rowValue);
        }
        if (filter.op === "not_in" && Array.isArray(filter.value)) {
          return !filter.value.includes(rowValue);
        }

        return rowValue === filter.value;
      }),
    );
  }
}

function getNestedValue(row: RecordRow, field: string): unknown {
  return field
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      row,
    );
}

function requireUser(userId = USER_ID) {
  return async (request: FastifyRequest) => {
    const testRequest = request as TestRequest;
    testRequest.user = {
      app_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
      email: `${userId}@example.com`,
      id: userId,
      last_sign_in_at: new Date().toISOString(),
      user_metadata: {},
    };
    return undefined;
  };
}

function sha256(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function validNesRom() {
  return Buffer.concat([Buffer.from([0x4e, 0x45, 0x53, 0x1a]), Buffer.alloc(32)]);
}

function validSnesRom() {
  const bytes = Buffer.alloc(0x10000);
  const headerOffset = 0x7fc0;
  Buffer.from("PIXELATED SNES TEST  ").copy(bytes, headerOffset);
  bytes[headerOffset + 0x15] = 0x20;
  bytes[headerOffset + 0x16] = 0x00;
  bytes[headerOffset + 0x17] = 0x09;
  bytes.writeUInt16LE(0xedcb, headerOffset + 0x1c);
  bytes.writeUInt16LE(0x1234, headerOffset + 0x1e);
  return bytes;
}

function validGameGearRom() {
  const bytes = Buffer.alloc(0x8000);
  Buffer.from("TMR SEGA").copy(bytes, 0x7ff0);
  return bytes;
}

function validGenesisRom() {
  const bytes = Buffer.alloc(0x200);
  Buffer.from("SEGA MEGA DRIVE").copy(bytes, 0x100);
  return bytes;
}

async function createDataBoundaryApp(
  db: FakeSupabase,
  userId = USER_ID,
  artifactBytes = Buffer.from("test-artifact"),
  extraOptions: RecordRow = {},
) {
  const app = Fastify({ logger: false });
  const options = {
    ...extraOptions,
    fetchArtifact: async () => new Response(artifactBytes),
    requireUser: requireUser(userId),
    supabase: db as never,
    supabaseAnon: db as never,
  };

  await registerAccessLogRoutes(app, options);
  await registerAdminUserRoutes(app, options);
  await registerCatalogCandidateRoutes(app, options);
  await registerAuthMethodsRoutes(app);
  await registerCatalogRoutes(app, options);
  await registerPlayCountRoutes(app, options);
  await registerLocalPairingRoutes(app, options);
  await registerMeRoutes(app, options);
  await registerMetricRoutes(app, options);
  await registerModerationRoutes(app, options);
  await registerProfileRoutes(app, options);
  await registerAdminSubmissionRoutes(app, options);
  await registerSubmissionRoutes(app, {
    ...options,
    notifySubmission:
      typeof extraOptions.notifySubmission === "function"
        ? (extraOptions.notifySubmission as never)
        : async () => undefined,
  });
  return app;
}

function seedProfiles(db: FakeSupabase) {
  db.rows.profiles.push(
    { id: USER_ID, role: "user", username: "player" },
    { id: OTHER_USER_ID, role: "user", username: "other" },
    { id: ADMIN_ID, role: "admin", username: "admin" },
    { id: SUPER_ADMIN_ID, role: "super_admin", username: "root" },
  );
}

function seedPublishedGames(db: FakeSupabase, ...games: RecordRow[]) {
  for (const game of games) {
    const gameId = String(game.id);
    const buildId = `${gameId}-build`;
    db.rows.games.push({
      publication_status: "published",
      rom_filename: `${gameId}.nes`,
      ...game,
    });
    db.rows.game_builds.push({
      artifact_filename: game.rom_filename || `${gameId}.nes`,
      artifact_url: game.rom_url || null,
      enabled: true,
      game_id: gameId,
      id: buildId,
      platform_id: "nes",
      runtime_id: "mesen",
      runtime_kind: "libretro",
    });
    db.rows.game_rights.push({
      attribution_text: `${game.title || gameId} test attribution`,
      code_license_spdx: "MIT",
      game_build_id: buildId,
      game_id: gameId,
      license_url: "https://example.test/license",
      noncommercial_hosting_allowed: true,
      source_url: "https://example.test/source",
      verified_at: new Date().toISOString(),
    });
  }
}

function validSubmissionPayload(overrides: RecordRow = {}) {
  return {
    assetLicenseSpdx: null,
    attributionText: "Tiny Quest by Pixel Dev",
    authorName: "Pixel Dev",
    bannerUrl: null,
    codeLicenseSpdx: null,
    coverUrl: null,
    description: "A small GBA game",
    email: "dev@example.com",
    gameTitle: "Tiny Quest",
    hostingConfirmed: true,
    hostingPermission: "creator_permission",
    licenseUrl: null,
    noReleaseUrlExplanation: null,
    originalReleaseUrl: "https://example.com/tiny-quest",
    ownershipConfirmed: true,
    ownershipStatus: "creator",
    permissionEvidenceUrl: null,
    publicLicenseScope: "none_owned",
    rightsConfirmed: true,
    rightsNotes: null,
    sourceRepoUrl: null,
    thirdPartyContent: "no",
    ...overrides,
  };
}

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
    /^https:\/\/storage\.example\.test\/catalog_artifacts\/homebrew-hub\//,
  );
  assert.equal(db.uploadedStorageObjects.length, 2);
  assert.equal(db.uploadedStorageObjects[0]?.bucket, "catalog_artifacts");
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
    /^https:\/\/storage\.example\.test\/catalog_artifacts\/curated-roms\//,
  );
  assert.equal(db.rows.game_builds.length, 1);
  assert.equal(db.rows.game_builds[0]?.runtime_id, "bsnes");
  assert.equal(db.rows.game_builds[0]?.platform_id, "snes");
  assert.equal(db.rows.game_builds[0]?.artifact_filename, "demo.sfc");
  assert.match(
    String(db.rows.game_builds[0]?.artifact_url),
    /^https:\/\/storage\.example\.test\/catalog_artifacts\/curated-roms\//,
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

test("public account discovery endpoint returns an enumeration-safe response", async () => {
  const db = new FakeSupabase();
  db.authUsers.push({
    app_metadata: { providers: ["google"] },
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email: "existing@example.com",
    id: USER_ID,
    user_metadata: {},
  });
  const app = await createDataBoundaryApp(db);

  const existingResponse = await app.inject({
    method: "POST",
    payload: { email: "existing@example.com" },
    url: "/auth/account-methods",
  });
  const missingResponse = await app.inject({
    method: "POST",
    payload: { email: "missing@example.com" },
    url: "/auth/account-methods",
  });

  assert.equal(existingResponse.statusCode, 200);
  assert.deepEqual(existingResponse.json(), missingResponse.json());
  assert.deepEqual(existingResponse.json(), {
    exists: false,
    hasEmailProvider: false,
    providers: [],
  });
  assert.equal(db.authListUsersCalls, 0);
  await app.close();
});

test("comment delete is scoped to owner unless actor is admin", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.rows.comments.push({
    content: "owned by somebody else",
    game_id: GAME_ID,
    id: COMMENT_ID,
    user_id: OTHER_USER_ID,
  });

  const userApp = await createDataBoundaryApp(db, USER_ID);
  const deniedDelete = await userApp.inject({
    method: "DELETE",
    url: `/comments/${COMMENT_ID}`,
  });
  assert.equal(deniedDelete.statusCode, 204);
  assert.equal(db.rows.comments.length, 1);
  await userApp.close();

  const adminApp = await createDataBoundaryApp(db, ADMIN_ID);
  const adminDelete = await adminApp.inject({
    method: "DELETE",
    url: `/comments/${COMMENT_ID}`,
  });
  assert.equal(adminDelete.statusCode, 204);
  assert.equal(db.rows.comments.length, 0);
  await adminApp.close();
});

test("game reactions replace atomically and preserve prior state on failure", async () => {
  const db = new FakeSupabase();
  db.rows.likes.push({
    game_id: GAME_ID,
    is_like: false,
    user_id: USER_ID,
  });
  const app = await createDataBoundaryApp(db, USER_ID);

  const response = await app.inject({
    method: "PUT",
    payload: { isLike: true },
    url: `/games/${GAME_ID}/reaction`,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(db.rows.likes.length, 1);
  assert.equal(db.rows.likes[0]?.is_like, true);

  db.rpcErrors.set("set_game_reaction", new Error("atomic write failed"));
  const failedResponse = await app.inject({
    method: "PUT",
    payload: { isLike: false },
    url: `/games/${GAME_ID}/reaction`,
  });
  assert.equal(failedResponse.statusCode, 500);
  assert.equal(db.rows.likes.length, 1);
  assert.equal(db.rows.likes[0]?.is_like, true);
  await app.close();
});

test("comment reactions reject self-reactions and replace atomically", async () => {
  const db = new FakeSupabase();
  db.rows.comments.push({
    content: "hello",
    game_id: GAME_ID,
    id: COMMENT_ID,
    user_id: OTHER_USER_ID,
  });
  db.rows.comment_likes.push({
    comment_id: COMMENT_ID,
    is_like: false,
    user_id: USER_ID,
  });
  const app = await createDataBoundaryApp(db, USER_ID);

  const response = await app.inject({
    method: "PUT",
    payload: { isLike: true },
    url: `/comments/${COMMENT_ID}/reaction`,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(db.rows.comment_likes.length, 1);
  assert.equal(db.rows.comment_likes[0]?.is_like, true);

  db.rpcErrors.set("set_comment_reaction", new Error("atomic write failed"));
  const failedResponse = await app.inject({
    method: "PUT",
    payload: { isLike: false },
    url: `/comments/${COMMENT_ID}/reaction`,
  });
  assert.equal(failedResponse.statusCode, 500);
  assert.equal(db.rows.comment_likes.length, 1);
  assert.equal(db.rows.comment_likes[0]?.is_like, true);
  db.rpcErrors.delete("set_comment_reaction");

  const selfApp = await createDataBoundaryApp(db, OTHER_USER_ID);
  const selfResponse = await selfApp.inject({
    method: "PUT",
    payload: { isLike: true },
    url: `/comments/${COMMENT_ID}/reaction`,
  });
  assert.equal(selfResponse.statusCode, 403);
  await app.close();
  await selfApp.close();
});

test("comments use one-based pagination with configurable page size", async () => {
  const db = new FakeSupabase();
  for (let index = 0; index < 5; index += 1) {
    db.rows.comments.push({
      content: `comment ${index}`,
      created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      game_id: GAME_ID,
      id: `66666666-6666-4666-8666-66666666666${index}`,
      user_id: USER_ID,
    });
  }
  const app = await createDataBoundaryApp(db);

  const firstResponse = await app.inject({
    method: "GET",
    url: `/games/${GAME_ID}/comments?page=1&pageSize=2`,
  });
  assert.equal(firstResponse.statusCode, 200);
  assert.deepEqual(
    firstResponse
      .json<{ comments: { content: string }[]; hasMore: boolean }>()
      .comments.map((comment) => comment.content),
    ["comment 4", "comment 3"],
  );
  assert.equal(
    firstResponse.json<{ hasMore: boolean }>().hasMore,
    true,
  );

  const secondResponse = await app.inject({
    method: "GET",
    url: `/games/${GAME_ID}/comments?page=2&pageSize=2`,
  });
  assert.equal(secondResponse.statusCode, 200);
  assert.deepEqual(
    secondResponse
      .json<{ comments: { content: string }[]; hasMore: boolean }>()
      .comments.map((comment) => comment.content),
    ["comment 2", "comment 1"],
  );
  assert.equal(secondResponse.json<{ hasMore: boolean }>().hasMore, true);

  const thirdResponse = await app.inject({
    method: "GET",
    url: `/games/${GAME_ID}/comments?page=3&pageSize=2`,
  });
  assert.equal(thirdResponse.statusCode, 200);
  assert.deepEqual(
    thirdResponse
      .json<{ comments: { content: string }[]; hasMore: boolean }>()
      .comments.map((comment) => comment.content),
    ["comment 0"],
  );
  assert.equal(thirdResponse.json<{ hasMore: boolean }>().hasMore, false);
  await app.close();
});

test("write-heavy social and play routes are rate limited per user", async () => {
  const commentsDb = new FakeSupabase();
  const commentsApp = await createDataBoundaryApp(commentsDb, USER_ID);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await commentsApp.inject({
      method: "POST",
      payload: { content: `comment ${attempt}` },
      url: `/games/${GAME_ID}/comments`,
    });
    assert.equal(response.statusCode, 201);
  }
  const blockedComment = await commentsApp.inject({
    method: "POST",
    payload: { content: "blocked comment" },
    url: `/games/${GAME_ID}/comments`,
  });
  assert.equal(blockedComment.statusCode, 429);
  assert.equal(commentsDb.rows.comments.length, 10);
  await commentsApp.close();

  const reportsDb = new FakeSupabase();
  const reportsApp = await createDataBoundaryApp(reportsDb, USER_ID);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await reportsApp.inject({
      method: "POST",
      payload: { reason: `report ${attempt}` },
      url: `/moderation/comments/${COMMENT_ID}/report`,
    });
    assert.equal(response.statusCode, 200);
  }
  const blockedReport = await reportsApp.inject({
    method: "POST",
    payload: { reason: "blocked report" },
    url: `/moderation/comments/${COMMENT_ID}/report`,
  });
  assert.equal(blockedReport.statusCode, 429);
  assert.equal(reportsDb.rows.reported_comments.length, 10);
  await reportsApp.close();

  const reactionsDb = new FakeSupabase();
  const reactionsApp = await createDataBoundaryApp(reactionsDb, USER_ID);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await reactionsApp.inject({
      method: "PUT",
      payload: { isLike: attempt % 2 === 0 },
      url: `/games/${GAME_ID}/reaction`,
    });
    assert.equal(response.statusCode, 200);
  }
  const blockedReaction = await reactionsApp.inject({
    method: "PUT",
    payload: { isLike: true },
    url: `/games/${GAME_ID}/reaction`,
  });
  assert.equal(blockedReaction.statusCode, 429);
  assert.equal(
    reactionsDb.rpcCalls.filter((call) => call.fn === "set_game_reaction").length,
    120,
  );
  await reactionsApp.close();

  const playsDb = new FakeSupabase();
  const playsApp = await createDataBoundaryApp(playsDb, USER_ID);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await playsApp.inject({
      method: "POST",
      url: `/games/${GAME_ID}/play-count`,
    });
    assert.equal(response.statusCode, 200);
  }
  const blockedPlay = await playsApp.inject({
    method: "POST",
    url: `/games/${GAME_ID}/play-count`,
  });
  assert.equal(blockedPlay.statusCode, 429);
  assert.equal(
    playsDb.rpcCalls.filter((call) => call.fn === "increment_play_count").length,
    60,
  );
  await playsApp.close();
});

test("profile routes update only the authenticated profile and safely delete auth user", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.storageObjects.avatars.push(`${USER_ID}/avatar.png`);
  db.storageObjects.submissions.push(
    `${USER_ID}/roms/tiny.nes`,
    `${USER_ID}/covers/cover.png`,
    `${OTHER_USER_ID}/roms/other.nes`,
  );
  const app = await createDataBoundaryApp(db, USER_ID);

  const updateResponse = await app.inject({
    method: "PATCH",
    payload: {
      avatarUrl: "https://example.com/avatar.png",
      username: "new-name",
    },
    url: "/profile",
  });
  assert.equal(updateResponse.statusCode, 200);
  assert.equal(db.rows.profiles.find((row) => row.id === USER_ID)?.username, "new-name");
  assert.equal(db.rows.profiles.find((row) => row.id === OTHER_USER_ID)?.username, "other");

  const deleteResponse = await app.inject({
    method: "DELETE",
    payload: { confirmation: "DELETE" },
    url: "/me/account",
  });
  assert.equal(deleteResponse.statusCode, 204);
  assert.deepEqual(db.deletedUsers, [USER_ID]);
  assert.deepEqual(db.storageObjects.avatars, []);
  assert.deepEqual(db.storageObjects.submissions, [`${OTHER_USER_ID}/roms/other.nes`]);
  await app.close();
});

test("account deletion blocks privileged roles, stale sessions, and invalid confirmation", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);

  const invalidConfirmationApp = await createDataBoundaryApp(db, USER_ID);
  const invalidConfirmation = await invalidConfirmationApp.inject({
    method: "DELETE",
    payload: { confirmation: "delete" },
    url: "/me/account",
  });
  assert.equal(invalidConfirmation.statusCode, 400);
  await invalidConfirmationApp.close();

  for (const privilegedUserId of [ADMIN_ID, SUPER_ADMIN_ID]) {
    const privilegedApp = await createDataBoundaryApp(db, privilegedUserId);
    const privilegedDelete = await privilegedApp.inject({
      method: "DELETE",
      payload: { confirmation: "DELETE" },
      url: "/me/account",
    });
    assert.equal(privilegedDelete.statusCode, 403);
    assert.deepEqual(db.deletedUsers, []);
    await privilegedApp.close();
  }

  const staleApp = Fastify({ logger: false });
  await registerProfileRoutes(staleApp, {
    requireUser: async (request) => {
      (request as TestRequest).user = {
        app_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
        email: "stale@example.com",
        id: USER_ID,
        last_sign_in_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
        user_metadata: {},
      };
    },
    supabase: db as never,
  });
  const staleDelete = await staleApp.inject({
    method: "DELETE",
    payload: { confirmation: "DELETE" },
    url: "/me/account",
  });
  assert.equal(staleDelete.statusCode, 403);
  assert.equal(
    staleDelete.json<{ code: string }>().code,
    "recent_sign_in_required",
  );
  assert.deepEqual(db.deletedUsers, []);
  await staleApp.close();
});

test("account deletion aborts when owned storage cannot be cleaned", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.storageErrors.add("submissions");
  const app = await createDataBoundaryApp(db, USER_ID);

  const response = await app.inject({
    method: "DELETE",
    payload: { confirmation: "DELETE" },
    url: "/me/account",
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(db.deletedUsers, []);
  await app.close();
});

test("account deletion attempts are rate limited", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const app = await createDataBoundaryApp(db, USER_ID);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await app.inject({
      method: "DELETE",
      payload: { confirmation: "not-delete" },
      url: "/me/account",
    });
    assert.equal(response.statusCode, 400);
  }

  const blockedResponse = await app.inject({
    method: "DELETE",
    payload: { confirmation: "DELETE" },
    url: "/me/account",
  });
  assert.equal(blockedResponse.statusCode, 429);
  assert.deepEqual(db.deletedUsers, []);
  await app.close();
});

test("admin user and access-log routes require privileged roles", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.rows.access_logs.push({
    created_at: "2026-05-27T00:00:00.000Z",
    id: "log-1",
    path: "/",
    user_id: USER_ID,
  });

  const userApp = await createDataBoundaryApp(db, USER_ID);
  assert.equal(
    (await userApp.inject({ method: "GET", url: "/admin/users" })).statusCode,
    403,
  );
  assert.equal(
    (await userApp.inject({ method: "GET", url: "/admin/access-logs" })).statusCode,
    403,
  );
  await userApp.close();

  const superAdminApp = await createDataBoundaryApp(db, SUPER_ADMIN_ID);
  const usersResponse = await superAdminApp.inject({
    method: "GET",
    url: "/admin/users",
  });
  assert.equal(usersResponse.statusCode, 200);

  const updateResponse = await superAdminApp.inject({
    method: "PATCH",
    payload: { is_banned: true },
    url: `/admin/users/${USER_ID}`,
  });
  assert.equal(updateResponse.statusCode, 200);
  assert.equal(db.rows.profiles.find((row) => row.id === USER_ID)?.is_banned, true);

  const logsResponse = await createDataBoundaryApp(db, ADMIN_ID).then((app) =>
    app.inject({ method: "GET", url: "/admin/access-logs" }).finally(() => app.close()),
  );
  assert.equal(logsResponse.statusCode, 200);
  assert.equal(logsResponse.json<{ logs: unknown[]; total: number }>().logs.length, 1);
  assert.equal(logsResponse.json<{ logs: unknown[]; total: number }>().total, 1);
  await superAdminApp.close();
});

test("access logs upsert browser sessions", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.authUsers.push({
    app_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    id: USER_ID,
    user_metadata: {},
  } as User);
  const app = await createDataBoundaryApp(db, USER_ID);

  const firstResponse = await app.inject({
    headers: { authorization: `Bearer ${USER_ID}` },
    method: "POST",
    payload: { path: "/", sessionId: "browser-session-1" },
    url: "/access-logs",
  });
  const secondResponse = await app.inject({
    headers: { authorization: `Bearer ${USER_ID}` },
    method: "POST",
    payload: { path: "/play/test-game", sessionId: "browser-session-1" },
    url: "/access-logs",
  });

  assert.equal(firstResponse.statusCode, 202);
  assert.equal(secondResponse.statusCode, 202);
  assert.equal(db.rows.access_logs.length, 1);
  assert.equal(db.rows.access_logs[0]?.session_id, "browser-session-1");
  assert.equal(db.rows.access_logs[0]?.path, "/play/test-game");
  assert.equal(db.rows.access_logs[0]?.access_count, 2);
  assert.equal(db.rows.access_logs[0]?.user_id, USER_ID);
  await app.close();
});

test("admin access logs summarize users and sessions server-side", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  for (let index = 1; index <= 30; index += 1) {
    db.rows.access_logs.push({
      created_at: `2026-05-27T00:${String(index).padStart(2, "0")}:00.000Z`,
      id: `log-${index}`,
      last_seen_at: `2026-05-27T01:${String(index).padStart(2, "0")}:00.000Z`,
      path: `/page-${index}`,
      session_id: `session-${index}`,
      user_id:
        index <= 12 ? USER_ID : index <= 20 ? OTHER_USER_ID : null,
    });
  }
  const app = await createDataBoundaryApp(db, ADMIN_ID);

  const response = await app.inject({
    method: "GET",
    url: "/admin/access-logs?page=1&pageSize=10",
  });

  assert.equal(response.statusCode, 200);
  const body = response.json<{
    logs: {
      sessions_count: number;
      user_id: string | null;
      username: string | null;
    }[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>();
  assert.equal(body.logs.length, 3);
  assert.equal(body.logs[0]?.user_id, null);
  assert.equal(body.logs[0]?.sessions_count, 10);
  assert.equal(body.logs[1]?.user_id, OTHER_USER_ID);
  assert.equal(body.logs[1]?.sessions_count, 8);
  assert.equal(body.logs[2]?.username, "player");
  assert.equal(body.logs[2]?.sessions_count, 12);
  assert.equal(body.page, 1);
  assert.equal(body.pageSize, 10);
  assert.equal(body.total, 3);
  assert.equal(body.totalPages, 1);
  await app.close();
});

test("admin users are paginated and searchable server-side", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  for (let index = 1; index <= 30; index += 1) {
    db.rows.profiles.push({
      created_at: `2026-05-${String(index).padStart(2, "0")}T00:00:00.000Z`,
      id: `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`,
      is_banned: false,
      role: "user",
      username: index % 2 === 0 ? `player-${index}` : `viewer-${index}`,
    });
  }
  const app = await createDataBoundaryApp(db, SUPER_ADMIN_ID);

  const response = await app.inject({
    method: "GET",
    url: "/admin/users?page=2&pageSize=5&search=player-",
  });

  assert.equal(response.statusCode, 200);
  const body = response.json<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    users: { username: string }[];
  }>();
  assert.equal(body.users.length, 5);
  assert.deepEqual(
    body.users.map((user) => user.username),
    ["player-20", "player-18", "player-16", "player-14", "player-12"],
  );
  assert.equal(body.page, 2);
  assert.equal(body.pageSize, 5);
  assert.equal(body.total, 15);
  assert.equal(body.totalPages, 3);
  await app.close();
});

test("me permissions are loaded from backend-owned profile state", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  Object.assign(db.rows.profiles.find((row) => row.id === ADMIN_ID) || {}, {
    avatar_url: "https://example.com/avatar.png",
    email: "admin@example.com",
    is_banned: false,
    is_developer: true,
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID);

  const response = await app.inject({ method: "GET", url: "/me/permissions" });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.json<{ abilities: { canAccessAdmin: boolean } }>().abilities
      .canAccessAdmin,
    true,
  );
  assert.equal(
    response.json<{ profile: { username: string } }>().profile.username,
    "admin",
  );
  await app.close();
});

test("moderation reports are created and resolved through admin routes", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.rows.comments.push({
    content: "needs review",
    game_id: GAME_ID,
    id: COMMENT_ID,
    user_id: OTHER_USER_ID,
  });
  const app = await createDataBoundaryApp(db, USER_ID);

  const reportResponse = await app.inject({
    method: "POST",
    payload: { reason: "Spoiler in the comments" },
    url: `/moderation/comments/${COMMENT_ID}/report`,
  });
  assert.equal(reportResponse.statusCode, 200);
  assert.equal(db.rows.reported_comments.length, 1);

  db.rows.reported_comments[0] = {
    ...db.rows.reported_comments[0],
    id: REPORT_ID,
  };
  await app.close();

  const adminApp = await createDataBoundaryApp(db, ADMIN_ID);
  const reportsResponse = await adminApp.inject({
    method: "GET",
    url: "/admin/reports",
  });
  assert.equal(reportsResponse.statusCode, 200);
  assert.equal(reportsResponse.json<{ reports: unknown[] }>().reports.length, 1);

  const actionResponse = await adminApp.inject({
    method: "POST",
    payload: { action: "delete_comment" },
    url: `/admin/reports/${REPORT_ID}/action`,
  });
  assert.equal(actionResponse.statusCode, 200);
  assert.equal(db.rows.comments.length, 0);
  await adminApp.close();
});

test("admin reports are paginated server-side", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  for (let index = 1; index <= 12; index += 1) {
    db.rows.reported_comments.push({
      comments: {
        content: `reported comment ${index}`,
        id: `comment-${index}`,
        profiles: { id: USER_ID, role: "user", username: "player" },
      },
      created_at: `2026-05-${String(index).padStart(2, "0")}T00:00:00.000Z`,
      id: `report-${index}`,
      profiles: { id: OTHER_USER_ID, username: "other" },
      reason: `reason ${index}`,
    });
  }
  const app = await createDataBoundaryApp(db, ADMIN_ID);

  const response = await app.inject({
    method: "GET",
    url: "/admin/reports?page=2&pageSize=5",
  });

  assert.equal(response.statusCode, 200);
  const body = response.json<{
    page: number;
    pageSize: number;
    reports: { id: string }[];
    total: number;
    totalPages: number;
  }>();
  assert.deepEqual(
    body.reports.map((report) => report.id),
    ["report-7", "report-6", "report-5", "report-4", "report-3"],
  );
  assert.equal(body.page, 2);
  assert.equal(body.pageSize, 5);
  assert.equal(body.total, 12);
  assert.equal(body.totalPages, 3);
  await app.close();
});

test("admin reports filter target roles before pagination", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  for (let index = 1; index <= 8; index += 1) {
    const isAdminTarget = index % 2 === 0;
    db.rows.reported_comments.push({
      comments: {
        content: `reported comment ${index}`,
        id: `comment-${index}`,
        profiles: {
          id: isAdminTarget ? ADMIN_ID : USER_ID,
          role: isAdminTarget ? "admin" : "user",
          username: isAdminTarget ? "admin" : "player",
        },
      },
      created_at: `2026-05-${String(index).padStart(2, "0")}T00:00:00.000Z`,
      id: `report-${index}`,
      profiles: { id: OTHER_USER_ID, username: "other" },
      reason: `reason ${index}`,
    });
  }
  const app = await createDataBoundaryApp(db, SUPER_ADMIN_ID);

  const adminResponse = await app.inject({
    method: "GET",
    url: "/admin/reports?page=1&pageSize=2&targetRole=admins",
  });
  const userResponse = await app.inject({
    method: "GET",
    url: "/admin/reports?page=2&pageSize=2&targetRole=users",
  });

  assert.equal(adminResponse.statusCode, 200);
  assert.deepEqual(
    adminResponse.json<{ reports: { id: string }[]; total: number; totalPages: number }>()
      .reports.map((report) => report.id),
    ["report-8", "report-6"],
  );
  assert.equal(adminResponse.json<{ total: number }>().total, 4);
  assert.equal(adminResponse.json<{ totalPages: number }>().totalPages, 2);

  assert.equal(userResponse.statusCode, 200);
  assert.deepEqual(
    userResponse.json<{ reports: { id: string }[]; total: number; totalPages: number }>()
      .reports.map((report) => report.id),
    ["report-3", "report-1"],
  );
  assert.equal(userResponse.json<{ total: number }>().total, 4);
  assert.equal(userResponse.json<{ totalPages: number }>().totalPages, 2);
  await app.close();
});

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
