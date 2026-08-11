import { ArrowLeft, Download, RotateCcw, TriangleAlert } from "lucide-react";
import type { WebRTCTelemetry } from "../../../lib/webrtc/telemetry/webrtcTelemetry";
import type { EngineResearchTelemetrySample } from "../../player/telemetry/engineResearchTelemetry";
import type { ResearchRunConfig } from "../researchRunConfig";
import {
  getResearchRecordingDurationMs,
  type ResearchRunControllerState,
} from "../researchRunController";

function formatMetric(value: number | null, suffix = "") {
  return value === null ? "Unavailable" : `${Number(value.toFixed(2))}${suffix}`;
}

export function ResearchRunResults({
  canExport,
  config,
  computeSampleCount = 0,
  latestEncoderSample = null,
  latestEngineSample = null,
  layoutClassName,
  metadataPreviewJson,
  onExport,
  onReturnToLibrary,
  onRetake,
  state,
  telemetry,
}: {
  canExport: boolean;
  config: ResearchRunConfig;
  computeSampleCount?: number;
  latestEncoderSample?: EngineResearchTelemetrySample | null;
  latestEngineSample?: EngineResearchTelemetrySample | null;
  layoutClassName: string;
  metadataPreviewJson: string;
  onExport: () => void;
  onReturnToLibrary: () => void;
  onRetake: () => void;
  state: ResearchRunControllerState;
  telemetry: WebRTCTelemetry;
}) {
  const isValid = state.stage === "completed";
  const durationSeconds = getResearchRecordingDurationMs(state) / 1000;

  return (
    <section
      className={`mt-6 w-full rounded-lg border border-synth-border bg-synth-surface p-5 shadow-panel ${layoutClassName}`}
      data-ignore-game-input
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-synth-secondary">
            Research run result
          </p>
          <h2 className="mt-1 text-2xl font-extrabold text-white">
            {isValid ? "Capture completed" : "Capture not accepted"}
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            {config.phase} · {config.streamProfileId} · {config.runId}
          </p>
        </div>
        <span
          className={`inline-flex self-start rounded-full border px-3 py-1 text-xs font-bold uppercase ${
            isValid
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
              : "border-amber-500/50 bg-amber-500/15 text-amber-200"
          }`}
        >
          {state.stage}
        </span>
      </div>

      {state.invalidReason && (
        <div className="mt-4 flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <TriangleAlert className="h-5 w-5 shrink-0" />
          <p>{state.invalidReason}</p>
        </div>
      )}

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Duration", `${Number(durationSeconds.toFixed(2))}s`],
          ["Samples", String(state.sampleCount)],
          ["Compute samples", String(computeSampleCount)],
          [
            "Node CPU",
            formatMetric(latestEngineSample?.nodeCpuPercent ?? null, "%"),
          ],
          [
            "Game CPU",
            formatMetric(latestEngineSample?.emulatorCpuPercent ?? null, "%"),
          ],
          [
            "Camera/GStreamer CPU",
            formatMetric(latestEngineSample?.cameraCpuPercent ?? null, "%"),
          ],
          [
            "Encoder-path drops",
            formatMetric(latestEncoderSample?.framesDroppedTotal ?? null),
          ],
          [
            "Encoder queue",
            formatMetric(latestEncoderSample?.queueLevelBuffers ?? null, " buffers"),
          ],
          ["Latest FPS", formatMetric(telemetry.fps)],
          ["Latest bitrate", formatMetric(telemetry.bitrateKbps, " kbps")],
          ["Latest jitter", formatMetric(telemetry.jitterMs, " ms")],
          ["Latest RTT", formatMetric(telemetry.roundTripTimeMs, " ms")],
          ["Mean decode", formatMetric(telemetry.decodeTimeMeanMs, " ms")],
          [
            "Mean jitter buffer",
            formatMetric(telemetry.jitterBufferDelayMeanMs, " ms"),
          ],
          ["Frames decoded", formatMetric(telemetry.framesDecoded)],
          ["Frames dropped", formatMetric(telemetry.framesDropped)],
          ["Freeze count", formatMetric(telemetry.freezeCount)],
          [
            "Available incoming",
            formatMetric(telemetry.availableIncomingBitrateKbps, " kbps"),
          ],
          ["Packet loss total", String(telemetry.packetsLost)],
          ["ICE", telemetry.iceConnectionState],
          ["Completion", state.completionKind || state.stage],
        ].map(([label, value]) => (
          <div
            className="rounded-lg border border-synth-border bg-synth-bg px-3 py-3"
            key={label}
          >
            <dt className="text-[11px] font-bold uppercase text-gray-500">
              {label}
            </dt>
            <dd className="mt-1 truncate font-semibold text-white">{value}</dd>
          </div>
        ))}
      </dl>

      <details className="mt-5 rounded-lg border border-synth-border bg-synth-bg">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-white">
          Preview sanitized bundle metadata
        </summary>
        <pre className="max-h-64 overflow-auto border-t border-synth-border px-4 py-3 text-xs text-gray-300">
          {metadataPreviewJson}
        </pre>
      </details>

      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button
          className="inline-flex items-center gap-2 rounded-lg border border-synth-border bg-synth-bg px-4 py-2.5 font-semibold text-white transition-colors hover:bg-synth-elevated"
          onClick={onReturnToLibrary}
          type="button"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Research Library
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-lg border border-synth-border bg-synth-bg px-4 py-2.5 font-semibold text-white transition-colors hover:bg-synth-elevated"
          onClick={onRetake}
          type="button"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Retake phase
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-lg border border-synth-action-hover bg-synth-action px-4 py-2.5 font-bold text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!canExport}
          onClick={onExport}
          type="button"
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          Export Bundle
        </button>
      </div>
    </section>
  );
}
