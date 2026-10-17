import assert from "node:assert/strict";
import fs from "node:fs";
import test, { type TestContext } from "node:test";
import { readLinuxProcessCounters } from "../../src/telemetry/linuxProcessCounters";
import { readProcessSnapshot } from "../../src/telemetry/resourceSnapshot";

function procStat(user = "100", system = "50") {
  const fields = Array<string>(30).fill("0");
  fields[0] = "S";
  fields[11] = user;
  fields[12] = system;
  fields[19] = "100";
  return `42 (camera (worker)) ${fields.join("  ")}\n`;
}

function mockProc(context: TestContext, stat: string, uptime = "11 0") {
  context.mock.method(fs, "readFileSync", ((file: unknown) => {
    if (file === "/proc/42/stat") return stat;
    if (file === "/proc/42/statm") return "100  256\n";
    if (file === "/proc/uptime") return uptime;
    throw new Error("process unavailable");
  }) as typeof fs.readFileSync);
}

test("health and interval telemetry share whitespace-safe process counter parsing", (context) => {
  mockProc(context, procStat());
  assert.deepEqual(readLinuxProcessCounters(42), {
    pid: 42, cpuTicks: 150, startTimeTicks: 100, rssMb: 1,
  });
  assert.deepEqual(readProcessSnapshot(42), {
    pid: 42, averageCpuPercent: 15, rssMb: 1,
  });
});

for (const value of ["NaN", "Infinity", "-1", "0.5", "9007199254740992"]) {
  test(`malformed process counters are unavailable: ${value}`, (context) => {
    mockProc(context, procStat(value));
    assert.equal(readLinuxProcessCounters(42), null);
    assert.equal(readProcessSnapshot(42), null);
  });
}

test("invalid uptime leaves average CPU unavailable while preserving memory", (context) => {
  mockProc(context, procStat(), "NaN 0");
  assert.deepEqual(readProcessSnapshot(42), {
    pid: 42, averageCpuPercent: null, rssMb: 1,
  });
});

test("missing processes and invalid PIDs are unavailable", () => {
  assert.equal(readProcessSnapshot(-1), null);
  assert.equal(readProcessSnapshot(), null);
  assert.equal(readLinuxProcessCounters(1.5), null);
});
