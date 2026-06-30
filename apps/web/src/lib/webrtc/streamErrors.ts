export const STREAM_BOOT_ERROR_MESSAGE =
  "Could not boot the game stream. Check that the local engine can reach the game file, then retry.";

export const STREAM_OFFER_ERROR_MESSAGE =
  "Could not create the WebRTC stream offer. Restart the local engine, then retry.";

export const STREAM_REMOTE_DESCRIPTION_ERROR_MESSAGE =
  "Could not apply the engine stream response. Restart the local engine, then retry.";

type EngineLaunchFailureHealth = {
  checks?: {
    runtime?: {
      lastLaunchFailure?: {
        exitCode?: number | null;
        label?: string;
        message?: string;
        occurredAt?: string;
        runtimeId?: string;
        sessionId?: string;
        signal?: string | null;
        stderrTail?: string;
        stdoutTail?: string;
      } | null;
    };
  };
};

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

function trimOutputTail(value: unknown) {
  return typeof value === "string" ? value.trim().slice(-500) : "";
}

export function formatEngineLaunchFailure(
  health: EngineLaunchFailureHealth,
): string | null {
  const failure = health.checks?.runtime?.lastLaunchFailure;
  if (!failure) return null;

  const label =
    typeof failure.label === "string" && failure.label.trim()
      ? failure.label.trim()
      : "Engine runtime";
  const message =
    typeof failure.message === "string" && failure.message.trim()
      ? failure.message.trim()
      : `${label} failed to launch.`;
  const stderrTail = trimOutputTail(failure.stderrTail);
  const stdoutTail = trimOutputTail(failure.stdoutTail);
  const outputTail = stderrTail || stdoutTail;

  return outputTail ? `${message} Last output: ${outputTail}` : message;
}
