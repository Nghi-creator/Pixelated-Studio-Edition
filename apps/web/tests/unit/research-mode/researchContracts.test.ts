import assert from "node:assert/strict";
import test from "node:test";
import {
  getPlayerExperiencePolicy,
} from "../../../src/features/research-mode/playerExperience.ts";
import {
  getGameDestination,
} from "../../../src/features/research-mode/researchRoutes.ts";
import {
  isResearchRunConfig,
  RESEARCH_RUN_CONFIG_SCHEMA_VERSION,
  validateResearchRunConfig,
  type ResearchRunConfig,
} from "../../../src/features/research-mode/researchRunConfig.ts";
import {
  BROWSER_RESEARCH_METRIC_KEYS,
  ENCODER_RESEARCH_METRIC_KEYS,
  ENGINE_RESEARCH_METRIC_KEYS,
  RESEARCH_TELEMETRY_SCHEMA_VERSION,
} from "../../../src/features/research-mode/researchTelemetryContract.ts";
import {
  createResearchBundleManifest,
  RESEARCH_BUNDLE_SCHEMA_VERSION,
  RESEARCH_BUNDLE_V2_REQUIRED_FILES,
} from "../../../src/features/player/research/researchBundleManifest.ts";

const validConfig: ResearchRunConfig = {
  coldStart: false,
  comparisonCaseId: "controlled-run-001",
  gameId: "fixture-game",
  interventionLabel: "stream_profile_relief",
  networkType: "Ethernet",
  nodeLabel: "edge-node-a",
  notes: "Sanitized fixture",
  phase: "degraded",
  recordingDurationMs: 60_000,
  runId: "fixture-run-001-degraded",
  runtimeLabel: "docker-libretro",
  scenario: "localhost",
  schemaVersion: RESEARCH_RUN_CONFIG_SCHEMA_VERSION,
  streamProfileId: "balanced",
  warmupDurationMs: 10_000,
};

test("normal game destinations preserve the existing play route", () => {
  assert.equal(getGameDestination("game-1"), "/play/game-1");
  assert.equal(getGameDestination("game-1", "normal"), "/play/game-1");
  assert.equal(
    getGameDestination("game-1", "research"),
    "/research/games/game-1/setup",
  );
});

test("normal player policy preserves current controls and social behavior", () => {
  assert.deepEqual(getPlayerExperiencePolicy("normal"), {
    allowAudioControls: true,
    allowFullscreen: true,
    allowKeyboardMapping: true,
    allowLobbyAndSharing: true,
    recordPlayCount: true,
    showCommunity: true,
    showStreamTelemetryControls: true,
  });
});

test("research player policy keeps gameplay controls and suppresses social effects", () => {
  assert.deepEqual(getPlayerExperiencePolicy("research"), {
    allowAudioControls: true,
    allowFullscreen: true,
    allowKeyboardMapping: true,
    allowLobbyAndSharing: false,
    recordPlayCount: false,
    showCommunity: false,
    showStreamTelemetryControls: true,
  });
});

test("research run config accepts a complete versioned configuration", () => {
  assert.equal(isResearchRunConfig(validConfig), true);
  assert.deepEqual(validateResearchRunConfig(validConfig), []);
});

test("research run config rejects ambiguous or unsafe timing contracts", () => {
  const errors = validateResearchRunConfig({
    ...validConfig,
    comparisonCaseId: " ",
    recordingDurationMs: 0,
    schemaVersion: 999,
    warmupDurationMs: -1,
  });

  assert.deepEqual(errors, [
    "Unsupported run configuration schema version.",
    "Comparison case ID is required.",
    "Warm-up duration is outside the supported range.",
    "Recording duration is outside the supported range.",
  ]);
});

test("research telemetry contract freezes source metric names and nullability", () => {
  assert.equal(RESEARCH_TELEMETRY_SCHEMA_VERSION, 1);
  assert.deepEqual(BROWSER_RESEARCH_METRIC_KEYS, [
    "roundTripTimeMs",
    "framesDecoded",
    "framesDropped",
    "decodeTimeMeanMs",
    "jitterBufferDelayMeanMs",
    "freezeCount",
    "freezeDurationTotalMs",
    "keyFramesDecoded",
    "availableIncomingBitrateKbps",
  ]);
  assert.equal(ENGINE_RESEARCH_METRIC_KEYS.includes("cameraCpuPercent"), true);
  assert.equal(ENCODER_RESEARCH_METRIC_KEYS.includes("framesDroppedTotal"), true);
});

test("bundle manifest v2 declares additive files and privacy omissions", () => {
  const manifest = createResearchBundleManifest({
    comparisonCaseId: "controlled-run-001",
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
    files: RESEARCH_BUNDLE_V2_REQUIRED_FILES.map((name) => ({
      mediaType: name.endsWith(".json")
        ? "application/json"
        : "text/csv",
      name,
      required: true,
    })),
    phase: "degraded",
    runId: "run-001-degraded",
    telemetrySources: {
      browser_webrtc: "supported",
      encoder_pipeline: "unavailable",
      engine_runtime: "supported",
    },
  });

  assert.equal(manifest.schemaVersion, RESEARCH_BUNDLE_SCHEMA_VERSION);
  assert.deepEqual(
    manifest.files.map((file) => file.name),
    RESEARCH_BUNDLE_V2_REQUIRED_FILES,
  );
  assert.equal(manifest.privacy.sanitized, true);
  assert.equal(manifest.privacy.omittedFields.includes("shareUrl"), true);
  assert.equal(manifest.privacy.omittedFields.includes("engineToken"), true);
});
