import { createRequestAbortController } from "../api/requestLifecycle.ts";
import { isAllowedEngineUrl } from "./engineConfig.ts";

const DEFAULT_ENGINE_REQUEST_TIMEOUT_MS = 8_000;

export class EngineRequestTimeoutError extends Error {
  constructor() {
    super("The local engine did not respond in time. Check the desktop app and try again.");
    this.name = "EngineRequestTimeoutError";
  }
}

export class InvalidEngineRequestUrlError extends Error {
  constructor() {
    super("Engine requests must target an approved local or LAN engine URL.");
    this.name = "InvalidEngineRequestUrlError";
  }
}

function getAllowedEngineRequestUrl(input: string | URL) {
  const requestUrl = input.toString();
  if (!isAllowedEngineUrl(requestUrl)) {
    throw new InvalidEngineRequestUrlError();
  }
  return requestUrl;
}

export async function engineFetch(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_ENGINE_REQUEST_TIMEOUT_MS,
) {
  const requestUrl = getAllowedEngineRequestUrl(input);
  const { controller, cleanup } = createRequestAbortController(
    timeoutMs,
    init.signal,
  );

  try {
    // The URL is constrained above to HTTP(S), approved engine ports, and
    // localhost/private-network hosts without embedded credentials.
    return await fetch(requestUrl, { // lgtm[js/client-side-request-forgery]
      ...init,
      signal: controller.signal,
    });
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
