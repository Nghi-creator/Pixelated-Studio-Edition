import assert from "node:assert/strict";
import test from "node:test";
import { requireAcceptanceCleanup } from "./nativeBrowserCleanup.mjs";

const released = [{ status: "fulfilled" }, { status: "fulfilled" }];

test("confirmed cleanup leaves original success or failure alone", () => {
  assert.doesNotThrow(() => requireAcceptanceCleanup(new Error("original"), {}, { status: 0 }, released));
  assert.doesNotThrow(() => requireAcceptanceCleanup(null, {}, { status: 1, stderr: "No such container" }, released));
});

test("container cleanup uncertainty retains original failure, context and observations", () => {
  const original = new Error("camera admission failed");
  const acquisition = { status: "failed", events: [{ kind: "failed" }], context: { software_hash: "source" } };
  assert.throws(() => requireAcceptanceCleanup(original, acquisition, { status: 1 }, released), (error) => {
    assert.match(error.message, /cleanup unconfirmed\ncamera admission failed/);
    assert.equal(error.cause, original);
    assert.equal(error.acquisition.events, acquisition.events);
    assert.equal(error.acquisition.context, acquisition.context);
    assert.equal(error.acquisition.status, "failed");
    return true;
  });
  assert.equal(acquisition.cleanup_failures, undefined);
});

test("resource cleanup failure retains completed observations but cannot report success", () => {
  const acquisition = { status: "passed", events: [{ kind: "complete" }] };
  assert.throws(() => requireAcceptanceCleanup(null, acquisition, { status: 1 }, [{ status: "rejected" }]), (error) => {
    assert.equal(error.acquisition.status, "failed");
    assert.equal(error.acquisition.cleanup_failures.length, 2);
    assert.equal(error.acquisition.events, acquisition.events);
    return true;
  });
  assert.equal(acquisition.status, "passed");
});
