import { useEffect, useRef, useState } from "react";
import { engineAuthHeaders } from "../../../../lib/engine/engineAuth";
import { engineEndpoint } from "../../../../lib/engine/engineConfig";
import { engineFetch } from "../../../../lib/engine/engineRequest";
import {
  createEngineResearchTelemetrySamples,
  createUnavailableEngineTelemetrySamples,
  elapsedMsFromCapturedAt,
  EngineResearchTelemetryBuffer,
  parseEngineResearchTelemetryResponse,
  type EngineResearchTelemetrySample,
} from "../../telemetry/engineResearchTelemetry";

const POLL_INTERVAL_MS = 1_000;

export function useEngineResearchTelemetryRecording({
  enabled,
  gameId,
  isRecording,
  runId,
  sessionId,
}: {
  enabled: boolean;
  gameId: string;
  isRecording: boolean;
  runId: string;
  sessionId: string;
}) {
  const recordingStartedAtRef = useRef<number | null>(null);
  const [buffer] = useState(() => new EngineResearchTelemetryBuffer());
  const [snapshot, setSnapshot] = useState(() => buffer.snapshot);

  useEffect(() => {
    if (!enabled || !isRecording) {
      recordingStartedAtRef.current = null;
      return;
    }
    recordingStartedAtRef.current = Date.now();
    const resetId = window.setTimeout(() => {
      buffer.clear();
      setSnapshot(buffer.snapshot);
    }, 0);
    return () => window.clearTimeout(resetId);
  }, [buffer, enabled, isRecording]);

  useEffect(() => {
    if (!enabled || !isRecording || !sessionId) return;
    let active = true;
    let pollInFlight = false;

    const append = (samples: EngineResearchTelemetrySample[]) => {
      if (!active) return;
      if (buffer.append(samples)) setSnapshot(buffer.snapshot);
    };
    const poll = async () => {
      const recordingStartedAt = recordingStartedAtRef.current;
      if (pollInFlight || recordingStartedAt === null) return;
      pollInFlight = true;
      try {
        const response = await engineFetch(
          engineEndpoint(
            `/research/telemetry?sessionId=${encodeURIComponent(sessionId)}`,
          ),
          { headers: engineAuthHeaders() },
          3_000,
        );
        if (!response.ok) throw new Error(`Engine telemetry HTTP ${response.status}`);
        const parsed = parseEngineResearchTelemetryResponse(
          await response.json(),
          sessionId,
        );
        if (!parsed) throw new Error("Engine telemetry response was invalid");
        const elapsedMs = elapsedMsFromCapturedAt(
          parsed.capturedAt,
          recordingStartedAt,
        );
        if (elapsedMs === null) {
          throw new Error("Engine telemetry timestamp predates the recording");
        }
        append(
          createEngineResearchTelemetrySamples({
            elapsedMs,
            gameId,
            response: parsed,
            runId,
          }),
        );
      } catch (error) {
        const capturedAtMs = Date.now();
        append(
          createUnavailableEngineTelemetrySamples({
            capturedAt: new Date(capturedAtMs).toISOString(),
            elapsedMs: Math.max(
              0,
              capturedAtMs - recordingStartedAt,
            ),
            error: error instanceof Error ? error.message : "Engine telemetry failed",
            gameId,
            runId,
            sessionId,
          }),
        );
      } finally {
        pollInFlight = false;
      }
    };

    void poll();
    const intervalId = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [buffer, enabled, gameId, isRecording, runId, sessionId]);

  return snapshot;
}
