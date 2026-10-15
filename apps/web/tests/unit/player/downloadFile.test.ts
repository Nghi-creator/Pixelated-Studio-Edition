import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { downloadBlob } from "../../../src/features/player/downloadFile.ts";

type Writable = { abort: () => Promise<void>; close: () => Promise<void>; write: (blob: Blob) => Promise<void> };

function browser(t: TestContext, picker?: () => Promise<{ createWritable: () => Promise<Writable> }>) {
  const calls: string[] = [];
  const descriptors = new Map(["window", "document"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    showSaveFilePicker: picker,
    setTimeout(callback: () => void) { callback(); },
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    body: { append() { calls.push("append"); } },
    createElement() { return { style: {}, click() { calls.push("click"); }, remove() { calls.push("remove"); } }; },
  } });
  t.mock.method(URL, "createObjectURL", () => { calls.push("url"); return "blob:test"; });
  t.mock.method(URL, "revokeObjectURL", () => { calls.push("revoke"); });
  t.after(() => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return calls;
}

for (const failure of ["none", "write", "close", "abort"] as const) test(`picker writable cleanup: ${failure}`, async t => {
  const writes: string[] = [];
  const payload = new Blob(["evidence"]);
  const writable = {
    async write(value: Blob) { assert.equal(value, payload); writes.push("write"); if (failure === "write" || failure === "abort") throw new Error("disk full"); },
    async close() { writes.push("close"); if (failure === "close") throw new Error("commit failed"); },
    async abort() { writes.push("abort"); if (failure === "abort") throw new Error("abort failed"); },
  };
  const calls = browser(t, async () => ({ async createWritable() { return writable; } }));
  const result = await downloadBlob("trace.tar.gz", payload);
  assert.equal(result, failure === "none" ? "saved" : "downloaded");
  assert.deepEqual(writes, failure === "none" ? ["write", "close"] : failure === "close" ? ["write", "close", "abort"] : ["write", "abort"]);
  assert.deepEqual(calls, failure === "none" ? [] : ["url", "append", "click", "remove", "revoke"]);
});

test("picker cancellation does not trigger a fallback download", async t => {
  const calls = browser(t, async () => { throw new DOMException("cancel", "AbortError"); });
  assert.equal(await downloadBlob("trace.tar.gz", new Blob()), "cancelled");
  assert.deepEqual(calls, []);
});

test("aborted writes release the stream and preserve cancellation", async t => {
  let aborted = false;
  const calls = browser(t, async () => ({ async createWritable() { return {
    async write() { throw new DOMException("cancel", "AbortError"); },
    async close() { assert.fail("cannot close a failed write"); },
    async abort() { aborted = true; },
  }; } }));
  assert.equal(await downloadBlob("trace.tar.gz", new Blob()), "cancelled");
  assert.equal(aborted, true);
  assert.deepEqual(calls, []);
});

for (const supported of [false, true]) test(`download fallback when picker ${supported ? "cannot open a writer" : "is unavailable"}`, async t => {
  const calls = browser(t, supported ? async () => ({ async createWritable() { throw new Error("unavailable"); } }) : undefined);
  assert.equal(await downloadBlob("trace.tar.gz", new Blob()), "downloaded");
  assert.deepEqual(calls, ["url", "append", "click", "remove", "revoke"]);
});
