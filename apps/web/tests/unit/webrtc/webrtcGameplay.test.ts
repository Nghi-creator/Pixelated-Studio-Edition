import assert from "node:assert/strict";
import test from "node:test";
import { buildMultiplayerLobbyPayload } from "../../../src/lib/webrtc/lobbyMetadata.ts";
import {
  formatEngineLaunchFailure,
  getErrorMessage,
  STREAM_BOOT_ERROR_MESSAGE,
} from "../../../src/lib/webrtc/streamErrors.ts";

test("multiplayer lobby metadata preserves engine exposure and supported slots", () => {
  const payload = buildMultiplayerLobbyPayload({
    engineUrl: "http://192.168.1.10:3001",
    gameId: "game-1",
    inputCapabilities: {
      limitationReason: "P3/P4 disabled",
      source: "health",
      supportedPlayerCount: 2,
    },
    lobbyState: {
      hostSocketId: "host-socket",
      maxPlayers: 4,
      participants: [
        {
          connectedAt: "2026-06-14T00:00:00.000Z",
          displayName: "Host",
          playerIndex: 1,
          role: "host",
          socketId: "host-socket",
        },
        {
          connectedAt: "2026-06-14T00:01:00.000Z",
          displayName: "Guest",
          playerIndex: null,
          role: "spectator",
          socketId: "guest-socket",
        },
      ],
      sessionId: "session-1",
    },
    shareContext: {
      companionUrls: ["http://192.168.1.10:3001"],
      exposureMode: "lan",
    },
  });

  assert.deepEqual(payload, {
    engineUrl: "http://192.168.1.10:3001",
    exposureMode: "lan",
    gameId: "game-1",
    maxPlayers: 2,
    participants: [
      {
        displayName: "Host",
        playerIndex: 1,
        role: "host",
      },
      {
        displayName: "Guest",
        playerIndex: null,
        role: "spectator",
      },
    ],
  });
});

test("stream error messages preserve useful errors and fall back safely", () => {
  assert.equal(
    getErrorMessage(new Error("ROM file is missing"), STREAM_BOOT_ERROR_MESSAGE),
    "ROM file is missing",
  );
  assert.equal(
    getErrorMessage("", STREAM_BOOT_ERROR_MESSAGE),
    STREAM_BOOT_ERROR_MESSAGE,
  );
  assert.equal(
    getErrorMessage({ message: "not an Error instance" }, STREAM_BOOT_ERROR_MESSAGE),
    STREAM_BOOT_ERROR_MESSAGE,
  );
});

test("engine launch diagnostics format recent process output", () => {
  assert.equal(
    formatEngineLaunchFailure({
      checks: {
        runtime: {
          lastLaunchFailure: {
            label: "Native game frozen-bubble",
            message: "Native game frozen-bubble exited unexpectedly.",
            runtimeId: "debian-native-v1",
            sessionId: "session-1",
            stderrTail: "failed to initialize SDL video output\n",
          },
        },
      },
    }),
    "Native game frozen-bubble exited unexpectedly. Last output: failed to initialize SDL video output",
  );

  assert.equal(
    formatEngineLaunchFailure({
      checks: { runtime: { lastLaunchFailure: null } },
    }),
    null,
  );
});
