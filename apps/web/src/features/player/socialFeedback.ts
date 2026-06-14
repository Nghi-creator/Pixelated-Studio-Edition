export function getSocialErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === "object" &&
    error &&
    "payload" in error &&
    typeof error.payload === "object" &&
    error.payload &&
    "error" in error.payload &&
    typeof error.payload.error === "string"
  ) {
    return error.payload.error;
  }

  return fallback;
}
