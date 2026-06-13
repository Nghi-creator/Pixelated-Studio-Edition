import { useEffect, useState } from "react";
import { Activity, Clipboard, X } from "lucide-react";
import { engineAuthHeaders } from "../../lib/engine/engineAuth";
import { engineEndpoint } from "../../lib/engine/engineConfig";
import type { WebRTCTelemetry } from "../../lib/webrtc/webrtcTelemetry";

type StreamTelemetryPanelProps = {
  gameId: string | undefined;
  playerMode: "guest" | "host";
  sessionId: string;
  shareUrl: string;
  status: string;
  telemetry: WebRTCTelemetry;
  onClose: () => void;
};

type TelemetrySample = {
  bitrateKbps: number;
  fps: number;
  jitterMs: number;
  packetsLost: number;
};

const formatNumber = (value: number | null, digits = 0) =>
  value === null ? "--" : value.toFixed(digits);

const makePoints = (values: number[], width = 240, height = 54) => {
  if (values.length === 0) return "";

  const maximum = Math.max(...values, 1);
  const minimum = Math.min(...values, 0);
  const range = Math.max(maximum - minimum, 1);

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width : (index / (values.length - 1)) * width;
      const y = height - ((value - minimum) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
};

function HistoryChart({
  label,
  primaryLabel,
  primaryValues,
  secondaryLabel,
  secondaryValues,
}: {
  label: string;
  primaryLabel: string;
  primaryValues: number[];
  secondaryLabel?: string;
  secondaryValues?: number[];
}) {
  return (
    <div className="rounded-md border border-synth-border bg-synth-bg/90 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase text-gray-500">
          {label}
        </span>
        <div className="flex items-center gap-3 text-[10px] font-semibold text-gray-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-synth-primary" />
            {primaryLabel}
          </span>
          {secondaryLabel && (
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-synth-secondary" />
              {secondaryLabel}
            </span>
          )}
        </div>
      </div>
      <svg
        aria-label={`${label} history`}
        className="h-14 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        viewBox="0 0 240 54"
      >
        <path d="M0 18H240 M0 36H240" stroke="rgba(255,255,255,0.06)" />
        <polyline
          fill="none"
          points={makePoints(primaryValues)}
          stroke="rgb(255,77,143)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        {secondaryValues && (
          <polyline
            fill="none"
            points={makePoints(secondaryValues)}
            stroke="rgb(255,159,67)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        )}
      </svg>
    </div>
  );
}

function buildTelemetrySnapshot({
  gameId,
  playerMode,
  sessionId,
  shareUrl,
  status,
  telemetry,
}: StreamTelemetryPanelProps) {
  return {
    capturedAt: new Date().toISOString(),
    gameId: gameId || null,
    playerMode,
    sessionId,
    shareUrl,
    status,
    telemetry,
    userAgent: navigator.userAgent,
  };
}

export function StreamTelemetryPanel(props: StreamTelemetryPanelProps) {
  const { onClose, telemetry } = props;
  const [copyState, setCopyState] = useState<
    "copied" | "failed" | "idle" | "saved"
  >("idle");
  const [history, setHistory] = useState<TelemetrySample[]>([]);

  useEffect(() => {
    if (telemetry.lastUpdatedAt === null) return;

    const sampleTimer = window.setTimeout(() => {
      setHistory((currentHistory) =>
        [
          ...currentHistory,
          {
            bitrateKbps: telemetry.bitrateKbps || 0,
            fps: telemetry.fps || 0,
            jitterMs: telemetry.jitterMs || 0,
            packetsLost: telemetry.packetsLost,
          },
        ].slice(-60),
      );
    }, 0);

    return () => window.clearTimeout(sampleTimer);
  }, [
    telemetry.bitrateKbps,
    telemetry.fps,
    telemetry.jitterMs,
    telemetry.lastUpdatedAt,
    telemetry.packetsLost,
  ]);

  const copyTelemetry = async () => {
    const snapshot = buildTelemetrySnapshot(props);

    try {
      try {
        const response = await fetch(engineEndpoint("/smoke/telemetry"), {
          body: JSON.stringify(snapshot),
          headers: {
            "Content-Type": "application/json",
            ...engineAuthHeaders(),
          },
          method: "POST",
        });
        if (response.ok) {
          setCopyState("saved");
          window.setTimeout(() => setCopyState("idle"), 1600);
          return;
        }
      } catch {
        // Clipboard export remains available when the local engine is offline.
      }

      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    window.setTimeout(() => setCopyState("idle"), 1600);
  };

  return (
    <section className="fixed bottom-4 left-4 right-4 z-40 rounded-lg border border-synth-border bg-synth-surface/95 p-3 shadow-glow-card backdrop-blur-xl sm:bottom-auto sm:left-auto sm:right-4 sm:top-20 sm:w-72 xl:static xl:flex xl:h-full xl:w-full xl:flex-col xl:justify-between">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-gray-200">
          <Activity className="h-4 w-4 text-synth-primary" />
          Stream Stats
        </p>
        <div className="flex items-center gap-1">
          <button
            aria-label="Copy stream telemetry JSON"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-synth-border bg-synth-bg px-2 text-xs font-semibold text-gray-300 transition hover:border-synth-primary/70 hover:text-white"
            onClick={copyTelemetry}
            title="Copy stream telemetry JSON"
            type="button"
          >
            <Clipboard className="h-3.5 w-3.5" />
            {copyState === "copied"
              ? "Copied"
              : copyState === "saved"
                ? "Saved"
              : copyState === "failed"
                ? "Failed"
                : "Copy"}
          </button>
          <button
            aria-label="Hide stream stats"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-synth-border bg-synth-bg text-gray-400 transition hover:border-synth-primary/70 hover:text-white"
            onClick={onClose}
            title="Hide stream stats"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-1 xl:gap-3">
        <div className="rounded-md border border-synth-border bg-synth-bg/90 px-3 py-2 xl:flex xl:items-center xl:justify-between">
          <div className="text-[11px] font-semibold uppercase text-gray-500">
            FPS
          </div>
          <div className="mt-1 text-base font-bold text-white tabular-nums xl:mt-0">
            {formatNumber(telemetry.fps)}
          </div>
        </div>
        <div className="rounded-md border border-synth-border bg-synth-bg/90 px-3 py-2 xl:flex xl:items-center xl:justify-between">
          <div className="text-[11px] font-semibold uppercase text-gray-500">
            Bitrate
          </div>
          <div className="mt-1 text-base font-bold text-white tabular-nums xl:mt-0">
            {formatNumber(telemetry.bitrateKbps)}{" "}
            <span className="text-[10px] font-medium text-gray-500">kbps</span>
          </div>
        </div>
        <div className="rounded-md border border-synth-border bg-synth-bg/90 px-3 py-2 xl:flex xl:items-center xl:justify-between">
          <div className="text-[11px] font-semibold uppercase text-gray-500">
            ICE
          </div>
          <div className="mt-1 truncate text-sm font-bold capitalize text-white xl:mt-0 xl:max-w-36">
            {telemetry.iceConnectionState}
          </div>
        </div>
        <div className="rounded-md border border-synth-border bg-synth-bg/90 px-3 py-2 xl:flex xl:items-center xl:justify-between">
          <div className="text-[11px] font-semibold uppercase text-gray-500">
            Loss / Jitter
          </div>
          <div className="mt-1 text-base font-bold text-white tabular-nums xl:mt-0">
            {telemetry.packetsLost}{" "}
            <span className="text-[10px] font-medium text-gray-500">
              / {formatNumber(telemetry.jitterMs, 1)} ms
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 hidden space-y-3 xl:block">
        <HistoryChart
          label="Performance · 60s"
          primaryLabel="FPS"
          primaryValues={history.map((sample) => sample.fps)}
          secondaryLabel="kbps"
          secondaryValues={history.map((sample) => sample.bitrateKbps)}
        />
        <HistoryChart
          label="Network · 60s"
          primaryLabel="Jitter"
          primaryValues={history.map((sample) => sample.jitterMs)}
          secondaryLabel="Loss"
          secondaryValues={history.map((sample) => sample.packetsLost)}
        />

      </div>
    </section>
  );
}
