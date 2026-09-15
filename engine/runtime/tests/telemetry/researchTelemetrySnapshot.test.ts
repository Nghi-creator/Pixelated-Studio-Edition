import assert from "node:assert/strict";
import test from "node:test";
import { createResearchTelemetrySnapshot } from "../../src/telemetry/researchTelemetrySnapshot";
import { createIntervalResourceSampler } from "../../src/telemetry/intervalResourceSampler";

test("readers cannot advance sampling intervals or reuse stale/session-mismatched evidence", () => {
  let now = 0;
  let ticks = 0;
  let reads = 0;
  let session = "run-1";
  const resourceSampler = createIntervalResourceSampler({
    now: () => now, logicalCpuCount: 1, cpuCapacityCores: 1,
    readProcessCounters: (pid) => {
      reads++;
      return { pid, cpuTicks: ticks, rssMb: 1, startTimeTicks: 1 };
    },
  });
  const get = createResearchTelemetrySnapshot({
    autoStart: false, now: () => now, monotonicNow: () => now,
    resourceSampler, cameraTelemetryStatePath: "/nonexistent/audit-telemetry",
    runtimeKind: "libretro",
    getRuntimeState: () => ({ activeSessionId: session, cameraProcess: { pid: 2 }, retroarchProcess: { pid: 3 } }),
  });
  assert.equal(get(session), null);
  get.sample();
  const first = get(session);
  now = 999; ticks = 100;
  for (let i = 0; i < 100; i++) assert.equal(get(session), first);
  assert.equal(reads, 3);
  now = 1000;
  get.sample();
  assert.equal(get(session)?.engine.cameraCpuPercent, 100);
  assert.equal(get(session)?.sampleIntervalMs, 1000);
  assert.equal(get(session)?.sampleSequence, 2);
  assert.equal(Object.isFrozen(get(session)?.engine), true);
  assert.equal(get("other"), null);
  now = 4001;
  assert.equal(get(session), null);
  session = "run-2";
  assert.equal(get(session), null);
  get.sample();
  assert.equal(get(session)?.sampleIntervalMs, null);
  get.stop();
});
