import assert from "node:assert/strict";
import test from "node:test";
import { markFirstPresentation } from "./nativeBrowserPage.mjs";

function fixture(state, timeline = {}) {
  let clock = 100;
  const scope = { pc: { connectionState: state }, timeline };
  const mark = (scope, name, values = {}) => {
    if (!(name in scope.timeline)) scope.timeline[name] = { at_ms: clock++, ...values };
  };
  return { scope, mark };
}

test("presentation observes connected state before a delayed connection event", () => {
  const { scope, mark } = fixture("connected");
  markFirstPresentation(scope, { presentedFrames: 1, mediaTime: 0.039 }, mark);
  assert.ok(scope.timeline.connected.at_ms <= scope.timeline.first_presented.at_ms);
  mark(scope, "connected");
  assert.equal(scope.timeline.connected.at_ms, 100, "late notification cannot overwrite first observation");
  assert.equal(scope.timeline.first_presented.pts_ms, 39);
});

test("presentation cannot invent connected state or replace an earlier observation", () => {
  const pending = fixture("connecting");
  markFirstPresentation(pending.scope, { presentedFrames: 1, mediaTime: 0 }, pending.mark);
  assert.equal(pending.scope.timeline.connected, undefined);
  const connected = fixture("connected", { connected: { at_ms: 20 } });
  markFirstPresentation(connected.scope, { presentedFrames: 2, mediaTime: 0 }, connected.mark);
  assert.equal(connected.scope.timeline.connected.at_ms, 20);
});
