import assert from "node:assert/strict";
import test from "node:test";
import { getHealthResponse } from "../../src/http/healthRoutes";

test("public health is minimal while authenticated health keeps diagnostics", () => {
  const snapshot = {
    checks: { runtime: { activeSessionId: "private-session" } },
    engineTokenRequired: true,
    exposureMode: "lan" as const,
    ok: true,
    runtimeKind: "libretro" as const,
  };

  const publicHealth = getHealthResponse(snapshot, false);
  assert.equal("checks" in publicHealth, false);
  assert.equal(publicHealth.ok, true);

  const privateHealth = getHealthResponse(snapshot, true);
  assert.deepEqual(privateHealth.checks, {
    runtime: { activeSessionId: "private-session" },
  });
});
