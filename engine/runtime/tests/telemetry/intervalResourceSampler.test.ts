import assert from "node:assert/strict";
import test from "node:test";
import { createIntervalResourceSampler } from "../../src/telemetry/intervalResourceSampler";

test("interval CPU sampler derives utilization from successive process ticks", () => {
  let now = 1_000;
  let cpuTicks = 100;
  let startTimeTicks = 10;
  const sampler = createIntervalResourceSampler({
    cpuCapacityCores: 4,
    logicalCpuCount: 8,
    now: () => now,
    readProcessCounters: (pid) => ({
      cpuTicks,
      pid,
      rssMb: 42,
      startTimeTicks,
    }),
  });

  assert.deepEqual(sampler.sampleProcess("game", 12), {
    cpuPercent: null,
    rssMb: 42,
    running: true,
  });
  now += 1_000;
  cpuTicks += 50;
  assert.deepEqual(sampler.sampleProcess("game", 12), {
    cpuPercent: 50,
    rssMb: 42,
    running: true,
  });
  assert.equal(sampler.logicalCpuCount, 8);
  assert.equal(sampler.cpuCapacityCores, 4);

  now += 1_000;
  startTimeTicks += 1;
  assert.equal(sampler.sampleProcess("game", 12).cpuPercent, null);
});

test("interval CPU sampler handles exits and counter resets without spikes", () => {
  let now = 1_000;
  let cpuTicks = 100;
  const sampler = createIntervalResourceSampler({
    now: () => now,
    readProcessCounters: (pid) => ({
      cpuTicks,
      pid,
      rssMb: 10,
      startTimeTicks: 1,
    }),
  });
  sampler.sampleProcess("camera", 22);
  now += 1_000;
  cpuTicks = 10;
  assert.equal(sampler.sampleProcess("camera", 22).cpuPercent, null);
  assert.deepEqual(sampler.sampleProcess("camera", null), {
    cpuPercent: null,
    rssMb: null,
    running: false,
  });
});
