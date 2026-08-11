import type { WebRTCResearchEventName } from "../../../lib/webrtc/types";
import { createPlayerArtifactFilename } from "../artifactFilename.ts";

export type ResearchRunEventName =
  | WebRTCResearchEventName
  | "first_non_black_frame"
  | "play_clicked"
  | "research_recording_completed"
  | "research_recording_started"
  | "research_run_cancelled"
  | "research_run_invalidated"
  | "research_warmup_started";

export type ResearchRunEvent = {
  capturedAt: string;
  details: Record<string, unknown> | null;
  elapsedMs: number;
  name: ResearchRunEventName;
  runId: string;
  sessionId: string;
};

export const RESEARCH_RUN_EVENT_CSV_HEADERS = [
  "captured_at",
  "elapsed_ms",
  "run_id",
  "session_id",
  "event",
  "details_json",
] as const;

const PRIVATE_EVENT_DETAIL_KEYS = new Set(["peerId", "rawPeerId"]);

function sanitizeDetailValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeDetailValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PRIVATE_EVENT_DETAIL_KEYS.has(key))
      .map(([key, nestedValue]) => [key, sanitizeDetailValue(nestedValue)]),
  );
}

export function sanitizeResearchRunEventDetails(
  details: Record<string, unknown> | null | undefined,
) {
  if (!details) return null;
  const sanitized = sanitizeDetailValue(details) as Record<string, unknown>;
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function csvCell(value: number | string | null) {
  if (value === null) return "";
  const text =
    typeof value === "string" && /^[=+\-@]/.test(value) ? `'${value}` : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function createResearchRunEvent({
  details,
  name,
  nowMs = Date.now(),
  runId,
  runStartedAt,
  sessionId,
}: {
  details?: Record<string, unknown>;
  name: ResearchRunEventName;
  nowMs?: number;
  runId: string;
  runStartedAt: number;
  sessionId: string;
}): ResearchRunEvent {
  return {
    capturedAt: new Date(nowMs).toISOString(),
    details: sanitizeResearchRunEventDetails(details),
    elapsedMs: Math.max(0, nowMs - runStartedAt),
    name,
    runId,
    sessionId,
  };
}

export function researchRunEventsToCsv(events: ResearchRunEvent[]) {
  const rows = events.map((event) => {
    const details = sanitizeResearchRunEventDetails(event.details);
    return [
      event.capturedAt,
      event.elapsedMs,
      event.runId,
      event.sessionId,
      event.name,
      details ? JSON.stringify(details) : null,
    ]
      .map(csvCell)
      .join(",");
  });

  return [RESEARCH_RUN_EVENT_CSV_HEADERS.join(","), ...rows].join("\n");
}

export function createResearchRunEventsFilename({
  gameId,
  recordedAt = new Date(),
  runId,
}: {
  gameId: string | undefined;
  recordedAt?: Date;
  runId: string;
}) {
  return createPlayerArtifactFilename({
    extension: "csv",
    identity: [gameId || "game", runId],
    prefix: "pixelated-research-events",
    recordedAt,
  });
}

export function findFirstEventElapsedMs(
  events: ResearchRunEvent[],
  name: ResearchRunEventName,
) {
  return events.find((event) => event.name === name)?.elapsedMs ?? null;
}
