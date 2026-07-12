import assert from "node:assert/strict";
import test from "node:test";
import {
  engineFetch,
  EngineRequestTimeoutError,
} from "../../../src/lib/engine/engineRequest.ts";

test("engine requests turn stalled fetches into an actionable timeout", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });

  try {
    await assert.rejects(
      engineFetch("http://127.0.0.1:8080/health", {}, 1),
      (error) =>
        error instanceof EngineRequestTimeoutError &&
        /did not respond in time/.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("engine requests preserve caller cancellation", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
  const controller = new AbortController();

  try {
    const request = engineFetch(
      "http://127.0.0.1:8080/health",
      { signal: controller.signal },
      1_000,
    );
    controller.abort();
    await assert.rejects(
      request,
      (error) =>
        error instanceof DOMException && error.name === "AbortError",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
