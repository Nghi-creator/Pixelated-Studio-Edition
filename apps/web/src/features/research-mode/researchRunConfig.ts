import type { StreamProfileId } from "../../lib/engine/streamProfiles";
import type { ResearchRunScenario } from "../player/research/researchRunMetadata.ts";
import { createResearchRunId } from "../player/research/researchRunMetadata.ts";

export const RESEARCH_RUN_CONFIG_SCHEMA_VERSION = 1 as const;
export const DEFAULT_RESEARCH_WARMUP_DURATION_MS = 10_000;
export const DEFAULT_RESEARCH_RECORDING_DURATION_MS = 60_000;
export const MAX_RESEARCH_WARMUP_DURATION_MS = 5 * 60_000;
export const MAX_RESEARCH_RECORDING_DURATION_MS = 60 * 60_000;

export type ResearchRunPhase =
  | "healthy"
  | "degraded"
  | "relief"
  | "custom";

export type ResearchRunConfig = {
  audioMuted: boolean;
  audioVolume: number;
  coldStart: boolean;
  comparisonCaseId: string;
  gameId: string;
  interventionLabel: string;
  networkType: string;
  nodeLabel: string;
  notes: string;
  phase: ResearchRunPhase;
  recordingDurationMs: number;
  runId: string;
  runtimeLabel: string;
  scenario: ResearchRunScenario;
  schemaVersion: typeof RESEARCH_RUN_CONFIG_SCHEMA_VERSION;
  streamProfileId: StreamProfileId;
  warmupDurationMs: number;
};

const RESEARCH_RUN_PHASES: ResearchRunPhase[] = [
  "healthy",
  "degraded",
  "relief",
  "custom",
];
const RESEARCH_RUN_SCENARIOS: ResearchRunScenario[] = [
  "browser_only_baseline",
  "custom",
  "lan",
  "localhost",
];
const STREAM_PROFILE_IDS: StreamProfileId[] = [
  "performance",
  "balanced",
  "quality",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

export function createDefaultResearchRunConfig(
  gameId: string,
): ResearchRunConfig {
  return {
    audioMuted: false,
    audioVolume: 1,
    coldStart: false,
    comparisonCaseId: "",
    gameId,
    interventionLabel: "none",
    networkType: "Localhost",
    nodeLabel: "local-edge-node",
    notes: "",
    phase: "healthy",
    recordingDurationMs: DEFAULT_RESEARCH_RECORDING_DURATION_MS,
    runId: createResearchRunId(),
    runtimeLabel: "docker-libretro",
    scenario: "localhost",
    schemaVersion: RESEARCH_RUN_CONFIG_SCHEMA_VERSION,
    streamProfileId: "balanced",
    warmupDurationMs: DEFAULT_RESEARCH_WARMUP_DURATION_MS,
  };
}

export function validateResearchRunConfig(value: unknown): string[] {
  if (!isRecord(value)) return ["Run configuration must be an object."];

  const errors: string[] = [];
  if (value.schemaVersion !== RESEARCH_RUN_CONFIG_SCHEMA_VERSION) {
    errors.push("Unsupported run configuration schema version.");
  }
  if (!isString(value.runId) || value.runId.trim().length === 0) {
    errors.push("Run ID is required.");
  }
  if (
    !isString(value.comparisonCaseId) ||
    value.comparisonCaseId.trim().length === 0
  ) {
    errors.push("Comparison case ID is required.");
  }
  if (!isString(value.gameId) || value.gameId.trim().length === 0) {
    errors.push("Game ID is required.");
  }
  if (!RESEARCH_RUN_PHASES.includes(value.phase as ResearchRunPhase)) {
    errors.push("Run phase is invalid.");
  }
  if (!STREAM_PROFILE_IDS.includes(value.streamProfileId as StreamProfileId)) {
    errors.push("Stream profile is invalid.");
  }
  if (!RESEARCH_RUN_SCENARIOS.includes(value.scenario as ResearchRunScenario)) {
    errors.push("Scenario is invalid.");
  }
  if (
    !isBoundedInteger(
      value.warmupDurationMs,
      0,
      MAX_RESEARCH_WARMUP_DURATION_MS,
    )
  ) {
    errors.push("Warm-up duration is outside the supported range.");
  }
  if (
    !isBoundedInteger(
      value.recordingDurationMs,
      1_000,
      MAX_RESEARCH_RECORDING_DURATION_MS,
    )
  ) {
    errors.push("Recording duration is outside the supported range.");
  }
  if (typeof value.coldStart !== "boolean") {
    errors.push("Cold-start state is required.");
  }
  if (typeof value.audioMuted !== "boolean") {
    errors.push("Audio mute state is required.");
  }
  if (
    typeof value.audioVolume !== "number" ||
    !Number.isFinite(value.audioVolume) ||
    value.audioVolume < 0 ||
    value.audioVolume > 1
  ) {
    errors.push("Audio volume must be between zero and one.");
  }

  const textFields = [
    "networkType",
    "nodeLabel",
    "runtimeLabel",
    "interventionLabel",
    "notes",
  ] as const;
  textFields.forEach((field) => {
    if (!isString(value[field])) errors.push(`${field} must be text.`);
  });
  if (!isString(value.nodeLabel) || value.nodeLabel.trim().length === 0) {
    errors.push("An anonymized node label is required.");
  }
  if (!isString(value.runtimeLabel) || value.runtimeLabel.trim().length === 0) {
    errors.push("A runtime label is required.");
  }

  return errors;
}

export function researchRunConfigForPhase(
  config: ResearchRunConfig,
  phase: ResearchRunPhase,
): ResearchRunConfig {
  if (phase === "healthy") {
    return {
      ...config,
      interventionLabel: "none",
      phase,
      streamProfileId: "balanced",
    };
  }
  if (phase === "degraded") {
    return {
      ...config,
      interventionLabel: "bounded_cpu_pressure",
      phase,
      streamProfileId: "balanced",
    };
  }
  if (phase === "relief") {
    return {
      ...config,
      interventionLabel: "stream_profile_relief",
      phase,
      streamProfileId: "performance",
    };
  }
  return { ...config, phase };
}

export function isResearchRunConfig(value: unknown): value is ResearchRunConfig {
  return validateResearchRunConfig(value).length === 0;
}
