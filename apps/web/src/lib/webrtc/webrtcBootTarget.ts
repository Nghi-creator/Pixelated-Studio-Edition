import { resolveGameBootTarget } from "./webrtcSession";
import type { BootTarget, WebRTCSessionRuntime } from "./webrtcLifecycleTypes";

export function getResolvedBootTarget(
  runtime: WebRTCSessionRuntime,
  gameId: string,
  sessionId: string,
) {
  if (runtime.resolvedBootTarget) {
    return Promise.resolve(runtime.resolvedBootTarget);
  }

  if (!runtime.bootTargetPromise) {
    runtime.bootTargetPromise = resolveGameBootTarget(gameId, sessionId)
      .then((bootTarget: BootTarget) => {
        runtime.resolvedBootTarget = bootTarget;
        return bootTarget;
      })
      .catch((err) => {
        runtime.bootTargetPromise = null;
        throw err;
      });
  }

  return runtime.bootTargetPromise;
}
