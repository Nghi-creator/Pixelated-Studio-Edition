import assert from "node:assert/strict";
import test from "node:test";
import {
  engineFetch,
  EngineRequestTimeoutError,
  InvalidEngineRequestUrlError,
} from "../../../src/lib/engine/engineRequest.ts";

test("engine requests reject unapproved destinations before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = () => {
    fetchCalled = true;
    throw new Error("fetch must not run");
  };

  try {
    await assert.rejects(
      engineFetch("https://attacker.example.test:8090/health"),
      InvalidEngineRequestUrlError,
    );
    await assert.rejects(
      engineFetch("file:///tmp/pixelated.sock"),
      InvalidEngineRequestUrlError,
    );
    await assert.rejects(
      engineFetch("https://user:pass@192.168.1.20:8090/health"),
      InvalidEngineRequestUrlError,
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
