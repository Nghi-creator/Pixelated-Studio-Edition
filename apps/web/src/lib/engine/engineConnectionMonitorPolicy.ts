export function shouldClearEnginePairingAfterProbe(status: number) {
  return status === 401;
}
