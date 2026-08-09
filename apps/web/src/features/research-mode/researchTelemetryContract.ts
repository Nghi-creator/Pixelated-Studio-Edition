export const RESEARCH_TELEMETRY_SCHEMA_VERSION = 1 as const;

export type ResearchTelemetrySource =
  | "browser_webrtc"
  | "engine_runtime"
  | "encoder_pipeline";

export type ResearchTelemetryIdentity = {
  capturedAt: string;
  elapsedMs: number;
  gameId: string;
  runId: string;
  schemaVersion: typeof RESEARCH_TELEMETRY_SCHEMA_VERSION;
  sessionId: string;
  source: ResearchTelemetrySource;
};

export type BrowserResearchMetrics = {
  availableIncomingBitrateKbps: number | null;
  decodeTimeMeanMs: number | null;
  framesDecoded: number | null;
  framesDropped: number | null;
  freezeCount: number | null;
  freezeDurationTotalMs: number | null;
  jitterBufferDelayMeanMs: number | null;
  keyFramesDecoded: number | null;
  roundTripTimeMs: number | null;
};

export type EngineResearchMetrics = {
  cameraCpuPercent: number | null;
  cameraRssMb: number | null;
  emulatorCpuPercent: number | null;
  emulatorRssMb: number | null;
  logicalCpuCount: number | null;
  nodeCpuPercent: number | null;
  nodeRssMb: number | null;
  runtimeKind: "libretro" | "native_linux" | null;
};

export type EncoderResearchMetrics = {
  cpuUsed: number | null;
  framesDroppedTotal: number | null;
  framesInTotal: number | null;
  framesOutTotal: number | null;
  maxQuantizer: number | null;
  pipelineDelayProxyMs: number | null;
  queueLevelBuffers: number | null;
  targetBitrateKbps: number | null;
  targetFps: number | null;
};

export const BROWSER_RESEARCH_METRIC_KEYS = [
  "roundTripTimeMs",
  "framesDecoded",
  "framesDropped",
  "decodeTimeMeanMs",
  "jitterBufferDelayMeanMs",
  "freezeCount",
  "freezeDurationTotalMs",
  "keyFramesDecoded",
  "availableIncomingBitrateKbps",
] as const satisfies readonly (keyof BrowserResearchMetrics)[];

export const ENGINE_RESEARCH_METRIC_KEYS = [
  "nodeCpuPercent",
  "nodeRssMb",
  "emulatorCpuPercent",
  "emulatorRssMb",
  "cameraCpuPercent",
  "cameraRssMb",
  "logicalCpuCount",
  "runtimeKind",
] as const satisfies readonly (keyof EngineResearchMetrics)[];

export const ENCODER_RESEARCH_METRIC_KEYS = [
  "framesInTotal",
  "framesOutTotal",
  "framesDroppedTotal",
  "queueLevelBuffers",
  "pipelineDelayProxyMs",
  "targetBitrateKbps",
  "targetFps",
  "cpuUsed",
  "maxQuantizer",
] as const satisfies readonly (keyof EncoderResearchMetrics)[];

