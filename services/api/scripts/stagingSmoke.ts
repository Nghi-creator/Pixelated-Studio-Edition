/// <reference types="node" />

import "dotenv/config";
import assert from "node:assert/strict";

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

const apiUrl = normalizeBaseUrl(
  process.env.STAGING_API_URL ||
    process.env.API_URL ||
    "https://pixelated-api-services.onrender.com",
);
const bearerToken =
  process.env.STAGING_BEARER_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;
const configuredGameId = process.env.STAGING_GAME_ID;
const smokeEngineUrl =
  process.env.STAGING_SMOKE_ENGINE_URL || "http://127.0.0.1:8080";

if (!bearerToken) {
  fail(
    "Missing STAGING_BEARER_TOKEN. Provide a real signed-in Supabase access token.",
  );
}

const authHeaders = {
  Authorization: `Bearer ${bearerToken}`,
};

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

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  await smokeCatalogCaching();
  const permissions = await smokeIdentity();
  await smokeAccessLogStorage(permissions.abilities?.canAccessAdmin === true);
  const gameId = await findSmokeGameId();
  await smokeLocalPairing();
  await smokeMultiplayerLobby(gameId);
  await smokeSessionAndMetrics(gameId);
  console.log("staging smoke passed");
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
