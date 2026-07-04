export function isRetryableBackendSessionConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 409
  );
}
