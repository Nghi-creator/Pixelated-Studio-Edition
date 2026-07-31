export function beginWebRTCSessionDisposal(runtime: { disposed: boolean }) {
  if (runtime.disposed) return false;
  runtime.disposed = true;
  return true;
}
