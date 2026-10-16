import assert from "node:assert/strict";
import test from "node:test";
import { cleanupRun, disconnectOwnedGuests, connectOwnedGuests } from "./multiplayerSmokeCleanup.mjs";
import { parseArgs } from "./multiplayerSmokeOptions.mjs";
import { createHostedPairingConfig } from "../hosted/hostedPairingConfig.mjs";
test("cleanup attempts every retained partial join and telemetry even if one disconnect fails", async () => {
  const attempted = [];
  const run = { captureToken: "owned-capture", options: { engineUrl: "http://engine.test" }, automatedGuests: [{ disconnect() { attempted.push("first"); throw new Error("broken socket"); } }, { disconnect() { attempted.push("second"); } }] };
  const failures = await cleanupRun(run, async () => { attempted.push("capture"); });
  assert.deepEqual(attempted, ["first", "second", "capture"]);
  assert.equal(failures.length, 1);
  assert.equal(run.captureToken, null);
});
test("failed guest cleanup remains a failure and retains retry ownership", async () => {
  const run = { automatedGuests: [{ disconnect() { throw new Error("closed failed"); } }] };
  await assert.rejects(disconnectOwnedGuests(run), /cleanup failed/);
  assert.equal(run.automatedGuests.length, 1);
});
for (const args of [["--expected-guests", "17"], ["--timeout-ms", "NaN"], ["--poll-ms", "900000"], ["--engine-url", "https://user:secret@host.test"], ["--engine-url", "https://host.test?token=private"], ["--engine-url", "--skip-disconnect"]])
  test(`reject invalid LAN arguments ${args[0]}`, () => assert.throws(() => parseArgs(args, {})));
for (const environment of [{ HOSTED_SMOKE_PUBLISH_TIMEOUT_MS: "NaN" }, { HOSTED_SMOKE_PUBLISH_TIMEOUT_MS: "0" }, { HOSTED_API_URL: "https://name:private@api.test" }])
  test("hosted config rejects unbounded/credential-bearing settings before creating artifacts", () => assert.throws(() => createHostedPairingConfig(environment, [])));
test("a later join failure retains ownership of each earlier acquired guest", async () => {
  const run = { automatedGuests: [], options: {}, captureToken: null };
  let closed = 0;
  await assert.rejects(connectOwnedGuests(run, 2, async (index) => {
    if (index === 1)
      throw new Error("second join failed");
    return { disconnect() { closed++; } };
  }), /second join failed/);
  assert.equal(run.automatedGuests.length, 1);
  assert.deepEqual(await cleanupRun(run), []);
  assert.equal(closed, 1);
});
