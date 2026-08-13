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

const SAFE_DETAIL_KEYS_BY_EVENT: Partial<
  Record<ResearchRunEventName, ReadonlySet<string>>
> = {
  backend_session_created: new Set(["mode", "runtimeId"]),
  backend_session_requested: new Set(["gameId"]),
  connection_disconnected: new Set(["connectionState", "iceConnectionState"]),
  connection_failed: new Set(["connectionState", "iceConnectionState"]),
  connection_recovered: new Set(["connectionState", "iceConnectionState"]),
  engine_error: new Set(["code", "reason", "source"]),
  engine_reconnect_waiting: new Set(["reason"]),
  play_clicked: new Set(["gameId", "playerMode"]),
  remote_track_received: new Set(["kind"]),
  research_recording_completed: new Set([
    "completionKind",
    "computeSampleCount",
    "sampleCount",
  ]),
  research_recording_started: new Set(["durationMs"]),
  research_run_invalidated: new Set(["reason"]),
  research_warmup_started: new Set(["durationMs"]),
  retry_started: new Set(["reason"]),
  start_game_emitted: new Set([
    "mode",
    "restart",
    "runtimeId",
    "streamProfileId",
  ]),
  stream_playing: new Set(["trackKind"]),
};

const SAFE_IDENTIFIER = /^[A-Za-z0-9_.:-]{1,128}$/;
const SAFE_REASON = /^[A-Za-z0-9 _.,:'()-]{1,256}$/;

function sanitizeDetailValue(key: string, value: unknown): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (key === "reason") return SAFE_REASON.test(normalized) ? normalized : undefined;
  return SAFE_IDENTIFIER.test(normalized) ? normalized : undefined;
}

export function sanitizeResearchRunEventDetails(
  name: ResearchRunEventName,
  details: Record<string, unknown> | null | undefined,
) {
  if (!details) return null;
  const allowedKeys = SAFE_DETAIL_KEYS_BY_EVENT[name];
  if (!allowedKeys) return null;
  const sanitized = Object.fromEntries(
    Object.entries(details).flatMap(([key, value]) => {
      if (!allowedKeys.has(key)) return [];
      const sanitizedValue = sanitizeDetailValue(key, value);
      return sanitizedValue === undefined ? [] : [[key, sanitizedValue]];
    }),
  );
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
    details: sanitizeResearchRunEventDetails(name, details),
    elapsedMs: Math.max(0, nowMs - runStartedAt),
    name,
    runId,
    sessionId,
  };
}

export function researchRunEventsToCsv(events: ResearchRunEvent[]) {
  const rows = events.map((event) => {
    const details = sanitizeResearchRunEventDetails(event.name, event.details);
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
