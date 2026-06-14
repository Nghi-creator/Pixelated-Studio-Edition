export const STREAM_BOOT_ERROR_MESSAGE =
  "Could not boot the game stream. Check that the local engine can reach the game file, then retry.";

export const STREAM_OFFER_ERROR_MESSAGE =
  "Could not create the WebRTC stream offer. Restart the local engine, then retry.";

export const STREAM_REMOTE_DESCRIPTION_ERROR_MESSAGE =
  "Could not apply the engine stream response. Restart the local engine, then retry.";

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}
