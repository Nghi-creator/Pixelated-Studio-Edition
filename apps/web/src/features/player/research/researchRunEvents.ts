import type { WebRTCResearchEventName } from "../../../lib/webrtc/types";

export type ResearchRunEventName =
  | WebRTCResearchEventName
  | "first_non_black_frame"
  | "play_clicked";

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

function csvCell(value: number | string | null) {
  if (value === null) return "";
  const text = String(value);
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
    details: details && Object.keys(details).length > 0 ? details : null,
    elapsedMs: Math.max(0, nowMs - runStartedAt),
    name,
    runId,
    sessionId,
  };
}

export function researchRunEventsToCsv(events: ResearchRunEvent[]) {
  const rows = events.map((event) =>
    [
      event.capturedAt,
      event.elapsedMs,
      event.runId,
      event.sessionId,
      event.name,
      event.details ? JSON.stringify(event.details) : null,
    ]
      .map(csvCell)
      .join(","),
  );

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
  const safeName = [gameId || "game", runId]
    .join("-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const timestamp = recordedAt.toISOString().replace(/[:.]/g, "-");

  return `pixelated-research-events-${safeName}-${timestamp}.csv`;
}

export function findFirstEventElapsedMs(
  events: ResearchRunEvent[],
  name: ResearchRunEventName,
) {
  return events.find((event) => event.name === name)?.elapsedMs ?? null;
}
