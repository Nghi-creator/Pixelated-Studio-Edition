import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { registerAccessLogRoutes } from "./routes/accessLogs.js";
import { registerAdminUserRoutes } from "./routes/adminUsers.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerProfileRoutes } from "./routes/profiles.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_ID = "33333333-3333-4333-8333-333333333333";
const SUPER_ADMIN_ID = "44444444-4444-4444-8444-444444444444";
const GAME_ID = "55555555-5555-4555-8555-555555555555";
const COMMENT_ID = "66666666-6666-4666-8666-666666666666";

type TableName =
  | "access_logs"
  | "comment_likes"
  | "comments"
  | "favorites"
  | "games"
  | "likes"
  | "profiles";

type RecordRow = Record<string, unknown>;

type Filter = {
  field: string;
  op: "eq";
  value: unknown;
};

class FakeSupabase {
  deletedUsers: string[] = [];
  rows: Record<TableName, RecordRow[]> = {
    access_logs: [],
    comment_likes: [],
    comments: [],
    favorites: [],
    games: [],
    likes: [],
    profiles: [],
  };
  auth = {
    admin: {
      deleteUser: async (userId: string) => {
        this.deletedUsers.push(userId);
        return { error: null };
      },
    },
  };

  from(table: TableName) {
    return new FakeQueryBuilder(this, table);
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

  order(field: string, options: { ascending: boolean } = { ascending: true }) {
    this.orderConfig = { ascending: options.ascending, field };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
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

  upsert(payload: RecordRow) {
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
    return { data: rows, error: null };
  }

  private async executeRows() {
    if (this.action === "insert" && this.payload) {
      this.db.rows[this.table].push({
        id: `${this.table}-${this.db.rows[this.table].length + 1}`,
        ...this.payload,
      });
    }

    if (this.action === "upsert" && this.payload) {
      const existing = this.filteredRows()[0];
      if (existing) Object.assign(existing, this.payload);
      else this.db.rows[this.table].push({ ...this.payload });
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
        const leftValue = String(left[this.orderConfig?.field || ""]);
        const rightValue = String(right[this.orderConfig?.field || ""]);
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
      this.filters.every((filter) => row[filter.field] === filter.value),
    );
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

async function createDataBoundaryApp(db: FakeSupabase, userId = USER_ID) {
  const app = Fastify({ logger: false });
  const options = {
    requireUser: requireUser(userId),
    supabase: db as never,
  };

  await registerAccessLogRoutes(app, options);
  await registerAdminUserRoutes(app, options);
  await registerCatalogRoutes(app, options);
  await registerProfileRoutes(app, options);
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
  assert.equal(logsResponse.json<{ logs: unknown[] }>().logs.length, 1);
  await superAdminApp.close();
});
