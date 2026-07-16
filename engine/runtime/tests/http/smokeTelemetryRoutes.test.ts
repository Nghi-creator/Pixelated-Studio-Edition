import assert from "node:assert/strict";
import type { Express, RequestHandler } from "express";
import { describe, it } from "node:test";
import {
  createSmokeTelemetryStore,
  registerSmokeTelemetryRoutes,
} from "../../src/http/smokeTelemetryRoutes";

const CAPTURE_TOKEN = "a".repeat(64);

describe("smoke telemetry store", () => {
  it("captures host and guest snapshots for the active session", () => {
    const store = createSmokeTelemetryStore(() => "session-1");

    assert.equal(
      store.activate(CAPTURE_TOKEN, "run-1", "session-1"),
      "activated",
    );
    assert.deepEqual(store.getActive(), {
      active: true,
      runId: "run-1",
      sessionId: "session-1",
    });
    assert.equal(
      store.submit({ playerMode: "host", sessionId: "session-1" }),
      "captured",
    );
    assert.equal(
      store.submit({ playerMode: "guest", sessionId: "session-1" }),
      "captured",
    );
    assert.equal(store.read("wrong-token"), null);
    assert.equal(store.read(CAPTURE_TOKEN)?.host?.playerMode, "host");
    assert.equal(store.read(CAPTURE_TOKEN)?.guest?.playerMode, "guest");
    assert.equal(store.deactivate(CAPTURE_TOKEN), true);
    assert.deepEqual(store.getActive(), { active: false });
  });

  it("rejects activation and snapshots for a different session", () => {
    const store = createSmokeTelemetryStore(() => "session-1");

    assert.equal(
      store.activate(CAPTURE_TOKEN, "run-2", "other-session"),
      "session-mismatch",
    );
    assert.equal(
      store.activate(CAPTURE_TOKEN, "run-2", "session-1"),
      "activated",
    );
    assert.equal(
      store.submit({ playerMode: "guest", sessionId: "other-session" }),
      "session-mismatch",
    );
  });

  it("binds companion snapshots to their authenticated role", () => {
    const store = createSmokeTelemetryStore(() => "session-1");
    store.activate(CAPTURE_TOKEN, "run-3", "session-1");

    assert.equal(
      store.submit(
        { playerMode: "host", sessionId: "session-1" },
        "companion-guest",
      ),
      "role-mismatch",
    );
    assert.equal(store.read(CAPTURE_TOKEN)?.host, null);
  });

  it("expires abandoned captures", () => {
    let now = 1_000;
    const store = createSmokeTelemetryStore(() => "session-1", {
      captureTtlMs: 500,
      now: () => now,
    });
    store.activate(CAPTURE_TOKEN, "run-4", "session-1");

    now += 501;

    assert.deepEqual(store.getActive(), { active: false });
    assert.equal(store.read(CAPTURE_TOKEN), null);
  });
});

describe("smoke telemetry routes", () => {
  it("registers engine authentication before the activation body handler", () => {
    const activationHandlers: RequestHandler[] = [];
    const app = {
      delete: () => undefined,
      get: () => undefined,
      post: () => undefined,
      put: (_path: string, ...handlers: RequestHandler[]) => {
        activationHandlers.push(...handlers);
      },
    } as unknown as Express;
    const requireEngineToken: RequestHandler = (_req, _res, next) => next();

    registerSmokeTelemetryRoutes(app, {
      getActiveSessionId: () => "session-1",
      requireEngineToken,
    });

    assert.equal(activationHandlers[0], requireEngineToken);
    assert.equal(activationHandlers.length, 3);
  });
});
