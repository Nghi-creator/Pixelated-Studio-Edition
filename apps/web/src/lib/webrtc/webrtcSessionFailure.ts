import { createWebRTCProfileRestartIdentity } from "./webrtcIdentity";
import type {
  FailStream,
  UseWebRTCSessionLifecycleParams,
  WebRTCSessionConfig,
  WebRTCSessionRuntime,
} from "./webrtcLifecycleTypes";

export function createFailStream({
  config,
  params,
  runtime,
}: {
  config: WebRTCSessionConfig;
  params: UseWebRTCSessionLifecycleParams;
  runtime: WebRTCSessionRuntime;
}): FailStream {
  return (message: string) => {
    if (runtime.disposed) return;
    if (runtime.bootReadyTimeoutId !== null) {
      window.clearTimeout(runtime.bootReadyTimeoutId);
      runtime.bootReadyTimeoutId = null;
    }
    params.onResearchEvent?.("engine_error", { message });
    if (
      config.seamlessRestart &&
      !runtime.automaticRecoveryQueued &&
      params.profileAutoRetriesRemainingRef.current > 0
    ) {
      runtime.automaticRecoveryQueued = true;
      params.profileAutoRetriesRemainingRef.current -= 1;
      const identity = createWebRTCProfileRestartIdentity();
      params.peerIdRef.current = identity.peerId;
      params.seamlessRestartRef.current = true;
      params.setRetryVersion((currentVersion) => currentVersion + 1);
      return;
    }

    params.setTelemetry((currentTelemetry) => ({
      ...currentTelemetry,
      lastEngineError: message,
      lastUpdatedAt: Date.now(),
    }));
    params.setStatus("error");
  };
}
