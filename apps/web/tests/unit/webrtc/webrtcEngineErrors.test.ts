import assert from "node:assert/strict";
import test from "node:test";
import { bindWebRTCEngineErrors } from "../../../src/lib/webrtc/transport/webrtcEngineErrors.ts";

test("worker errors fail only the matching live browser; global revocation still clears pairing", () => {
  const listeners: Array<(payload: unknown) => void> = [];
  const effects: unknown[] = [];
  let disposed = false;
  for (const peerId of ["failed", "sibling"]) bindWebRTCEngineErrors({
    socket: { on: (_event, listener) => listeners.push(listener) }, peerId,
    isDisposed: () => disposed,
    failStream: (message) => effects.push([peerId, "fail", message]),
    report: (details) => effects.push([peerId, "report", details]),
    clearRejectedToken: () => effects.push([peerId, "clear"]),
  });
  const send = (payload: unknown) => listeners.forEach((listener) => listener(payload));
  send({ peerId: "failed", message: "worker lost" });
  assert.deepEqual(effects, [
    ["failed", "report", { code: null, message: "worker lost", source: "engine-error" }],
    ["failed", "fail", "worker lost"],
  ]);
  effects.length = 0;
  for (const payload of [null, [], "bad", { peerId: null }, { peerId: "retired", code: "engine_access_revoked" }]) send(payload);
  assert.deepEqual(effects, []);
  send({ code: "engine_access_revoked", message: "access revoked" });
  assert.equal(effects.length, 6);
  assert.deepEqual(effects.filter((entry) => (entry as string[])[1] === "clear"), [["failed", "clear"], ["sibling", "clear"]]);
  effects.length = 0;
  disposed = true;
  send({ peerId: "failed", message: "late worker loss" });
  send({ code: "engine_access_revoked" });
  assert.deepEqual(effects, []);
});
