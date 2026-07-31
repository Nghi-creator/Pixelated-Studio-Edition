import assert from "node:assert/strict";
import test from "node:test";
import { beginWebRTCSessionDisposal } from "../../../src/lib/webrtc/session/webrtcSessionDisposal.ts";

test("WebRTC session disposal can run only once", () => {
  const runtime = { disposed: false };

  assert.equal(beginWebRTCSessionDisposal(runtime), true);
  assert.equal(runtime.disposed, true);
  assert.equal(beginWebRTCSessionDisposal(runtime), false);
});
