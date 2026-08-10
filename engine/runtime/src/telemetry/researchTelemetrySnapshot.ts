import { readCameraPeerState } from "./resourceSnapshot";
import { readEncoderTelemetryState } from "./encoderTelemetryState";
import { createIntervalResourceSampler } from "./intervalResourceSampler";

type ProcessRef = { pid?: number | null } | null | undefined;

type ResearchRuntimeState = {
  activeSessionId?: string | null;
  cameraPeerStatePath?: string | null;
  cameraProcess?: ProcessRef;
  retroarchProcess?: ProcessRef;
};

type ResearchTelemetrySnapshotOptions = {
  cameraTelemetryStatePath: string;
  getRuntimeState: () => ResearchRuntimeState;
  now?: () => number;
  resourceSampler?: ReturnType<typeof createIntervalResourceSampler>;
  runtimeKind: "libretro" | "native_linux";
};

export const RESEARCH_TELEMETRY_SCHEMA_VERSION = 1;

export function createResearchTelemetrySnapshot(
  options: ResearchTelemetrySnapshotOptions,
) {
  const now = options.now || Date.now;
  const resources = options.resourceSampler || createIntervalResourceSampler();

  return function getResearchTelemetrySnapshot(sessionId: string) {
    const runtime = options.getRuntimeState();
    if (!runtime.activeSessionId || runtime.activeSessionId !== sessionId) {
      return null;
    }
    const node = resources.sampleProcess("node", process.pid);
    const emulator = resources.sampleProcess(
      "emulator",
      runtime.retroarchProcess?.pid,
    );
    const camera = resources.sampleProcess("camera", runtime.cameraProcess?.pid);
    const peers = readCameraPeerState(runtime.cameraPeerStatePath);

    return {
      capturedAt: new Date(now()).toISOString(),
      encoder: readEncoderTelemetryState(
        options.cameraTelemetryStatePath,
        sessionId,
        { now },
      ),
      engine: {
        cpuCapacityCores: resources.cpuCapacityCores,
        cameraCpuPercent: camera.cpuPercent,
        cameraRssMb: camera.rssMb,
        cameraRunning: camera.running,
        emulatorCpuPercent: emulator.cpuPercent,
        emulatorRssMb: emulator.rssMb,
        emulatorRunning: emulator.running,
        logicalCpuCount: resources.logicalCpuCount,
        nodeCpuPercent: node.cpuPercent,
        nodeRssMb: node.rssMb,
        nodeRunning: node.running,
        peerCount:
          peers.sessionId === sessionId ? Math.max(0, peers.peerCount) : 0,
        runtimeKind: options.runtimeKind,
      },
      schemaVersion: RESEARCH_TELEMETRY_SCHEMA_VERSION,
      sessionId,
    };
  };
}
