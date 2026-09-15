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
  monotonicNow?: () => number;
  autoStart?: boolean;
  resourceSampler?: ReturnType<typeof createIntervalResourceSampler>;
  runtimeKind: "libretro" | "native_linux";
};

export const RESEARCH_TELEMETRY_SCHEMA_VERSION = 1;

export function createResearchTelemetrySnapshot(
  options: ResearchTelemetrySnapshotOptions,
) {
  const now = options.now || Date.now;
  const resources = options.resourceSampler || createIntervalResourceSampler();

  function capture(sessionId: string) {
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
  }

  type Snapshot = NonNullable<ReturnType<typeof capture>> & {
    sampleSequence: number;
    sampleIntervalMs: number | null;
  };
  const monotonicNow = options.monotonicNow || (() => performance.now());
  let snapshot: Snapshot | null = null;
  let sampledAt: number | null = null;
  let sequence = 0;
  const sample = () => {
    const sessionId = options.getRuntimeState().activeSessionId;
    if (!sessionId) { snapshot = null; sampledAt = null; return; }
    const captured = capture(sessionId);
    if (!captured) return;
    const current = monotonicNow();
    const interval = sampledAt === null || snapshot?.sessionId !== sessionId
      ? null : Math.max(0, current - sampledAt);
    sampledAt = current;
    snapshot = Object.freeze({ ...captured,
      engine: Object.freeze(captured.engine), encoder: Object.freeze(captured.encoder),
      sampleSequence: ++sequence, sampleIntervalMs: interval });
  };
  // Readers never advance process counters. Sampling belongs to the engine.
  const timer = options.autoStart === false ? null : setInterval(sample, 1_000);
  timer?.unref();
  const getSnapshot = (sessionId: string) => {
    if (!snapshot || options.getRuntimeState().activeSessionId !== sessionId ||
        snapshot.sessionId !== sessionId || sampledAt === null ||
        monotonicNow() - sampledAt > 3_000) return null;
    return snapshot;
  };
  return Object.assign(getSnapshot, { sample, stop: () => { if (timer) clearInterval(timer); } });
}
