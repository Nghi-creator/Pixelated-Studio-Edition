import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import type { User } from "@supabase/supabase-js";
import { registerAccessLogRoutes } from "../src/routes/accessLogs.js";
import { registerAdminUserRoutes } from "../src/routes/adminUsers.js";
import { registerAuthMethodsRoutes } from "../src/routes/authMethods.js";
import { registerCatalogRoutes } from "../src/routes/catalog.js";
import { registerGameRoutes } from "../src/routes/games.js";
import { registerLocalPairingRoutes } from "../src/routes/localPairings.js";
import { registerMeRoutes } from "../src/routes/me.js";
import { registerMetricRoutes } from "../src/routes/metrics.js";
import { registerModerationRoutes } from "../src/routes/moderation.js";
import { registerProfileRoutes } from "../src/routes/profiles.js";
import { registerSubmissionRoutes } from "../src/routes/submissions.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_ID = "33333333-3333-4333-8333-333333333333";
const SUPER_ADMIN_ID = "44444444-4444-4444-8444-444444444444";
const GAME_ID = "55555555-5555-4555-8555-555555555555";
const COMMENT_ID = "66666666-6666-4666-8666-666666666666";
const REPORT_ID = "77777777-7777-4777-8777-777777777777";

type TableName =
  | "access_logs"
  | "comment_likes"
  | "comments"
  | "favorites"
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
  op: "eq" | "gte" | "ilike" | "in";
  value: unknown;
};

type TestRequest = FastifyRequest & {
  user?: User;
};

class FakeSupabase {
  authUsers: User[] = [];
  deletedUsers: string[] = [];
  rows: Record<TableName, RecordRow[]> = {
    access_logs: [],
    comment_likes: [],
    comments: [],
    favorites: [],
    game_submissions: [],
    games: [],
    likes: [],
    local_engine_pairings: [],
    reported_comments: [],
    stream_metrics: [],
    profiles: [],
  };
  rpcCalls: { fn: string; params: RecordRow }[] = [];
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

  from(table: TableName) {
    return new FakeQueryBuilder(this, table);
  }

  async rpc(fn: string, params: RecordRow) {
    this.rpcCalls.push({ fn, params });
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

    return { data: null, error: null };
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
        if (filter.op === "gte") {
          return String(row[filter.field]) >= String(filter.value);
        }
        if (filter.op === "ilike") {
          const pattern = String(filter.value)
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replaceAll("%", ".*");
          return new RegExp(`^${pattern}$`, "i").test(
            String(row[filter.field] || ""),
          );
        }
        if (filter.op === "in" && Array.isArray(filter.value)) {
          return filter.value.includes(row[filter.field]);
        }

        return row[filter.field] === filter.value;
      }),
    );
  }
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
      user_metadata: {},
    };
    return undefined;
  };
}

async function createDataBoundaryApp(db: FakeSupabase, userId = USER_ID) {
  const app = Fastify({ logger: false });
  const options = {
    requireUser: requireUser(userId),
    supabase: db as never,
    supabaseAnon: db as never,
  };

  await registerAccessLogRoutes(app, options);
  await registerAdminUserRoutes(app, options);
  await registerAuthMethodsRoutes(app, options);
  await registerCatalogRoutes(app, options);
  await registerGameRoutes(app, options);
  await registerLocalPairingRoutes(app, options);
  await registerMeRoutes(app, options);
  await registerMetricRoutes(app, options);
  await registerModerationRoutes(app, options);
  await registerProfileRoutes(app, options);
  await registerSubmissionRoutes(app, {
    ...options,
    notifySubmission: async () => undefined,
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

function makeAuthUser(email: string, providers: string[]): User {
  return {
    app_metadata: { providers },
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email,
    id: `${email}-id`,
    user_metadata: {},
  };
}

test("catalog and favorites are served through backend routes", async () => {
  const db = new FakeSupabase();
  db.rows.games.push({ id: GAME_ID, title: "Zeta" });
  db.rows.favorites.push({
    game_id: GAME_ID,
    games: { id: GAME_ID, title: "Zeta" },
    user_id: USER_ID,
  });
  const app = await createDataBoundaryApp(db);

  const gamesResponse = await app.inject({ method: "GET", url: "/games" });
  assert.equal(gamesResponse.statusCode, 200);
  assert.equal(gamesResponse.json<{ games: unknown[] }>().games.length, 1);

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

test("catalog route paginates, searches, and returns featured games", async () => {
  const db = new FakeSupabase();
  db.rows.games.push(
    { cover_url: "/a.png", id: "game-a", play_count: 2, title: "Alpha Quest" },
    { cover_url: "/b.png", id: "game-b", play_count: 20, title: "Beta Quest" },
    { cover_url: "/c.png", id: "game-c", play_count: 5, title: "Gamma Run" },
    { cover_url: "/d.png", id: "game-d", play_count: 7, title: "Quest Drift" },
    { cover_url: "/e.png", id: "game-e", play_count: 3, title: "Delta Run" },
    { cover_url: "/f.png", id: "game-f", play_count: 1, title: "Echo Run" },
  );
  const app = await createDataBoundaryApp(db);

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
    ["game-d"],
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

test("catalog route caches public game pages briefly", async () => {
  const db = new FakeSupabase();
  db.rows.games.push({ id: "cache-game-a", play_count: 1, title: "Cache Alpha" });
  const app = await createDataBoundaryApp(db);

  const firstResponse = await app.inject({
    method: "GET",
    url: "/games?page=1&pageSize=15&search=cache-alpha-unique",
  });
  db.rows.games.push({ id: "cache-game-b", play_count: 20, title: "Cache Alpha Unique" });
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
  db.rows.games.push({
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
  db.rows.games.push({
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
  db.rows.games.push({ id: "featured-a", play_count: 1, title: "Featured A" });
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
  db.rows.games.push(
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

test("auth account methods expose provider metadata for login decisions", async () => {
  const db = new FakeSupabase();
  db.authUsers.push(
    makeAuthUser("oauth@example.com", ["google"]),
    makeAuthUser("email@example.com", ["email"]),
  );
  const app = await createDataBoundaryApp(db);

  const oauthResponse = await app.inject({
    method: "POST",
    payload: { email: "OAUTH@example.com" },
    url: "/auth/account-methods",
  });
  assert.equal(oauthResponse.statusCode, 200);
  assert.deepEqual(oauthResponse.json(), {
    exists: true,
    hasEmailProvider: false,
    providers: ["google"],
  });

  const emailResponse = await app.inject({
    method: "POST",
    payload: { email: "email@example.com" },
    url: "/auth/account-methods",
  });
  assert.equal(emailResponse.statusCode, 200);
  assert.equal(
    emailResponse.json<{ hasEmailProvider: boolean }>().hasEmailProvider,
    true,
  );

  const missingResponse = await app.inject({
    method: "POST",
    payload: { email: "missing@example.com" },
    url: "/auth/account-methods",
  });
  assert.equal(missingResponse.statusCode, 200);
  assert.deepEqual(missingResponse.json(), {
    exists: false,
    hasEmailProvider: false,
    providers: [],
  });
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

test("comment reactions reject self-reactions and replace prior reactions", async () => {
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

test("profile routes update only the authenticated profile and delete auth user", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
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

  const deleteResponse = await app.inject({ method: "DELETE", url: "/me/account" });
  assert.equal(deleteResponse.statusCode, 204);
  assert.deepEqual(db.deletedUsers, [USER_ID]);
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

test("submissions persist metadata for the authenticated submitter", async () => {
  const db = new FakeSupabase();
  const app = await createDataBoundaryApp(db, USER_ID);
  const storageBase =
    process.env.SUPABASE_URL?.replace(/\/+$/, "") || "https://example.com";

  const response = await app.inject({
    method: "POST",
    payload: {
      authorName: "Pixel Dev",
      bannerUrl: `${storageBase}/storage/v1/object/public/submissions/${USER_ID}/banners/banner.png`,
      coverUrl: `${storageBase}/storage/v1/object/public/submissions/${USER_ID}/covers/cover.png`,
      description: "A small NES game",
      email: "dev@example.com",
      gameTitle: "Tiny Quest",
      romUrl: `${storageBase}/storage/v1/object/public/submissions/${USER_ID}/roms/tiny.nes`,
    },
    url: "/submissions/games",
  });

  assert.equal(response.statusCode, 201);
  assert.equal(db.rows.game_submissions.length, 1);
  assert.equal(db.rows.game_submissions[0]?.submitter_id, USER_ID);
  assert.equal(db.rows.game_submissions[0]?.game_title, "Tiny Quest");
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
    payload: {
      authorName: "Root",
      description: null,
      email: "root@example.com",
      gameTitle: "Root Quest",
      romUrl: `${storageBase}/storage/v1/object/public/submissions/${SUPER_ADMIN_ID}/roms/root.nes`,
    },
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
    payload: {
      authorName: "Pixel Dev",
      description: null,
      email: "dev@example.com",
      gameTitle: "Tiny Quest",
      romUrl: `${storageBase}/storage/v1/object/public/submissions/${OTHER_USER_ID}/roms/tiny.nes`,
    },
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
    payload: {
      authorName: "Pixel Dev",
      description: null,
      email: "dev@example.com",
      gameTitle: "Tiny Quest",
      romUrl: `${storageBase}/storage/v1/object/public/submissions/${USER_ID}/roms/tiny.nes`,
    },
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
