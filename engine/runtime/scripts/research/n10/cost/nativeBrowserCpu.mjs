/** Native CPU readings fail explicitly; CDP supplies only the owned process inventory. */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const helper = fileURLToPath(new URL("./native_browser_cpu.py", import.meta.url));
const previous = new WeakMap();

export async function readNativeBrowserCpu(info) {
  const child = execute("python3", [helper, "--owned-cdp-inventory"], { timeout: 1000, maxBuffer: 131072 });
  child.child.stdin.on("error", () => {}); // The bounded child result reports input/exit failures.
  child.child.stdin.end(JSON.stringify(info));
  return JSON.parse((await child).stdout);
}

export function validateBrowserCpuSample(value, count, prior) {
  if (!value || !["darwin_proc_pid_rusage_v0_mach_timebase_v1", "linux_proc_stat_ticks_v1"].includes(value.sampling_method)
      || value.process_count !== count || !Array.isArray(value.process_counters) || value.process_counters.length !== count
      || !/^[a-f0-9]{64}$/.test(value.inventory_hash) || !Number.isSafeInteger(value.native_read_duration_ns)
      || value.native_read_duration_ns < 0 || value.native_read_duration_ns > 50000000) throw new Error("native browser CPU snapshot unavailable");
  const counters = new Map(); let total = 0;
  for (const row of value.process_counters) {
    if (!/^[a-f0-9]{64}$/.test(row.identity_hash) || counters.has(row.identity_hash)
        || typeof row.cpu_ticks_decimal !== "string" || !/^\d{1,20}$/.test(row.cpu_ticks_decimal)
        || BigInt(row.cpu_ticks_decimal) >= 2n ** 64n
        || !Number.isSafeInteger(row.seconds_numerator) || row.seconds_numerator < 1
        || !Number.isSafeInteger(row.seconds_denominator) || row.seconds_denominator < 1
        || !Number.isFinite(row.cpu_seconds) || row.cpu_seconds < 0 || row.cpu_seconds > Number.MAX_SAFE_INTEGER
        || Math.abs(row.cpu_seconds - Number(row.cpu_ticks_decimal) * row.seconds_numerator / row.seconds_denominator) > 1e-9) throw new Error("native browser CPU counter invalid");
    if (prior) {
      const old = prior.process_counters.find((item) => item.identity_hash === row.identity_hash);
      if (!old || old.seconds_numerator !== row.seconds_numerator || old.seconds_denominator !== row.seconds_denominator
          || BigInt(row.cpu_ticks_decimal) < BigInt(old.cpu_ticks_decimal)) throw new Error("native browser CPU lifetime or counter changed");
    }
    counters.set(row.identity_hash, row); total += row.cpu_seconds;
  }
  const inventory = createHash("sha256").update(JSON.stringify(value.process_counters.map((row) => row.identity_hash))).digest("hex");
  if (value.inventory_hash !== inventory || !Number.isFinite(value.cpu_seconds) || Math.abs(total - value.cpu_seconds) > 1e-9
      || (prior && (prior.inventory_hash !== value.inventory_hash || prior.process_count !== count
          || prior.sampling_method !== value.sampling_method))) throw new Error("native browser CPU inventory or total changed");
  return value;
}

export async function sampleOwnedBrowserCpu(session, { read = readNativeBrowserCpu } = {}) {
  const { processInfo } = await session.send("SystemInfo.getProcessInfo");
  if (!Array.isArray(processInfo) || !processInfo.length || processInfo.length > 128
      || processInfo.some((row) => !Number.isSafeInteger(row.id) || row.id < 1 || row.id >= 2 ** 31
          || typeof row.type !== "string" || !row.type.length || row.type.length > 128)
      || new Set(processInfo.map((row) => row.id)).size !== processInfo.length) throw new Error("owned browser inventory unavailable");
  const start = process.hrtime.bigint();
  const value = validateBrowserCpuSample(await read(processInfo.map(({ id, type }) => ({ id, type }))), processInfo.length, previous.get(session));
  const end = process.hrtime.bigint();
  if (end - start > 1000000000n || !Number.isSafeInteger(Number(end))) throw new Error("native browser CPU sampling deadline");
  previous.set(session, value);
  return { ...value, host_at_ns: Number(end), host_read_duration_ns: Number(end - start) };
}
