import fs from "fs";

import { CLOCK_TICKS_PER_SECOND, readLinuxProcessCounters } from "./linuxProcessCounters";

type ProcessRef = {
  pid?: number | null;
} | null | undefined;

type RuntimeState = {
  cameraPeerStatePath?: string | null;
  cameraProcess?: ProcessRef;
  retroarchProcess?: ProcessRef;
};

export type ProcessResourceSnapshot = {
  averageCpuPercent: number | null;
  pid: number;
  rssMb: number;
};

export type CameraPeerState = {
  peerCount: number;
  peerIds: string[];
  sessionId: string | null;
};

function readSystemUptimeSeconds(): number | null {
  try {
    const value = Number(fs.readFileSync("/proc/uptime", "utf8").trim().split(/\s+/)[0]);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

export function readProcessSnapshot(
  pid?: number | null,
): ProcessResourceSnapshot | null {
  if (pid == null) return null;
  const counters = readLinuxProcessCounters(pid);
  if (!counters) return null;

  const systemUptimeSeconds = readSystemUptimeSeconds();
  const processUptimeSeconds =
    systemUptimeSeconds === null
      ? null
      : systemUptimeSeconds - counters.startTimeTicks / CLOCK_TICKS_PER_SECOND;
  const cpuSeconds = counters.cpuTicks / CLOCK_TICKS_PER_SECOND;
  const averageCpuPercent =
    processUptimeSeconds && processUptimeSeconds > 0
      ? (cpuSeconds / processUptimeSeconds) * 100
      : null;

  return {
    averageCpuPercent:
      averageCpuPercent === null ? null : Number(averageCpuPercent.toFixed(2)),
    pid,
    rssMb: counters.rssMb,
  };
}

export function readCameraPeerState(
  filePath?: string | null,
): CameraPeerState {
  if (!filePath) {
    return {
      peerCount: 0,
      peerIds: [],
      sessionId: null,
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      peerCount?: unknown;
      peerIds?: unknown;
      sessionId?: unknown;
    };

    return {
      peerCount: Number(parsed.peerCount) || 0,
      peerIds: Array.isArray(parsed.peerIds)
        ? parsed.peerIds.filter(
            (peerId): peerId is string => typeof peerId === "string",
          )
        : [],
      sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : null,
    };
  } catch {
    return {
      peerCount: 0,
      peerIds: [],
      sessionId: null,
    };
  }
}

export function createResourceSnapshot(runtimeState: RuntimeState) {
  return {
    camera: readProcessSnapshot(runtimeState.cameraProcess?.pid),
    cameraPeers: readCameraPeerState(runtimeState.cameraPeerStatePath),
    node: {
      averageCpuPercent: null,
      pid: process.pid,
      rssMb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2)),
    },
    retroarch: readProcessSnapshot(runtimeState.retroarchProcess?.pid),
  };
}
