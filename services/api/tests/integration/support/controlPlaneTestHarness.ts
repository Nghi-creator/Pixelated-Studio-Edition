import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { registerLocalPairingRoutes } from "../../../src/modules/multiplayer/http/localPairingRoutes.js";
import { registerMetricRoutes } from "../../../src/modules/observability/http/metricRoutes.js";
import { registerMultiplayerRoutes } from "../../../src/modules/multiplayer/http/multiplayerRoutes.js";
import { registerSessionRoutes } from "../../../src/modules/auth/http/sessionRoutes.js";

export const USER_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
export const GAME_ID = "33333333-3333-4333-8333-333333333333";

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

export class FakeSupabase {
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

export function requireUser(userId = USER_ID) {
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

export function seedPublishedGame(
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

export async function createTestApp(db: FakeSupabase, userId = USER_ID) {
  const app = Fastify({ logger: false });
  const options = {
    attachOptionalUser: requireUser(userId),
    requireUser: requireUser(userId),
    supabase: db as never,
  };

  await registerSessionRoutes(app, options);
  await registerLocalPairingRoutes(app, options);
  await registerMetricRoutes(app, options);
  await registerMultiplayerRoutes(app, options);
  return app;
}
