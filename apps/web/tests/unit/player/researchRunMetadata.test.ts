import assert from "node:assert/strict";
import test from "node:test";
import {
  createResearchRunMetadata,
  createResearchRunMetadataFilename,
  researchRunMetadataToJson,
  type ResearchRunMetadataForm,
} from "../../../src/features/player/research/researchRunMetadata.ts";

const form: ResearchRunMetadataForm = {
  coldStart: true,
  networkType: "Wi-Fi",
  notes: "LAN client beside host",
  scenario: "lan",
};

test("research run metadata captures stable experiment fields", () => {
  const metadata = createResearchRunMetadata({
    capturedAt: new Date("2026-07-04T02:03:04.000Z"),
    form,
    gameId: "beat-beast",
    gameTitle: "Beat Beast",
    playerMode: "host",
    runId: "edge-run-1",
    sessionId: "session-1",
    shareUrl: "https://example.test/session",
    status: "playing",
    streamProfile: {
      bitrateKbps: 1000,
      fps: 60,
      id: "balanced",
    },
    userAgent: "unit-test-browser",
  });

  assert.deepEqual(metadata, {
    capturedAt: "2026-07-04T02:03:04.000Z",
    client: {
      userAgent: "unit-test-browser",
    },
    game: {
      id: "beat-beast",
      title: "Beat Beast",
    },
    networkType: "Wi-Fi",
    notes: "LAN client beside host",
    playerMode: "host",
    runId: "edge-run-1",
    scenario: "lan",
    schemaVersion: 1,
    sessionId: "session-1",
    shareUrl: "https://example.test/session",
    status: "playing",
    streamProfile: {
      bitrateKbps: 1000,
      fps: 60,
      id: "balanced",
    },
    trial: {
      coldStart: true,
    },
  });
});

test("research run metadata trims optional notes and network fields", () => {
  const metadata = createResearchRunMetadata({
    capturedAt: new Date("2026-07-04T02:03:04.000Z"),
    form: {
      coldStart: false,
      networkType: "   ",
      notes: "   ",
      scenario: "localhost",
    },
    gameId: undefined,
    gameTitle: "",
    playerMode: "guest",
    runId: "edge-run-2",
    sessionId: "session-2",
    shareUrl: "",
    status: "connecting",
    streamProfile: {},
    userAgent: "unit-test-browser",
  });

  assert.equal(metadata.game.id, null);
  assert.equal(metadata.game.title, null);
  assert.equal(metadata.networkType, null);
  assert.equal(metadata.notes, null);
  assert.equal(metadata.shareUrl, null);
  assert.deepEqual(metadata.streamProfile, {
    bitrateKbps: null,
    fps: null,
    id: null,
  });
});

test("research run metadata JSON is pretty printed with trailing newline", () => {
  const json = researchRunMetadataToJson(
    createResearchRunMetadata({
      capturedAt: new Date("2026-07-04T02:03:04.000Z"),
      form,
      gameId: "beat-beast",
      gameTitle: "Beat Beast",
      playerMode: "host",
      runId: "edge-run-1",
      sessionId: "session-1",
      shareUrl: "",
      status: "playing",
      streamProfile: { id: "balanced" },
      userAgent: "unit-test-browser",
    }),
  );

  assert.match(json, /\n {2}"schemaVersion": 1,\n/);
  assert.equal(json.endsWith("\n"), true);
});

test("research run metadata filenames are filesystem-safe", () => {
  assert.equal(
    createResearchRunMetadataFilename({
      gameId: "Beat Beast / edge study",
      recordedAt: new Date("2026-07-04T02:03:04.000Z"),
      runId: "edge:run:1",
    }),
    "pixelated-research-run-Beat-Beast-edge-study-edge-run-1-2026-07-04T02-03-04-000Z.json",
  );
});
