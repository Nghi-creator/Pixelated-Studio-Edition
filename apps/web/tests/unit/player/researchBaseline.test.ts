import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyResearchBaselineForm,
  createResearchBaseline,
  createResearchBaselineFilename,
  researchBaselineToJson,
  sanitizeResearchBaseline,
  sanitizedResearchBaselineToJson,
  type ResearchBaselineForm,
} from "../../../src/features/player/research/researchBaseline.ts";
import type { ResearchRunMetadata } from "../../../src/features/player/research/researchRunMetadata.ts";

const metadata: ResearchRunMetadata = {
  capturedAt: "2026-07-04T02:03:04.000Z",
  client: {
    userAgent: "metadata-browser",
  },
  game: {
    id: "beat-beast",
    title: "Beat Beast",
  },
  networkType: "Wi-Fi",
  notes: null,
  playerMode: "host",
  runId: "edge-run-1",
  scenario: "browser_only_baseline",
  schemaVersion: 1,
  sessionId: "session-1",
  shareUrl: null,
  status: "playing",
  streamProfile: {
    bitrateKbps: 1000,
    fps: 60,
    id: "balanced",
  },
  trial: {
    coldStart: false,
  },
};

test("empty research baseline form contains manual baseline fields", () => {
  assert.deepEqual(createEmptyResearchBaselineForm(), {
    browserMemoryMb: "",
    cpuNotes: "",
    deviceNotes: "",
    emulatorId: "",
    fps: "",
    startupMs: "",
  });
});

test("research baseline exports comparable browser-only measurements", () => {
  const form: ResearchBaselineForm = {
    browserMemoryMb: " 512.5 ",
    cpuNotes: "Chrome task manager showed moderate CPU",
    deviceNotes: "Laptop client",
    emulatorId: "wasm-nes",
    fps: "59.8",
    startupMs: "1234",
  };

  assert.deepEqual(
    createResearchBaseline({
      capturedAt: new Date("2026-07-04T02:05:04.000Z"),
      form,
      metadata,
      userAgent: "unit-test-browser",
    }),
    {
      capturedAt: "2026-07-04T02:05:04.000Z",
      game: {
        id: "beat-beast",
        title: "Beat Beast",
      },
      measurements: {
        browserMemoryMb: 512.5,
        fps: 59.8,
        startupMs: 1234,
      },
      notes: {
        cpu: "Chrome task manager showed moderate CPU",
        device: "Laptop client",
      },
      runId: "edge-run-1",
      scenario: "browser_only_baseline",
      schemaVersion: 1,
      sessionId: "session-1",
      userAgent: "unit-test-browser",
      wasmRuntime: {
        emulatorId: "wasm-nes",
      },
    },
  );
});

test("research baseline invalid optional numbers become null", () => {
  const baseline = createResearchBaseline({
    form: {
      browserMemoryMb: "-1",
      cpuNotes: " ",
      deviceNotes: "",
      emulatorId: " ",
      fps: "NaN",
      startupMs: "",
    },
    metadata,
    userAgent: "unit-test-browser",
  });

  assert.deepEqual(baseline.measurements, {
    browserMemoryMb: null,
    fps: null,
    startupMs: null,
  });
  assert.deepEqual(baseline.notes, {
    cpu: null,
    device: null,
  });
  assert.deepEqual(baseline.wasmRuntime, {
    emulatorId: null,
  });
});

test("research baseline JSON is pretty printed with trailing newline", () => {
  const json = researchBaselineToJson(
    createResearchBaseline({
      form: createEmptyResearchBaselineForm(),
      metadata,
      userAgent: "unit-test-browser",
    }),
  );

  assert.match(json, /\n {2}"scenario": "browser_only_baseline",\n/);
  assert.equal(json.endsWith("\n"), true);
});

test("formal research baseline omits free-text notes", () => {
  const baseline = createResearchBaseline({
    form: {
      browserMemoryMb: "512",
      cpuNotes: "username alice on host workstation.local",
      deviceNotes: "/Users/alice/private",
      emulatorId: "wasm-nes",
      fps: "60",
      startupMs: "1000",
    },
    metadata,
    userAgent: "unit-test-browser",
  });
  const sanitized = sanitizeResearchBaseline(baseline);
  const json = sanitizedResearchBaselineToJson(sanitized);

  assert.equal("notes" in sanitized, false);
  assert.equal(json.includes("alice"), false);
  assert.equal(json.includes("/Users/"), false);
  assert.equal(sanitized.measurements.browserMemoryMb, 512);
  assert.equal(sanitized.wasmRuntime.emulatorId, "wasm-nes");
});

test("research baseline filenames are filesystem-safe", () => {
  assert.equal(
    createResearchBaselineFilename({
      gameId: "Beat Beast / edge study",
      recordedAt: new Date("2026-07-04T02:05:04.000Z"),
      runId: "edge:run:1",
    }),
    "pixelated-browser-baseline-Beat-Beast-edge-study-edge-run-1-2026-07-04T02-05-04-000Z.json",
  );
});
