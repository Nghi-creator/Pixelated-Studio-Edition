import fs from "fs";

const CLOCK_TICKS_PER_SECOND = 100;
const PAGE_SIZE_BYTES = 4096;

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

export function readNumberFile(filePath: string): number | null {
  try {
    return Number(fs.readFileSync(filePath, "utf8").trim());
  } catch (err) {
    return null;
  }
}

function readSystemUptimeSeconds(): number | null {
  try {
    return Number(fs.readFileSync("/proc/uptime", "utf8").split(" ")[0]);
  } catch (err) {
    return null;
  }
}

export function readProcessSnapshot(
  pid?: number | null,
): ProcessResourceSnapshot | null {
  if (!pid || !fs.existsSync(`/proc/${pid}`)) return null;

  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const statm = fs.readFileSync(`/proc/${pid}/statm`, "utf8");
    const endCommandIndex = stat.lastIndexOf(")");
    const statFields = stat.slice(endCommandIndex + 2).split(" ");
    const statmFields = statm.trim().split(" ");
    const utimeTicks = Number(statFields[11]);
    const stimeTicks = Number(statFields[12]);
    const startTimeTicks = Number(statFields[19]);
    const residentPages = Number(statmFields[1]);
    const systemUptimeSeconds = readSystemUptimeSeconds();
    const processUptimeSeconds =
      systemUptimeSeconds === null
        ? null
        : systemUptimeSeconds - startTimeTicks / CLOCK_TICKS_PER_SECOND;
    const cpuSeconds = (utimeTicks + stimeTicks) / CLOCK_TICKS_PER_SECOND;
    const averageCpuPercent =
      processUptimeSeconds && processUptimeSeconds > 0
        ? (cpuSeconds / processUptimeSeconds) * 100
        : null;

    return {
      averageCpuPercent:
        averageCpuPercent === null ? null : Number(averageCpuPercent.toFixed(2)),
      pid,
      rssMb: Number(
        ((residentPages * PAGE_SIZE_BYTES) / 1024 / 1024).toFixed(2),
      ),
    };
  } catch (err) {
    return null;
  }
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
  } catch (err) {
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
