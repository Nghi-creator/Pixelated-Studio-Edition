import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import type { RefObject } from "react";
import type { WebRTCStatus } from "../../lib/webrtc/webrtcSession";
import type { WebRTCTelemetry } from "../../lib/webrtc/webrtcTelemetry";

type StreamStageProps = {
  onRetry?: () => void;
  showStreamTelemetry: boolean;
  status: WebRTCStatus;
  telemetry: WebRTCTelemetry;
  videoRef: RefObject<HTMLVideoElement | null>;
};

export function StreamStage({
  onRetry,
  showStreamTelemetry,
  status,
  telemetry,
  videoRef,
}: StreamStageProps) {
  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-synth-border bg-black shadow-glow-card ring-1 ring-synth-primary/10">
      {status === "connecting" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
          <LoaderCircle
            aria-label="Connecting stream"
            className="h-10 w-10 animate-spin text-white"
          />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-synth-bg/90 backdrop-blur-sm px-6 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mb-4 drop-shadow-[0_0_12px_rgba(248,113,113,0.45)]" />
          <p className="text-lg text-gray-200 font-semibold">
            Stream could not start
          </p>
          {showStreamTelemetry && telemetry.lastEngineError && (
            <p className="mt-2 max-w-xl text-sm text-gray-400">
              {telemetry.lastEngineError}
            </p>
          )}
          {onRetry && (
            <button
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg border border-synth-primary/60 bg-synth-primary/15 px-4 text-sm font-semibold text-white transition-colors hover:bg-synth-primary/25"
              onClick={onRetry}
              type="button"
            >
              <RotateCcw className="h-4 w-4" />
              Retry Stream
            </button>
          )}
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-contain"
      />
    </div>
  );
}
