import assert from "node:assert/strict";
import { logStep, uniqueId } from "./config.js";
import type { StagingContext } from "./client.js";
export function createSessionsChecks(context: StagingContext) {
  const { request, smokeEngineUrl } = context;
  async function smokeLocalPairing() {
    logStep("checking local pairing mutation and restore");
    const previous = await request<{
      pairing?: {
        engineUrl?: string;
      };
    }>("GET", "/local-pairings/current", { expected: [200, 404] });
    const previousEngineUrl = previous.response.status === 200 ? previous.payload.pairing?.engineUrl : null;
    try {
      const { payload: saved } = await request<{
        pairing?: {
          engineUrl?: string;
        };
        status?: string;
      }>("POST", "/local-pairings", {
        body: { engineUrl: smokeEngineUrl },
      });
      assert.equal(saved.status, "paired");
      assert.equal(saved.pairing?.engineUrl, smokeEngineUrl.replace(/\/$/, ""));
      const { payload: current } = await request<{
        pairing?: {
          engineUrl?: string;
        };
      }>("GET", "/local-pairings/current");
      assert.equal(current.pairing?.engineUrl, smokeEngineUrl.replace(/\/$/, ""));
    }
    finally {
      if (previousEngineUrl) {
        await request("POST", "/local-pairings", {
          body: { engineUrl: previousEngineUrl },
        });
      }
      else {
        await request("DELETE", "/local-pairings/current", { expected: [204, 404] });
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
        lobbies?: {
          engineUrl?: string | null;
          sessionId?: string;
        }[];
      }>("GET", "/multiplayer/lobbies/recent");
      assert.equal(Array.isArray(recent.lobbies), true);
      assert.equal(recent.lobbies?.some((lobby) => lobby.sessionId === sessionId &&
        lobby.engineUrl === normalizedEngineUrl), true, "recent multiplayer lobbies should include the updated smoke lobby");
      logStep("deleting multiplayer lobby");
      await request("DELETE", `/multiplayer/lobbies/${sessionId}`, {
        expected: 204,
      });
      deleted = true;
      logStep("verifying deleted multiplayer lobby is no longer recent");
      const { payload: afterDelete } = await request<{
        lobbies?: {
          sessionId?: string;
        }[];
      }>("GET", "/multiplayer/lobbies/recent");
      assert.equal(Array.isArray(afterDelete.lobbies), true);
      assert.equal(afterDelete.lobbies?.some((lobby) => lobby.sessionId === sessionId), false, "deleted smoke lobby should not remain in recent multiplayer lobbies");
    }
    finally {
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
      const { payload: session } = await request<{
        sessionId?: string;
      }>("GET", `/sessions/${clientSessionId}`);
      assert.equal(session.sessionId, clientSessionId);
      logStep("verifying session token boundary");
      const { payload: verified } = await request<{
        sessionId?: string;
      }>("POST", `/sessions/${clientSessionId}/verify`, {
        auth: false,
        body: { sessionToken: created.sessionToken },
      });
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
      assert.equal(metricResult.accepted, true, `metric should be accepted; reason=${metricResult.reason || "none"}`);
      logStep("reading recent stream metrics");
      const { payload: recent } = await request<{
        metrics?: {
          sessionId?: string;
        }[];
      }>("GET", "/metrics/stream/recent");
      assert.equal(Array.isArray(recent.metrics), true);
      assert.equal(recent.metrics?.some((metric) => metric.sessionId === clientSessionId), true, "recent metrics should include the smoke metric");
    }
    finally {
      logStep("deleting cloud session");
      await request("DELETE", `/sessions/${clientSessionId}`, { expected: 204 });
    }
  }
  return { smokeLocalPairing, smokeMultiplayerLobby, smokeSessionAndMetrics };
}
