import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const { faultMode, shouldForwardReconnect } = createRequire(import.meta.url)("./nativeFaultModes.cjs");

test("legacy and cost fault aliases retain the same case and reconnect routing", () => {
  for (const name of ["cancel", "receiver-loss", "source-loss", "reconnect"]) {
    for (const cost of [false, true]) {
      const base = `engineering-game-${name}`, mode = base + (cost ? "-cost" : "");
      assert.deepEqual(faultMode(mode), { base, case: name, cost });
      assert.equal(shouldForwardReconnect(mode, { kind: "game_failure_reconnect" }), ["cancel", "reconnect"].includes(name));
      assert.equal(shouldForwardReconnect(mode, { kind: "unrelated" }), false);
    }
  }
});

test("unlisted modes and cost-like strings cannot open reconnect routing", () => {
  for (const mode of [null, {}, "constructor", "engineering-game-cancel-cost-cost", "engineering-game-action-cost", "production-admission"]) {
    assert.equal(faultMode(mode), null);
    assert.equal(shouldForwardReconnect(mode, { kind: "game_failure_reconnect" }), false);
  }
});
