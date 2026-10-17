import fs from "fs";

export const CLOCK_TICKS_PER_SECOND = 100;
const PAGE_SIZE_BYTES = 4096;

export type ProcessCounters = {
  cpuTicks: number;
  pid: number;
  rssMb: number;
  startTimeTicks: number;
};

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
        (value) => Number.isSafeInteger(value) && value >= 0,
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

