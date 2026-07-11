import assert from "node:assert/strict";
import test from "node:test";
import {
  createRequestAbortController,
  withTimeout,
} from "../../../src/lib/api/requestLifecycle.ts";

test("request timeout rejects stalled work and clears its timer", async () => {
  let cleared = false;
  const timerHost = {
    clearTimeout: () => {
      cleared = true;
    },
    setTimeout: (callback: () => void) => {
      callback();
      return 1;
    },
  };

  await assert.rejects(
    withTimeout(
      new Promise<never>(() => undefined),
      100,
      () => new Error("timed out"),
      timerHost as never,
    ),
    /timed out/,
  );
  assert.equal(cleared, true);
});

test("request abort controller links callers and cleans up its timeout", () => {
  const externalController = new AbortController();
  let cleared = false;
  let removed = false;
  const originalRemoveEventListener = externalController.signal.removeEventListener;
  externalController.signal.removeEventListener = function (
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) {
    removed = true;
    return originalRemoveEventListener.call(this, type, callback, options);
  };
  const timerHost = {
    clearTimeout: () => {
      cleared = true;
    },
    setTimeout: () => 1,
  };
  const lifecycle = createRequestAbortController(
    100,
    externalController.signal,
    timerHost as never,
  );

  externalController.abort();
  assert.equal(lifecycle.controller.signal.aborted, true);
  lifecycle.cleanup();
  assert.equal(cleared, true);
  assert.equal(removed, true);
});
