import assert from "node:assert/strict";
import test from "node:test";
import { shouldClearEnginePairingAfterProbe } from "../../../src/lib/engine/engineConnectionMonitorPolicy.ts";

test("engine connection monitor only clears pairing after explicit token rejection", () => {
  assert.equal(shouldClearEnginePairingAfterProbe(401), true);
  assert.equal(shouldClearEnginePairingAfterProbe(0), false);
  assert.equal(shouldClearEnginePairingAfterProbe(404), false);
  assert.equal(shouldClearEnginePairingAfterProbe(502), false);
  assert.equal(shouldClearEnginePairingAfterProbe(503), false);
});
