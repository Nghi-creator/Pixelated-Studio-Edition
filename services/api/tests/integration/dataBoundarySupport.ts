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

export const USER_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
export const ADMIN_ID = "33333333-3333-4333-8333-333333333333";
export const SUPER_ADMIN_ID = "44444444-4444-4444-8444-444444444444";
export const GAME_ID = "55555555-5555-4555-8555-555555555555";
export const COMMENT_ID = "66666666-6666-4666-8666-666666666666";
export const REPORT_ID = "77777777-7777-4777-8777-777777777777";
export const SUBMISSION_ID = "88888888-8888-4888-8888-888888888888";

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

export type RecordRow = Record<string, unknown>;

type Filter = {
  field: string;
  op: "eq" | "gte" | "ilike" | "in" | "not_in";
  value: unknown;
};

type TestRequest = FastifyRequest & {
  user?: User;
};

export class FakeSupabase {
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

export function sha256(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function validNesRom() {
  return Buffer.concat([Buffer.from([0x4e, 0x45, 0x53, 0x1a]), Buffer.alloc(32)]);
}

export function validSnesRom() {
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

export function validGameGearRom() {
  const bytes = Buffer.alloc(0x8000);
  Buffer.from("TMR SEGA").copy(bytes, 0x7ff0);
  return bytes;
}

export function validGenesisRom() {
  const bytes = Buffer.alloc(0x200);
  Buffer.from("SEGA MEGA DRIVE").copy(bytes, 0x100);
  return bytes;
}

export async function createDataBoundaryApp(
  db: FakeSupabase,
  userId = USER_ID,
  artifactBytes = Buffer.from("test-artifact"),
  extraOptions: RecordRow = {},
) {
  const app = Fastify({ logger: false });
  const fetchArtifact =
    typeof extraOptions.fetchArtifact === "function"
      ? (extraOptions.fetchArtifact as typeof fetch)
      : async () => new Response(artifactBytes);
  const options = {
    ...extraOptions,
    fetchArtifact,
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

export function seedProfiles(db: FakeSupabase) {
  db.rows.profiles.push(
    { id: USER_ID, role: "user", username: "player" },
    { id: OTHER_USER_ID, role: "user", username: "other" },
    { id: ADMIN_ID, role: "admin", username: "admin" },
    { id: SUPER_ADMIN_ID, role: "super_admin", username: "root" },
  );
}

export function seedPublishedGames(db: FakeSupabase, ...games: RecordRow[]) {
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

export function validSubmissionPayload(overrides: RecordRow = {}) {
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

