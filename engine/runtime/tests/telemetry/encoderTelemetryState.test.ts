import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readEncoderTelemetryState } from "../../src/telemetry/encoderTelemetryState";

test("encoder telemetry state accepts a fresh matching atomic payload", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "encoder-state-"));
  const filePath = path.join(directory, "telemetry.json");
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      cpuUsed: 6,
      framesDroppedTotal: 2,
      framesInTotal: 100,
      framesOutTotal: 98,
      maxQuantizer: 48,
      pipelineDelayProxyMs: null,
      queueLevelBuffers: 1,
      schemaVersion: 1,
      sessionId: "session-1",
      targetBitrateKbps: 1_000,
      targetFps: 60,
      updatedAt: "2026-08-10T12:00:00.000Z",
    }),
  );

  assert.deepEqual(
    readEncoderTelemetryState(filePath, "session-1", {
      now: () => Date.parse("2026-08-10T12:00:01.000Z"),
    }),
    {
      available: true,
      cpuUsed: 6,
      error: null,
      framesDroppedTotal: 2,
      framesInTotal: 100,
      framesOutTotal: 98,
      maxQuantizer: 48,
      pipelineDelayProxyMs: null,
      queueLevelBuffers: 1,
      targetBitrateKbps: 1_000,
      targetFps: 60,
      updatedAt: "2026-08-10T12:00:00.000Z",
    },
  );
});

test("encoder telemetry state rejects stale and cross-session payloads", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "encoder-state-"));
  const filePath = path.join(directory, "telemetry.json");
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      schemaVersion: 1,
      sessionId: "session-other",
      updatedAt: "2026-08-10T12:00:00.000Z",
    }),
  );
  assert.equal(
    readEncoderTelemetryState(filePath, "session-1").available,
    false,
  );

  fs.writeFileSync(
    filePath,
    JSON.stringify({
      schemaVersion: 1,
      sessionId: "session-1",
      updatedAt: "2026-08-10T12:00:00.000Z",
    }),
  );
  const stale = readEncoderTelemetryState(filePath, "session-1", {
    now: () => Date.parse("2026-08-10T12:00:06.000Z"),
  });
  assert.equal(stale.available, false);
  assert.match(stale.error || "", /stale/);
});
