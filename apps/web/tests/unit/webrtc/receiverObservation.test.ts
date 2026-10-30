import assert from "node:assert/strict";
import test from "node:test";
import { offerDigest, parseReceiverChallenge, startReceiverObservation, type ReceiverObservation } from "../../../src/lib/webrtc/telemetry/receiverObservation.ts";

const challenge = { peerId: "peer", bindingId: "a".repeat(64), offerHash: "b".repeat(64) };
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function fixture(initialMissing = false, onStop?: (reason: string) => void) {
  let now = 0, id = 0, frames = 0, timestamp = 0;
  let current = true;
  let pending: (() => Promise<RTCStatsReport>) | null = null;
  const timers = new Map<number, () => void>();
  const callbacks = new Map<number, VideoFrameRequestCallback>();
  const samples: ReceiverObservation[] = [];
  const track = { id: "video", kind: "video", readyState: "live" };
  const stream = { getVideoTracks: () => [track] };
  const video = { srcObject: stream,
    requestVideoFrameCallback(callback: VideoFrameRequestCallback) { callbacks.set(++id, callback); return id; },
    cancelVideoFrameCallback(handle: number) { callbacks.delete(handle); },
  };
  const record: Record<string, unknown> = { id: "inbound", type: "inbound-rtp", kind: "video", trackIdentifier: "video", ssrc: 123 };
  const report = () => { if (initialMissing) { initialMissing = false; return new Map() as RTCStatsReport; } return new Map([["inbound", { ...record, timestamp: ++timestamp, framesDecoded: frames += 6 }]]) as unknown as RTCStatsReport; };
  const pc = { connectionState: "connected", iceConnectionState: "completed", getReceivers: () => [{ track }],
    getStats: async () => pending ? pending() : report(),
  };
  const stop = startReceiverObservation({ pc: pc as unknown as RTCPeerConnection, challenge,
    getVideo: () => video as unknown as HTMLVideoElement, getStream: () => stream as unknown as MediaStream,
    isCurrent: () => current, onStop, emit: (value) => samples.push(value), now: () => now, clockId: "clock",
    schedule: (callback) => { timers.set(++id, callback); return id; }, cancel: (handle) => { timers.delete(handle); },
  });
  return { stop, pc, video, record, samples, timers, callbacks, report,
    setPending: (value: (() => Promise<RTCStatsReport>) | null) => { pending = value; },
    replace: () => { current = false; }, setNow: (value: number) => { now = value; },
    fire: (presentedFrames: number) => { const [key, callback] = [...callbacks][0]!; callbacks.delete(key); callback(now, { presentedFrames } as VideoFrameCallbackMetadata); },
    tick: async () => { now += 200; const [key, callback] = [...timers][0]!; timers.delete(key); callback(); await flush(); },
  };
}

test("challenge parsing is closed and offer hashing preserves exact SDP bytes", async () => {
  assert.deepEqual(parseReceiverChallenge(challenge), challenge);
  assert.equal(parseReceiverChallenge({ ...challenge, targetFps: 24 }), null);
  assert.equal(parseReceiverChallenge({ ...challenge, bindingId: "x" }), null);
  assert.equal(parseReceiverChallenge(Object.assign(Object.create(challenge), { a: 1, b: 2, c: 3 })), null);
  assert.notEqual(await offerDigest("offer\r\n"), await offerDigest("offer\n"));
});

test("reported progress requires actual frame callbacks and matching decoded track", async () => {
  const value = fixture(); await flush();
  await value.tick(); assert.equal(value.samples.length, 0);
  value.fire(10); await value.tick();
  assert.equal(value.samples.length, 1);
  assert.equal(value.samples[0]?.sequence, 0);
  assert.equal(value.samples[0]?.presentedFrames, 10);
  assert.equal(value.samples[0]?.framesDecoded, 18);
  assert.equal(value.samples[0]?.elapsedNs, 400000000);
  value.stop(); assert.equal(value.callbacks.size, 0); assert.equal(value.timers.size, 0);
});

test("wrong track, SSRC replacement and counter reset stop instead of merging epochs", async () => {
  for (const change of [{ trackIdentifier: "other" }, { ssrc: 456 }, { id: "replacement" }]) {
    const value = fixture(); await flush(); value.fire(10); await value.tick();
    Object.assign(value.record, change); await value.tick();
    assert.equal(value.samples.length, 1); assert.equal(value.callbacks.size, 0); assert.equal(value.timers.size, 0);
  }
  const value = fixture(); await flush(); value.fire(10); value.fire(9);
  assert.equal(value.callbacks.size, 0); assert.equal(value.samples.length, 0);
});

test("late getStats completion after disposal cannot emit or schedule work", async () => {
  const value = fixture(); await flush(); value.fire(10);
  let resolve!: (report: RTCStatsReport) => void;
  value.setPending(() => new Promise((done) => { resolve = done; }));
  await value.tick();
  assert.equal(value.timers.size, 0);
  value.stop(); resolve(value.report()); await flush();
  assert.equal(value.samples.length, 0); assert.equal(value.timers.size, 0); assert.equal(value.callbacks.size, 0);
});

test("runtime replacement and slow stats cannot relabel stale samples as fresh", async () => {
  const value = fixture(); await flush(); value.fire(10);
  value.setPending(async () => { value.setNow(1000); return value.report(); });
  await value.tick(); assert.equal(value.samples.length, 0); assert.equal(value.callbacks.size, 0);
  const replaced = fixture(); await flush(); replaced.fire(1); replaced.replace(); await replaced.tick();
  assert.equal(replaced.samples.length, 0); assert.equal(replaced.callbacks.size, 0);
});

test("connection loss cancels observation without changing stream control", async () => {
  const value = fixture(); await flush(); value.pc.connectionState = "disconnected"; await value.tick();
  assert.equal(value.samples.length, 0); assert.equal(value.callbacks.size, 0); assert.equal(value.timers.size, 0);
});

test("connected-before-first-inbound-stats waits for data without inventing zero", async () => {
  const value = fixture(true); await flush();
  assert.equal(value.samples.length, 0);
  assert.equal(value.callbacks.size, 1);
  value.fire(10); await value.tick();
  assert.equal(value.samples.length, 1);
  assert.equal(value.samples[0]?.sequence, 0);
  assert.equal(value.samples[0]?.framesDecoded, 6);
  value.stop();
});

test("cached inbound stats are skipped without ending observation or refreshing progress", async () => {
  const value = fixture(); await flush(); value.fire(10); await value.tick();
  assert.equal(value.samples.length, 1);
  const cached = new Map([["inbound", { ...value.record, timestamp: 2, framesDecoded: 12 }]]) as unknown as RTCStatsReport;
  value.setPending(async () => cached);
  value.fire(12); await value.tick();
  assert.equal(value.samples.length, 1, "cached decoded data must not receive a fresh elapsed timestamp");
  assert.equal(value.timers.size, 1, "a legal cached report must not permanently stop collection");
  assert.equal(value.callbacks.size, 1);
  value.setPending(null); value.fire(16); await value.tick();
  assert.equal(value.samples.length, 2);
  assert.equal(value.samples[1]?.sequence, 1, "skipped cache must not create a sequence gap");
  assert.equal(value.samples[1]?.elapsedNs, 600000000);
  assert.equal(value.samples[1]?.framesDecoded, 18);
  value.stop();
});

test("repeated cached stats never manufacture a heartbeat or frame progress", async () => {
  const value = fixture(); await flush(); value.fire(10); await value.tick();
  const first = { ...value.samples[0]! };
  const cached = new Map([["inbound", { ...value.record, timestamp: 2, framesDecoded: 12 }]]) as unknown as RTCStatsReport;
  value.setPending(async () => cached);
  for (let i = 0; i < 5; i++) await value.tick();
  assert.deepEqual(value.samples, [first]);
  assert.equal(value.timers.size, 1);
  value.stop();
});

test("timestamp reversal, counter reset and changed identity remain fatal even around cached stats", async () => {
  for (const change of [{ timestamp: 1 }, { framesDecoded: 11 }, { ssrc: 456 }]) {
    const value = fixture(); await flush(); value.fire(10); await value.tick();
    const invalid = new Map([["inbound", { ...value.record, timestamp: 2, framesDecoded: 12, ...change }]]) as unknown as RTCStatsReport;
    value.setPending(async () => invalid); await value.tick();
    assert.equal(value.samples.length, 1);
    assert.equal(value.timers.size, 0);
    assert.equal(value.callbacks.size, 0);
  }
});


test("collector termination reports once and diagnostic failure cannot prevent cleanup", async () => {
  const reasons: string[] = [];
  const value = fixture(false, (reason) => { reasons.push(reason); throw Error("diagnostic consumer failed"); });
  await flush(); value.pc.connectionState = "disconnected"; await value.tick();
  assert.deepEqual(reasons, ["connection_unavailable"]);
  assert.equal(value.callbacks.size, 0); assert.equal(value.timers.size, 0);
  value.stop(); assert.deepEqual(reasons, ["connection_unavailable"]);
});
