import { useEffect, useMemo, useRef, useState } from "react";
import { engineAuthHeaders } from "../../../../lib/engine/engineAuth";
import { engineEndpoint } from "../../../../lib/engine/engineConfig";
import { engineFetch } from "../../../../lib/engine/engineRequest";
import {
  createEngineResearchTelemetrySamples,
  createUnavailableEngineTelemetrySamples,
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
  const [samples, setSamples] = useState<EngineResearchTelemetrySample[]>([]);

  useEffect(() => {
    if (!enabled || !isRecording) {
      recordingStartedAtRef.current = null;
      return;
    }
    recordingStartedAtRef.current = Date.now();
    const resetId = window.setTimeout(() => setSamples([]), 0);
    return () => window.clearTimeout(resetId);
  }, [enabled, isRecording]);

  useEffect(() => {
    if (!enabled || !isRecording || !sessionId) return;
    let active = true;
    let pollInFlight = false;

    const append = (samples: EngineResearchTelemetrySample[]) => {
      if (!active) return;
      setSamples((current) => [...current, ...samples]);
    };
    const poll = async () => {
      if (pollInFlight || !recordingStartedAtRef.current) return;
      pollInFlight = true;
      const capturedAt = new Date().toISOString();
      const elapsedMs = Math.max(
        0,
        Date.now() - recordingStartedAtRef.current,
      );
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
        append(
          createEngineResearchTelemetrySamples({
            elapsedMs,
            gameId,
            response: parsed,
            runId,
          }),
        );
      } catch (error) {
        append(
          createUnavailableEngineTelemetrySamples({
            capturedAt,
            elapsedMs,
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
  }, [enabled, gameId, isRecording, runId, sessionId]);

  return useMemo(() => {
    const engineCpuSamples = samples.filter(
      (sample) =>
        sample.source === "engine_runtime" &&
        sample.available &&
        sample.nodeCpuPercent !== null &&
        sample.emulatorCpuPercent !== null &&
        sample.cameraCpuPercent !== null,
    ).length;
    const encoderSamples = samples.filter(
      (sample) => sample.source === "encoder_pipeline" && sample.available,
    ).length;
    const latestEngineSample = [...samples]
      .reverse()
      .find((sample) => sample.source === "engine_runtime") || null;
    const latestEncoderSample = [...samples]
      .reverse()
      .find((sample) => sample.source === "encoder_pipeline") || null;
    return {
      latestEncoderSample,
      latestEngineSample,
      recordedEngineSamples: samples,
      validComputeSampleCount: Math.min(engineCpuSamples, encoderSamples),
    };
  }, [samples]);
}
