import assert from "node:assert/strict";
import test from "node:test";
import { createLocalIceQueue } from "../../../src/lib/webrtc/transport/localIceQueue.ts";

test("early local ICE follows its offer in FIFO order", () => {
  const sent: string[] = [];
  const queue = createLocalIceQueue({ isCurrent: () => true,
    send: (candidate) => sent.push(candidate.candidate!), onOverflow: () => assert.fail("overflow") });
  queue.add({ candidate: "early1" }); queue.add({ candidate: "early2" });
  assert.equal(sent.length, 0);
  queue.publish(() => sent.push("offer"));
  queue.add({ candidate: "late" });
  assert.deepEqual(sent, ["offer", "early1", "early2", "late"]);
  assert.equal(queue.snapshot().pending, 0);
});

test("retired connections cannot publish or drain queued candidates", () => {
  let current = true, sent = 0;
  const queue = createLocalIceQueue({ isCurrent: () => current,
    send: () => sent++, onOverflow: () => assert.fail("overflow") });
  queue.add({ candidate: "early" }); current = false;
  assert.throws(() => queue.publish(() => sent++), /retired/);
  queue.add({ candidate: "retired" });
  assert.equal(sent, 0);
});

test("candidate budget closes the scope instead of emitting partial negotiation", () => {
  let overflow = 0, sent = 0;
  const queue = createLocalIceQueue({ isCurrent: () => true,
    send: () => sent++, onOverflow: () => overflow++ });
  for (let i = 0; i < 130; i++) queue.add({ candidate: "candidate" });
  assert.equal(overflow, 1);
  assert.equal(queue.snapshot().pending, 0);
  assert.throws(() => queue.publish(() => sent++), /retired/);
  assert.equal(sent, 0);
});
