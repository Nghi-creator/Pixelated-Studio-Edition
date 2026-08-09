import type { StreamProfileId } from "../../lib/engine/streamProfiles";
import type { ResearchRunScenario } from "../player/research/researchRunMetadata";

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

  return errors;
}

export function isResearchRunConfig(value: unknown): value is ResearchRunConfig {
  return validateResearchRunConfig(value).length === 0;
}

