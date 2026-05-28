/// <reference types="node" />

import "dotenv/config";
import assert from "node:assert/strict";

type JsonRecord = Record<string, unknown>;

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
  const gameId = await findSmokeGameId();
  await smokeIdentity();
  await smokeLocalPairing();
  await smokeSessionAndMetrics(gameId);
  console.log("staging smoke passed");
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
