import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { FallbackFrameCanvas } from "./FallbackFrameCanvas";
import type { WebRTCStatus } from "../../../lib/webrtc/webrtcSession";
import type { WebRTCTelemetry } from "../../../lib/webrtc/webrtcTelemetry";

type StreamStageProps = {
  blockedMessage?: string | null;
  controls?: ReactNode;
  fallbackActive?: boolean;
  isMuted: boolean;
  onRetry?: () => void;
  showStreamTelemetry: boolean;
  status: WebRTCStatus;
  telemetry: WebRTCTelemetry;
  videoRef: RefObject<HTMLVideoElement | null>;
};

export function StreamStage({
  blockedMessage,
  controls,
  fallbackActive = false,
  isMuted,
  onRetry,
  showStreamTelemetry,
  status,
  telemetry,
  videoRef,
}: StreamStageProps) {
  const errorMessage = blockedMessage || telemetry.lastEngineError;
  const isBlocked = Boolean(blockedMessage);

  return (
    <div className="relative w-full">
      {controls}
      <div
        className={`relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-b-lg border border-synth-border bg-black shadow-card ${
          showStreamTelemetry ? "xl:aspect-[16/9.5]" : ""
        }`}
      >
        {status === "connecting" && (
          <div className="absolute inset-px z-10 flex items-center justify-center rounded-b-[0.45rem] bg-black">
            <LoaderCircle
              aria-label="Connecting stream"
              className="h-10 w-10 animate-spin text-white"
            />
          </div>
        )}
        {(status === "error" || isBlocked) && (
          <div className="absolute inset-px z-10 flex flex-col items-center justify-center rounded-b-[0.45rem] bg-synth-bg/90 px-6 text-center backdrop-blur-sm">
            <AlertTriangle className="mb-4 h-12 w-12 text-red-400" />
            <p className="text-lg font-semibold text-gray-200">
              Stream could not start
            </p>
            {errorMessage && (
              <p className="mt-2 max-w-xl text-sm text-gray-400">
                {errorMessage}
              </p>
            )}
            {onRetry && !isBlocked && (
              <button
                className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg border border-synth-border bg-synth-surface px-4 text-sm font-semibold text-white transition-colors hover:bg-synth-elevated"
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
          muted={isMuted}
          playsInline
          className={`h-full w-full object-contain ${
            fallbackActive ? "opacity-0" : ""
          }`}
        />
        <FallbackFrameCanvas active={fallbackActive} />
      </div>
    </div>
  );
}
