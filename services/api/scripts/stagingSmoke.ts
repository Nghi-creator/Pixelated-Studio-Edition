/// <reference types="node" />

import "dotenv/config";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;
type AccessLogErrorPayload = {
  code?: string;
  details?: {
    code?: string;
    message?: string;
  };
  error?: string;
  migrations?: string[];
};

type SmokeMode =
  | "access-log-schema"
  | "catalog-rpc"
  | "full"
  | "submission-cleanup-policy";

const mode = parseArgs(process.argv.slice(2));
const apiUrl = normalizeBaseUrl(
  process.env.STAGING_API_URL ||
    process.env.API_URL ||
    "https://pixelated-api-services.onrender.com",
);
const configuredBearerToken =
  process.env.STAGING_BEARER_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;
const stagingSupabaseUrl =
  process.env.STAGING_SUPABASE_URL || process.env.SUPABASE_URL;
const stagingSupabaseAnonKey =
  process.env.STAGING_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const configuredGameId = process.env.STAGING_GAME_ID;
const smokeEngineUrl =
  process.env.STAGING_SMOKE_ENGINE_URL || "http://127.0.0.1:8080";
let authHeaders: Record<string, string> = {};
let bearerToken = "";

function parseArgs(args: string[]): SmokeMode {
  if (args.length === 0) return "full";
  if (args.length === 1 && args[0] === "--access-log-schema-only") {
    return "access-log-schema";
  }
  if (args.length === 1 && args[0] === "--submission-cleanup-policy-only") {
    return "submission-cleanup-policy";
  }
  if (args.length === 1 && args[0] === "--catalog-rpc-only") {
    return "catalog-rpc";
  }

  fail(
    `Unknown arguments: ${args.join(" ")}. Supported options: --access-log-schema-only, --submission-cleanup-policy-only, --catalog-rpc-only`,
  );
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function fail(message: string): never {
  console.error(`staging smoke failed: ${message}`);
  process.exit(1);
}

function logStep(message: string) {
  console.log(`smoke: ${message}`);
}

async function resolveBearerToken() {
  if (configuredBearerToken) {
    logStep("using configured bearer token");
    return configuredBearerToken;
  }

  const email = process.env.STAGING_SMOKE_EMAIL;
  const password = process.env.STAGING_SMOKE_PASSWORD;

  if (!stagingSupabaseUrl || !stagingSupabaseAnonKey || !email || !password) {
    fail(
      "Missing smoke authentication. Provide STAGING_BEARER_TOKEN, or provide " +
        "STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY, STAGING_SMOKE_EMAIL, " +
        "and STAGING_SMOKE_PASSWORD for automatic sign-in.",
    );
  }

  logStep("signing in dedicated staging smoke account");
  const response = await fetch(
    `${normalizeBaseUrl(stagingSupabaseUrl)}/auth/v1/token?grant_type=password`,
    {
      body: JSON.stringify({ email, password }),
      headers: {
        apikey: stagingSupabaseAnonKey,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
  const text = await response.text();
  const payload = text
    ? (parseJson(text, "Supabase password grant") as {
        access_token?: string;
        error?: string;
        error_code?: string;
        msg?: string;
      })
    : {};

  if (!response.ok || !payload.access_token) {
    const authError = payload.error || payload.error_code || payload.msg || text;
    const captchaHint =
      response.status === 400
        ? " If Supabase Auth CAPTCHA is enabled, password-grant smoke sign-in cannot complete the interactive challenge; provide STAGING_BEARER_TOKEN for CI or relax CAPTCHA for the staging smoke account."
        : "";
    fail(
      `Staging smoke account sign-in failed with ${response.status}. ` +
        `Verify the dedicated account credentials and Supabase auth settings.${captchaHint}` +
        `${authError ? ` body=${authError}` : ""}`,
    );
  }

  return payload.access_token;
}

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSupabaseProjectRef(url: string | undefined) {
  if (!url) return null;

  try {
    const hostname = new URL(url).hostname;
    const suffix = ".supabase.co";
    return hostname.endsWith(suffix)
      ? hostname.slice(0, -suffix.length)
      : hostname;
  } catch {
    return null;
  }
}

function assertHeader(response: Response, name: string, expected: string | null) {
  assert.equal(
    response.headers.get(name),
    expected,
    `${name} should be ${expected ?? "absent"}`,
  );
}

async function request<T = JsonRecord>(
  method: string,
  path: string,
  options: {
    auth?: boolean;
    body?: JsonRecord;
    expected?: number | number[];
  } = {},
) {
  const expected = Array.isArray(options.expected)
    ? options.expected
    : [options.expected ?? 200];
  const response = await fetch(`${apiUrl}${path}`, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers: {
      ...(options.auth === false ? {} : authHeaders),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    method,
  });
  const text = await response.text();
  const payload = text ? parseJson(text, path) : null;

  if (!expected.includes(response.status)) {
    const accessLogError = payload as AccessLogErrorPayload | null;
    if (accessLogError?.code === "access_log_schema_drift") {
      throw new Error(
        `${method} ${path} detected hosted access-log schema drift` +
          `${accessLogError.details?.code ? ` (${accessLogError.details.code})` : ""}. ` +
          `Push migrations: ${(accessLogError.migrations || []).join(", ") || "access-log repair migrations"}. ` +
          `details=${accessLogError.details?.message || accessLogError.error || text}`,
      );
    }
    if (path.startsWith("/access-logs") || path.startsWith("/admin/access-logs")) {
      throw new Error(
        `${method} ${path} failed the hosted access-log storage contract with ${response.status}. ` +
          `Possible schema drift: verify public.access_logs.path, session_id, last_seen_at, access_count, ` +
          `the access_logs_session_id_key index, and public.admin_access_log_summary. body=${text || "<empty>"}`,
      );
    }
    if (path === "/me" && response.status === 401) {
      const stagingProject = getSupabaseProjectRef(stagingSupabaseUrl);
      throw new Error(
        `${method} ${path} returned 401; expected ${expected.join(
          " or ",
        )}. The smoke signed into Supabase project ${stagingProject || "<unknown>"}, ` +
          "but the hosted API rejected that token. Verify STAGING_API_URL points to the staging API service, " +
          "and that the API service env SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY use the same staging Supabase project. " +
          `body=${text || "<empty>"}`,
      );
    }
    throw new Error(
      `${method} ${path} returned ${response.status}; expected ${expected.join(
        " or ",
      )}; body=${text || "<empty>"}`,
    );
  }

  return {
    payload: payload as T,
    response,
  };
}

function parseJson(text: string, path: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new Error(`Expected JSON from ${path}; body=${text}`);
  }
}

async function smokeCatalogCaching() {
  const cacheProbe = uniqueId("staging-smoke-cache");
  const path = `/games?search=${encodeURIComponent(cacheProbe)}`;

  logStep("checking public catalog cache miss");
  const first = await request<{ games?: unknown[] }>("GET", path, {
    auth: false,
  });
  assert.equal(Array.isArray(first.payload.games), true);
  assertHeader(
    first.response,
    "Cache-Control",
    "public, max-age=30, s-maxage=60",
  );
  assertHeader(first.response, "X-Pixelated-Cache", "MISS");

  logStep("checking public catalog cache hit");
  const second = await request<{ games?: unknown[] }>("GET", path, {
    auth: false,
  });
  assert.equal(Array.isArray(second.payload.games), true);
  assertHeader(
    second.response,
    "Cache-Control",
    "public, max-age=30, s-maxage=60",
  );
  assertHeader(second.response, "X-Pixelated-Cache", "HIT");

  logStep("checking featured games bypass catalog caching");
  const featured = await request<{ featuredGames?: unknown[] }>(
    "GET",
    "/games/featured",
    { auth: false },
  );
  assert.equal(Array.isArray(featured.payload.featuredGames), true);
  assertHeader(featured.response, "Cache-Control", "no-store");
  assertHeader(featured.response, "X-Pixelated-Cache", null);
}

function formatCatalogRpcError(error: unknown) {
  if (!error) return "<empty>";
  if (error instanceof Error) return error.message;
  if (typeof error !== "object") return String(error);

  const record = error as {
    code?: unknown;
    details?: unknown;
    hint?: unknown;
    message?: unknown;
  };
  const summary = [
    typeof record.code === "string" ? `code=${record.code}` : null,
    typeof record.message === "string" ? `message=${record.message}` : null,
    typeof record.details === "string" ? `details=${record.details}` : null,
    typeof record.hint === "string" ? `hint=${record.hint}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return summary || JSON.stringify(record);
}

async function predeployCatalogRpcCheck() {
  if (!stagingSupabaseUrl || !stagingSupabaseAnonKey) {
    fail(
      "Missing Supabase configuration for published catalog RPC check. " +
        "Provide STAGING_SUPABASE_URL and STAGING_SUPABASE_ANON_KEY.",
    );
  }

  const supabase = createClient(stagingSupabaseUrl, stagingSupabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  logStep("checking hosted published_catalog_games RPC search signature");
  const probeSearch = uniqueId("catalog-rpc-signature");
  const { data, error } = await supabase.rpc("published_catalog_games", {
    p_game_id: null,
    p_limit: 1,
    p_order: "title",
    p_search: probeSearch,
  });
  if (error) {
    throw new Error(
      "Hosted Supabase is missing the current public.published_catalog_games(uuid, integer, text, text) RPC signature. " +
        "Apply migrations supabase/migrations/20260701100000_published_catalog_games_rpc.sql and " +
        "supabase/migrations/20260701103000_update_published_catalog_games_search.sql before deploying. " +
        `details=${formatCatalogRpcError(error)}`,
    );
  }

  assert.equal(
    Array.isArray(data),
    true,
    "published_catalog_games RPC should return an array",
  );
  assert.equal(
    data.length,
    0,
    "unique published_catalog_games search probe should not match catalog rows",
  );
}

async function findSmokeGameId() {
  if (configuredGameId) return configuredGameId;

  const { payload } = await request<{ games?: JsonRecord[] }>("GET", "/games", {
    auth: false,
  });
  const game = (payload.games || []).find((row) => {
    return typeof row.id === "string" && (row.rom_url || row.rom_filename);
  });

  if (!game || typeof game.id !== "string") {
    throw new Error(
      "No game with a ROM target found. Set STAGING_GAME_ID to a known game id.",
    );
  }

  return game.id;
}

async function smokeIdentity() {
  logStep("checking signed-in identity");
  const { payload: me } = await request<{ user?: { id?: string } }>("GET", "/me");
  assert.equal(typeof me.user?.id, "string", "/me should include user.id");

  logStep("checking signed-in permissions");
  const { payload: permissions } = await request<{
    abilities?: JsonRecord;
    profile?: JsonRecord;
  }>("GET", "/me/permissions");
  assert.equal(
    typeof permissions.abilities,
    "object",
    "/me/permissions should include abilities",
  );
  assert.equal(
    typeof permissions.profile,
    "object",
    "/me/permissions should include profile",
  );

  return permissions;
}

async function smokeAccessLogStorage(canAccessAdmin: boolean) {
  const sessionId = uniqueId("staging-smoke-access-log");

  logStep("checking hosted access-log write schema");
  await request("POST", "/access-logs", {
    body: { path: "/staging-smoke/access-log/first", sessionId },
    expected: 202,
  });

  logStep("checking hosted access-log session upsert schema");
  await request("POST", "/access-logs", {
    body: { path: "/staging-smoke/access-log/updated", sessionId },
    expected: 202,
  });

  if (canAccessAdmin) {
    logStep("checking hosted access-log summary RPC schema");
    const { payload } = await request<{ logs?: unknown[] }>(
      "GET",
      "/admin/access-logs?page=1&pageSize=1",
    );
    assert.equal(Array.isArray(payload.logs), true);
  } else {
    logStep("skipping admin access-log summary RPC check for non-admin token");
  }
}

async function predeployAccessLogSchemaCheck() {
  const permissions = await smokeIdentity();
  if (permissions.abilities?.canAccessAdmin !== true) {
    throw new Error(
      "The hosted access-log predeploy check requires an admin or super-admin bearer token so public.admin_access_log_summary is verified.",
    );
  }

  await smokeAccessLogStorage(true);
}

function formatStorageError(error: unknown) {
  if (!error) return "<empty>";
  if (error instanceof Error) return error.message;
  if (typeof error !== "object") return String(error);

  const record = error as {
    error?: unknown;
    message?: unknown;
    statusCode?: unknown;
  };
  const summary = [
    typeof record.statusCode === "string" ||
    typeof record.statusCode === "number"
      ? `status=${record.statusCode}`
      : null,
    typeof record.error === "string" ? `error=${record.error}` : null,
    typeof record.message === "string" ? `message=${record.message}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return summary || JSON.stringify(record);
}

async function predeploySubmissionCleanupPolicyCheck() {
  if (!stagingSupabaseUrl || !stagingSupabaseAnonKey) {
    fail(
      "Missing Supabase storage configuration for submission cleanup policy check. " +
        "Provide STAGING_SUPABASE_URL and STAGING_SUPABASE_ANON_KEY.",
    );
  }

  const { payload: me } = await request<{ user?: { id?: string } }>("GET", "/me");
  const userId = me.user?.id;
  if (!userId) {
    throw new Error("Submission cleanup policy check requires /me to return user.id.");
  }

  const objectPath = `${userId}/staging-smoke/${uniqueId("cleanup-policy")}.txt`;
  const supabase = createClient(stagingSupabaseUrl, stagingSupabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    },
  });
  const storage = supabase.storage.from("submissions");

  logStep("checking hosted submission storage upload policy");
  const upload = await storage.upload(
    objectPath,
    new Blob(["staging smoke cleanup policy\n"], { type: "text/plain" }),
    {
      contentType: "text/plain",
      upsert: false,
    },
  );
  if (upload.error) {
    throw new Error(
      "Hosted submission storage upload probe failed before cleanup could be verified. " +
        "Verify the authenticated submissions upload policy and staging smoke account. " +
        `details=${formatStorageError(upload.error)}`,
    );
  }

  logStep("checking hosted submission cleanup storage policy");
  const removal = await storage.remove([objectPath]);
  if (removal.error) {
    throw new Error(
      "Hosted submission cleanup storage policy is missing or denying authenticated cleanup. " +
        "Apply migration supabase/migrations/20260614153000_allow_own_submission_cleanup.sql " +
        "to the hosted Supabase project before deploying. " +
        `Delete failed for submissions/${objectPath}; details=${formatStorageError(removal.error)}`,
    );
  }
}

async function smokeLocalPairing() {
  logStep("checking local pairing mutation and restore");
  const previous = await request<{ pairing?: { engineUrl?: string } }>(
    "GET",
    "/local-pairings/current",
    { expected: [200, 404] },
  );
  const previousEngineUrl =
    previous.response.status === 200 ? previous.payload.pairing?.engineUrl : null;

  try {
    const { payload: saved } = await request<{
      pairing?: { engineUrl?: string };
      status?: string;
    }>("POST", "/local-pairings", {
      body: { engineUrl: smokeEngineUrl },
    });
    assert.equal(saved.status, "paired");
    assert.equal(saved.pairing?.engineUrl, smokeEngineUrl.replace(/\/$/, ""));

    const { payload: current } = await request<{
      pairing?: { engineUrl?: string };
    }>("GET", "/local-pairings/current");
    assert.equal(current.pairing?.engineUrl, smokeEngineUrl.replace(/\/$/, ""));
  } finally {
    await request("DELETE", "/local-pairings/current", { expected: 204 });

    if (previousEngineUrl) {
      await request("POST", "/local-pairings", {
        body: { engineUrl: previousEngineUrl },
      });
    }
  }
}

async function smokeMultiplayerLobby(gameId: string) {
  const sessionId = uniqueId("staging-smoke-lobby");
  const normalizedEngineUrl = smokeEngineUrl.replace(/\/$/, "");
  let deleted = false;

  try {
    logStep("creating multiplayer lobby");
    const { payload: created } = await request<{
      lobby?: {
        engineUrl?: string | null;
        gameId?: string;
        lobbyId?: string;
        maxPlayers?: number;
        sessionId?: string;
        status?: string;
      };
    }>("PUT", `/multiplayer/lobbies/${sessionId}`, {
      body: {
        engineUrl: null,
        exposureMode: "unknown",
        gameId,
        maxPlayers: 2,
        participants: [
          { displayName: "Staging Smoke Host", playerIndex: 1, role: "host" },
        ],
      },
    });
    assert.equal(typeof created.lobby?.lobbyId, "string");
    assert.equal(created.lobby?.sessionId, sessionId);
    assert.equal(created.lobby?.gameId, gameId);
    assert.equal(created.lobby?.engineUrl, null);
    assert.equal(created.lobby?.maxPlayers, 2);
    assert.equal(created.lobby?.status, "active");

    logStep("updating multiplayer lobby");
    const { payload: updated } = await request<{
      lobby?: {
        engineUrl?: string | null;
        lobbyId?: string;
        maxPlayers?: number;
        participants?: unknown[];
        sessionId?: string;
      };
    }>("PUT", `/multiplayer/lobbies/${sessionId}`, {
      body: {
        engineUrl: `${normalizedEngineUrl}/`,
        exposureMode: "unknown",
        gameId,
        maxPlayers: 4,
        participants: [
          { displayName: "Staging Smoke Host", playerIndex: 1, role: "host" },
          {
            displayName: "Staging Smoke Guest",
            playerIndex: null,
            role: "spectator",
          },
        ],
      },
    });
    assert.equal(updated.lobby?.lobbyId, created.lobby?.lobbyId);
    assert.equal(updated.lobby?.sessionId, sessionId);
    assert.equal(updated.lobby?.engineUrl, normalizedEngineUrl);
    assert.equal(updated.lobby?.maxPlayers, 4);
    assert.equal(updated.lobby?.participants?.length, 2);

    logStep("reading recent multiplayer lobbies");
    const { payload: recent } = await request<{
      lobbies?: { engineUrl?: string | null; sessionId?: string }[];
    }>("GET", "/multiplayer/lobbies/recent");
    assert.equal(Array.isArray(recent.lobbies), true);
    assert.equal(
      recent.lobbies?.some(
        (lobby) =>
          lobby.sessionId === sessionId &&
          lobby.engineUrl === normalizedEngineUrl,
      ),
      true,
      "recent multiplayer lobbies should include the updated smoke lobby",
    );

    logStep("deleting multiplayer lobby");
    await request("DELETE", `/multiplayer/lobbies/${sessionId}`, {
      expected: 204,
    });
    deleted = true;

    logStep("verifying deleted multiplayer lobby is no longer recent");
    const { payload: afterDelete } = await request<{
      lobbies?: { sessionId?: string }[];
    }>("GET", "/multiplayer/lobbies/recent");
    assert.equal(Array.isArray(afterDelete.lobbies), true);
    assert.equal(
      afterDelete.lobbies?.some((lobby) => lobby.sessionId === sessionId),
      false,
      "deleted smoke lobby should not remain in recent multiplayer lobbies",
    );
  } finally {
    if (!deleted) {
      await request("DELETE", `/multiplayer/lobbies/${sessionId}`, {
        expected: 204,
      });
    }
  }
}

async function smokeSessionAndMetrics(gameId: string) {
  const clientSessionId = uniqueId("staging-smoke");

  logStep(`creating cloud session for game ${gameId}`);
  const { payload: created } = await request<{
    sessionId?: string;
    sessionToken?: string;
  }>("POST", "/sessions", {
    body: {
      clientSessionId,
      gameId,
      mode: "cloud",
    },
  });
  assert.equal(created.sessionId, clientSessionId);
  assert.equal(typeof created.sessionToken, "string");

  try {
    logStep("reading created session");
    const { payload: session } = await request<{ sessionId?: string }>(
      "GET",
      `/sessions/${clientSessionId}`,
    );
    assert.equal(session.sessionId, clientSessionId);

    logStep("verifying session token boundary");
    const { payload: verified } = await request<{ sessionId?: string }>(
      "POST",
      `/sessions/${clientSessionId}/verify`,
      {
        auth: false,
        body: { sessionToken: created.sessionToken },
      },
    );
    assert.equal(verified.sessionId, clientSessionId);

    logStep("posting stream metric");
    const { payload: metricResult } = await request<{
      accepted?: boolean;
      reason?: string;
    }>("POST", "/metrics/stream", {
      body: {
        bitrateKbps: 0,
        connectionState: "new",
        fps: 0,
        iceConnectionState: "new",
        jitterMs: 0,
        packetsLost: 0,
        sessionId: clientSessionId,
        timestamp: new Date().toISOString(),
      },
      expected: 202,
    });
    assert.equal(
      metricResult.accepted,
      true,
      `metric should be accepted; reason=${metricResult.reason || "none"}`,
    );

    logStep("reading recent stream metrics");
    const { payload: recent } = await request<{
      metrics?: { sessionId?: string }[];
    }>("GET", "/metrics/stream/recent");
    assert.equal(Array.isArray(recent.metrics), true);
    assert.equal(
      recent.metrics?.some((metric) => metric.sessionId === clientSessionId),
      true,
      "recent metrics should include the smoke metric",
    );
  } finally {
    logStep("deleting cloud session");
    await request("DELETE", `/sessions/${clientSessionId}`, { expected: 204 });
  }
}

async function main() {
  console.log(`staging smoke target: ${apiUrl}`);
  if (mode === "catalog-rpc") {
    await predeployCatalogRpcCheck();
    console.log("hosted published catalog RPC predeploy check passed");
    return;
  }

  bearerToken = await resolveBearerToken();
  authHeaders = {
    Authorization: `Bearer ${bearerToken}`,
  };

  if (mode === "access-log-schema") {
    await predeployAccessLogSchemaCheck();
    console.log("hosted access-log schema predeploy check passed");
    return;
  }
  if (mode === "submission-cleanup-policy") {
    await predeploySubmissionCleanupPolicyCheck();
    console.log("hosted submission cleanup policy predeploy check passed");
    return;
  }
  await smokeCatalogCaching();
  const permissions = await smokeIdentity();
  await smokeAccessLogStorage(permissions.abilities?.canAccessAdmin === true);
  await predeploySubmissionCleanupPolicyCheck();
  const gameId = await findSmokeGameId();
  await smokeLocalPairing();
  await smokeMultiplayerLobby(gameId);
  await smokeSessionAndMetrics(gameId);
  console.log("staging smoke passed");
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
