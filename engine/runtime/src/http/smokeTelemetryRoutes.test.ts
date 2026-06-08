import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSmokeTelemetryStore } from "./smokeTelemetryRoutes";

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
});
