import { createRequestAbortController } from "../api/requestLifecycle.ts";

const DEFAULT_ENGINE_REQUEST_TIMEOUT_MS = 8_000;

export class EngineRequestTimeoutError extends Error {
  constructor() {
    super("The local engine did not respond in time. Check the desktop app and try again.");
    this.name = "EngineRequestTimeoutError";
  }
}

export async function engineFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_ENGINE_REQUEST_TIMEOUT_MS,
) {
  const { controller, cleanup } = createRequestAbortController(
    timeoutMs,
    init.signal,
  );

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError" &&
      !init.signal?.aborted
    ) {
      throw new EngineRequestTimeoutError();
    }
    throw error;
  } finally {
    cleanup();
  }
}
