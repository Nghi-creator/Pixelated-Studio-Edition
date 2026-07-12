import type { ResearchRunMetadata } from "./researchRunMetadata";

export type ResearchBaselineForm = {
  browserMemoryMb: string;
  cpuNotes: string;
  deviceNotes: string;
  emulatorId: string;
  fps: string;
  startupMs: string;
};

export type ResearchBaseline = {
  capturedAt: string;
  game: ResearchRunMetadata["game"];
  measurements: {
    browserMemoryMb: number | null;
    fps: number | null;
    startupMs: number | null;
  };
  notes: {
    cpu: string | null;
    device: string | null;
  };
  runId: string;
  scenario: "browser_only_baseline";
  schemaVersion: number;
  sessionId: string;
  userAgent: string;
  wasmRuntime: {
    emulatorId: string | null;
  };
};

function safeBaselinePart(value: string) {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

export function createEmptyResearchBaselineForm(): ResearchBaselineForm {
  return {
    browserMemoryMb: "",
    cpuNotes: "",
    deviceNotes: "",
    emulatorId: "",
    fps: "",
    startupMs: "",
  };
}

export function createResearchBaseline({
  capturedAt = new Date(),
  form,
  metadata,
  userAgent,
}: {
  capturedAt?: Date;
  form: ResearchBaselineForm;
  metadata: ResearchRunMetadata;
  userAgent: string;
}): ResearchBaseline {
  return {
    capturedAt: capturedAt.toISOString(),
    game: metadata.game,
    measurements: {
      browserMemoryMb: optionalNumber(form.browserMemoryMb),
      fps: optionalNumber(form.fps),
      startupMs: optionalNumber(form.startupMs),
    },
    notes: {
      cpu: optionalText(form.cpuNotes),
      device: optionalText(form.deviceNotes),
    },
    runId: metadata.runId,
    scenario: "browser_only_baseline",
    schemaVersion: metadata.schemaVersion,
    sessionId: metadata.sessionId,
    userAgent,
    wasmRuntime: {
      emulatorId: optionalText(form.emulatorId),
    },
  };
}

export function researchBaselineToJson(baseline: ResearchBaseline) {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

export function createResearchBaselineFilename({
  gameId,
  recordedAt = new Date(),
  runId,
}: {
  gameId: string | undefined;
  recordedAt?: Date;
  runId: string;
}) {
  const safeName = safeBaselinePart([gameId || "game", runId].join("-"));
  const timestamp = recordedAt.toISOString().replace(/[:.]/g, "-");

  return `pixelated-browser-baseline-${safeName}-${timestamp}.json`;
}
