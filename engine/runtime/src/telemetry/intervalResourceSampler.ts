import fs from "fs";
import os from "os";

const CLOCK_TICKS_PER_SECOND = 100;
const PAGE_SIZE_BYTES = 4096;

type ProcessCounters = {
  cpuTicks: number;
  pid: number;
  rssMb: number;
  startTimeTicks: number;
};

type PreviousProcessSample = ProcessCounters & {
  sampledAtMs: number;
};

export type IntervalProcessResource = {
  cpuPercent: number | null;
  rssMb: number | null;
  running: boolean;
};

type IntervalResourceSamplerOptions = {
  cpuCapacityCores?: number;
  logicalCpuCount?: number;
  now?: () => number;
  readProcessCounters?: (pid: number) => ProcessCounters | null;
};

function positiveNumberFile(filePath: string): number | null {
  try {
    const value = Number(fs.readFileSync(filePath, "utf8").trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function readCpuCapacityCores(logicalCpuCount: number): number {
  try {
    const [quotaText, periodText] = fs
      .readFileSync("/sys/fs/cgroup/cpu.max", "utf8")
      .trim()
      .split(/\s+/);
    if (quotaText !== "max") {
      const quota = Number(quotaText);
      const period = Number(periodText);
      if (quota > 0 && period > 0) {
        return Number(Math.min(logicalCpuCount, quota / period).toFixed(2));
      }
    }
  } catch {
    const quota = positiveNumberFile("/sys/fs/cgroup/cpu/cpu.cfs_quota_us");
    const period = positiveNumberFile("/sys/fs/cgroup/cpu/cpu.cfs_period_us");
    if (quota !== null && period !== null) {
      return Number(Math.min(logicalCpuCount, quota / period).toFixed(2));
    }
  }
  return logicalCpuCount;
}

export function readLinuxProcessCounters(pid: number): ProcessCounters | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const statm = fs.readFileSync(`/proc/${pid}/statm`, "utf8");
    const endCommandIndex = stat.lastIndexOf(")");
    if (endCommandIndex < 0) return null;
    const fields = stat.slice(endCommandIndex + 2).trim().split(/\s+/);
    const statmFields = statm.trim().split(/\s+/);
    const userTicks = Number(fields[11]);
    const systemTicks = Number(fields[12]);
    const startTimeTicks = Number(fields[19]);
    const residentPages = Number(statmFields[1]);
    if (
      ![userTicks, systemTicks, startTimeTicks, residentPages].every(
        Number.isFinite,
      )
    ) {
      return null;
    }
    return {
      cpuTicks: userTicks + systemTicks,
      pid,
      rssMb: Number(
        ((residentPages * PAGE_SIZE_BYTES) / 1024 / 1024).toFixed(2),
      ),
      startTimeTicks,
    };
  } catch {
    return null;
  }
}

export function createIntervalResourceSampler(
  options: IntervalResourceSamplerOptions = {},
) {
  const logicalCpuCount = Math.max(
    1,
    Math.floor(options.logicalCpuCount || os.cpus().length || 1),
  );
  const now = options.now || Date.now;
  const readCounters = options.readProcessCounters || readLinuxProcessCounters;
  const cpuCapacityCores =
    options.cpuCapacityCores || readCpuCapacityCores(logicalCpuCount);
  const previousByLabel = new Map<string, PreviousProcessSample>();

  function sampleProcess(
    label: string,
    pid?: number | null,
  ): IntervalProcessResource {
    if (!pid) {
      previousByLabel.delete(label);
      return { cpuPercent: null, rssMb: null, running: false };
    }
    const counters = readCounters(pid);
    if (!counters) {
      previousByLabel.delete(label);
      return { cpuPercent: null, rssMb: null, running: false };
    }

    const sampledAtMs = now();
    const previous = previousByLabel.get(label);
    previousByLabel.set(label, { ...counters, sampledAtMs });
    if (
      !previous ||
      previous.pid !== counters.pid ||
      previous.startTimeTicks !== counters.startTimeTicks
    ) {
      return { cpuPercent: null, rssMb: counters.rssMb, running: true };
    }

    const elapsedMs = sampledAtMs - previous.sampledAtMs;
    const cpuTicksDelta = counters.cpuTicks - previous.cpuTicks;
    const cpuPercent =
      elapsedMs > 0 && cpuTicksDelta >= 0
        ? ((cpuTicksDelta / CLOCK_TICKS_PER_SECOND) / (elapsedMs / 1000)) * 100
        : null;

    return {
      cpuPercent:
        cpuPercent === null ? null : Number(cpuPercent.toFixed(2)),
      rssMb: counters.rssMb,
      running: true,
    };
  }

  return {
    cpuCapacityCores,
    logicalCpuCount,
    sampleProcess,
  };
}
