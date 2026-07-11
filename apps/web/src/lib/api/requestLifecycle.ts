type TimerHost = Pick<typeof globalThis, "clearTimeout" | "setTimeout">;

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  createTimeoutError: () => Error,
  timerHost: TimerHost = globalThis,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = timerHost.setTimeout(() => reject(createTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) timerHost.clearTimeout(timeout);
  }
}

export function createRequestAbortController(
  timeoutMs: number,
  requestSignal?: AbortSignal | null,
  timerHost: TimerHost = globalThis,
) {
  const controller = new AbortController();
  const timeout = timerHost.setTimeout(() => controller.abort(), timeoutMs);
  const abortFromRequest = () => controller.abort();

  if (requestSignal?.aborted) {
    controller.abort();
  } else {
    requestSignal?.addEventListener("abort", abortFromRequest, {
      once: true,
    });
  }

  return {
    controller,
    cleanup: () => {
      timerHost.clearTimeout(timeout);
      requestSignal?.removeEventListener("abort", abortFromRequest);
    },
  };
}
