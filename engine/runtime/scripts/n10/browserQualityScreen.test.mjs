import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { collectBrowserQuality } from "./browserQualityScreen.mjs";

test("late stats cannot mutate the returned quality window after closure", async () => {
  let now = 0, resolveLate, reads = 0;
  const timeouts = new Map(), intervals = new Map();
  const stat = { type: "inbound-rtp", kind: "video", id: "video", ssrc: 1,
    trackIdentifier: "track", framesDecoded: 1, framesDropped: 0, freezeCount: 0,
    frameWidth: 640, frameHeight: 480 };
  const pc = { connectionState: "connected", getStats() {
    if (++reads === 1) return Promise.resolve(new Map([["video", stat]]));
    return new Promise(resolve => { resolveLate = resolve; });
  } };
  const video = { requestVideoFrameCallback: () => 1, cancelVideoFrameCallback() {},
    readyState: 2, videoWidth: 640, videoHeight: 480 };
  const collect = vm.runInNewContext(`(${collectBrowserQuality.toString()})`, {
    performance: { now: () => now },
    document: { createElement: () => ({ getContext: () => ({ drawImage() {},
      getImageData: () => ({ data: new Uint8ClampedArray(80 * 60 * 4) }) }) }) },
    setTimeout: (fn, ms) => { timeouts.set(ms, fn); return ms; },
    clearTimeout: id => timeouts.delete(id),
    setInterval: (fn, ms) => { intervals.set(ms, fn); return ms; },
    clearInterval: id => intervals.delete(id),
  });
  const result = collect(pc, video, 2000);
  // Let the initial stats read install the periodic queries and window timer.
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(typeof timeouts.get(2000), "function");
  const pendingSample = intervals.get(200)();
  now = 2000;
  timeouts.get(2000)();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  now = 2501;
  timeouts.get(5)();
  const report = await result;
  assert.equal(report.failure, "stats still pending at window end");
  const before = JSON.stringify(report);
  resolveLate(new Map([["video", { ...stat, framesDecoded: 999 }]]));
  await pendingSample;
  assert.equal(JSON.stringify(report), before);
  assert.equal(report.stats.length, 1);
  assert.equal(intervals.size, 0);
});
