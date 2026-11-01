import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { sampleOwnedBrowserCpu, validateBrowserCpuSample } from "./nativeBrowserCpu.mjs";

function snapshot(a = 10, b = 20) {
  const rows = [a, b].map((ticks, index) => ({ identity_hash: String(index + 1).repeat(64),
    cpu_ticks_decimal: String(ticks), seconds_numerator: 1, seconds_denominator: 100, cpu_seconds: ticks / 100 }));
  return { sampling_method: "linux_proc_stat_ticks_v1", process_count: 2,
    inventory_hash: createHash("sha256").update(JSON.stringify(rows.map((r) => r.identity_hash))).digest("hex"),
    cpu_seconds: rows.reduce((sum, row) => sum + row.cpu_seconds, 0), native_read_duration_ns: 1000, process_counters: rows };
}
function session() { return { send: async () => ({ processInfo: [{ id: 10, type: "renderer", cpuTime: 0 }, { id: 20, type: "GPU", cpuTime: 0 }] }) }; }

test("CDP supplies only inventory; zero/error-like CDP CPU values are not used", async () => {
  const result = await sampleOwnedBrowserCpu(session(), { read: async (info) => {
    assert.deepEqual(info, [{ id: 10, type: "renderer" }, { id: 20, type: "GPU" }]);
    return snapshot();
  } });
  assert.ok(Math.abs(result.cpu_seconds - 0.3) < 1e-12);
  assert.ok(result.host_at_ns > 0);
});

test("native failure cannot fabricate a zero reading", async () => {
  await assert.rejects(sampleOwnedBrowserCpu(session(), { read: async () => { throw new Error("counter unavailable"); } }), /counter unavailable/);
});

test("a per-process reset cannot hide behind a larger aggregate", async () => {
  const owned = session();
  await sampleOwnedBrowserCpu(owned, { read: async () => snapshot(30, 20) });
  await assert.rejects(sampleOwnedBrowserCpu(owned, { read: async () => snapshot(29, 80) }), /counter changed/);
});

test("Mach ticks must be converted using the supplied native timebase", () => {
  const value = snapshot(24000000, 24000000);
  value.sampling_method = "darwin_proc_pid_rusage_v0_mach_timebase_v1";
  for (const row of value.process_counters) Object.assign(row, { seconds_numerator: 125, seconds_denominator: 3000000000, cpu_seconds: 1 });
  value.cpu_seconds = 2;
  assert.equal(validateBrowserCpuSample(value, 2).cpu_seconds, 2);
  value.process_counters[0].cpu_seconds = 0.024;
  assert.throws(() => validateBrowserCpuSample(value, 2), /counter invalid/);
});

test("changed lifetime, duplicate identity, bad total and read gaps are unavailable", () => {
  for (const mutate of [
    (v) => { v.process_counters[0].identity_hash = "a".repeat(64); },
    (v) => { v.process_counters[1].identity_hash = v.process_counters[0].identity_hash; },
    (v) => { v.cpu_seconds = 0; },
    (v) => { v.native_read_duration_ns = 50000001; },
  ]) {
    const value = snapshot(); mutate(value);
    assert.throws(() => validateBrowserCpuSample(value, 2, snapshot()));
  }
});

test("native helper reads a real owned process with a nonzero lifetime CPU", { skip: !["linux", "darwin"].includes(process.platform) }, async () => {
  const owned = { send: async () => ({ processInfo: [{ id: process.pid, type: "browser", cpuTime: 0 }] }) };
  const result = await sampleOwnedBrowserCpu(owned);
  assert.equal(result.process_count, 1);
  assert.ok(result.cpu_seconds > 0);
  assert.equal(result.process_counters.length, 1);
});
