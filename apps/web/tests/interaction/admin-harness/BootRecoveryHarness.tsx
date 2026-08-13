import { useRef, useState } from "react";
import { PlayerHeader } from "../../../src/features/player/components/shell/PlayerHeader";
import { StreamStage } from "../../../src/features/player/components/stream/StreamStage";
import {
  INITIAL_WEBRTC_TELEMETRY,
  type WebRTCTelemetry,
} from "../../../src/lib/webrtc/telemetry/webrtcTelemetry";
import type { WebRTCStatus } from "../../../src/lib/webrtc/session/webrtcSession";

type BootRecoveryMode = "cloud" | "local";

type BootRecoveryState = {
  attempt: "failed" | "recovered" | "retrying";
  sessionId: string;
  status: WebRTCStatus;
  telemetry: WebRTCTelemetry;
};

const bootFailureCopy: Record<BootRecoveryMode, string> = {
  cloud:
    "Cloud boot failed: the hosted API returned a game without a reachable ROM target.",
  local:
    "Local boot failed: the desktop engine could not open demo-local.nes from Local Vault.",
};

function createBootRecoveryState(
  mode: BootRecoveryMode,
  attempt: "failed" | "recovered" = "failed",
): BootRecoveryState {
  const sessionId = `${mode}-session-${attempt}`;
  return {
    attempt,
    sessionId,
    status: attempt === "failed" ? "error" : "playing",
    telemetry: {
      ...INITIAL_WEBRTC_TELEMETRY,
      connectionState: attempt === "failed" ? "failed" : "connected",
      iceConnectionState: attempt === "failed" ? "failed" : "connected",
      lastEngineError: attempt === "failed" ? bootFailureCopy[mode] : null,
      lastUpdatedAt: attempt === "failed" ? 1_781_501_000_000 : 1_781_501_005_000,
    },
  };
}

export function BootRecoveryHarness({
  mode,
  onRecord,
}: {
  mode: BootRecoveryMode;
  onRecord: (event: string) => void;
}) {
  const [state, setState] = useState(() => createBootRecoveryState(mode));
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const title =
    mode === "cloud" ? "Cloud Boot Recovery" : "Local Vault Boot Recovery";
  const shareUrl = `https://pixelated.test/play/${
    mode === "cloud" ? "cloud-game" : "demo-local.nes"
  }?session=${state.sessionId}`;

  const retryBoot = () => {
    onRecord(`${mode}-boot-retry:${state.sessionId}`);
    setState({
      ...createBootRecoveryState(mode, "failed"),
      attempt: "retrying",
      sessionId: `${mode}-session-retrying`,
      status: "connecting",
      telemetry: INITIAL_WEBRTC_TELEMETRY,
    });
    window.setTimeout(() => {
      setState(createBootRecoveryState(mode, "recovered"));
      onRecord(`${mode}-boot-recovered`);
    }, 250);
  };

  return (
    <section
      aria-label={`${title} harness`}
      className="max-w-3xl space-y-3"
    >
      <PlayerHeader
        backRoute={mode === "cloud" ? "/home" : "/local"}
        backText={mode === "cloud" ? "Back to Cloud Library" : "Back to Local Vault"}
        gameTitle={title}
        status={state.status}
      />
      <StreamStage
        isMuted={false}
        onRetry={retryBoot}
        showStreamTelemetry
        status={state.status}
        telemetry={state.telemetry}
        videoRef={videoRef}
      />
      <div className="rounded-lg border border-synth-border bg-synth-surface p-3 text-sm text-gray-300">
        <p>{mode === "cloud" ? "Cloud game" : "Local game"} session: {state.sessionId}</p>
        <p>Boot attempt: {state.attempt}</p>
        <p>Share URL: {shareUrl}</p>
      </div>
    </section>
  );
}
