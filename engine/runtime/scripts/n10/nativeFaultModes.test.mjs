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

test("stopped-worker cost is explicit and never uses planned reconnect routing", () => {
  assert.deepEqual(faultMode("engineering-game-worker-stall-cost"), { base: "engineering-game-worker-stall-cost", case: "worker-stall", cost: true });
  assert.equal(faultMode("engineering-game-worker-stall"), null);
  assert.equal(shouldForwardReconnect("engineering-game-worker-stall-cost", { kind: "game_failure_reconnect" }), false);
});

test("controller thread exit cost is explicit and cannot request reconnect routing", () => {
  assert.deepEqual(faultMode("engineering-game-controller-thread-exit-cost"), { base: "engineering-game-controller-thread-exit-cost", case: "controller-thread-exit", cost: true });
  assert.equal(faultMode("engineering-game-controller-thread-exit"), null);
  assert.equal(shouldForwardReconnect("engineering-game-controller-thread-exit-cost", { kind: "game_failure_reconnect" }), false);
});

test("blocked controller cost cannot use exit or planned reconnect routing", () => {
  assert.deepEqual(faultMode("engineering-game-controller-thread-block-cost"), { base: "engineering-game-controller-thread-block-cost", case: "controller-thread-block", cost: true });
  assert.equal(faultMode("engineering-game-controller-thread-block"), null);
  assert.equal(shouldForwardReconnect("engineering-game-controller-thread-block-cost", { kind: "game_failure_reconnect" }), false);
});
