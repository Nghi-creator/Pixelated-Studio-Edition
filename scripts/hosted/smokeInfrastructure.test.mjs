import assert from "node:assert/strict";
import test from "node:test";
import { requestSmoke } from "../shared/smokeHttp.mjs";
import { runSmokeCleanup } from "../shared/smokeCleanup.mjs";
import { restorePairingSnapshot } from "./hostedPairingCleanup.mjs";
import { waitForRenderApiDeploy, waitForHostedWebPairingBundle } from "./hostedPairingReadiness.mjs";

function stall(signal) {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

for (const phase of ["headers", "body"]) {
  test(`smoke HTTP timeout covers stalled ${phase} without retrying`, { timeout: 5_000 }, async t => {
    const keepAlive = setInterval(() => {}, 1000);
    t.after(() => clearInterval(keepAlive));
    const fetch = t.mock.method(globalThis, "fetch", async (_url, { signal }) => {
      if (phase === "headers") return stall(signal);
      return { status: 200, ok: true, text: () => stall(signal) };
    });
    await assert.rejects(requestSmoke("https://api.example/sessions", { method: "POST" }, { timeoutMs: 25 }),
      /POST https:\/\/api.example\/sessions timed out/);
    assert.equal(fetch.mock.callCount(), 1);
  });
}

test("HTTP errors preserve status and never echo secret response bodies or query strings", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html>private-key</html>", { status: 502 }));
  await assert.rejects(requestSmoke("https://api.example/auth?token=private-key"), {
    message: "GET https://api.example/auth returned HTTP 502.",
  });
});

test("malformed successful JSON fails with endpoint and status", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("private-key"));
  await assert.rejects(requestSmoke("https://api.example/ready"), {
    message: "GET https://api.example/ready returned invalid JSON (HTTP 200).",
  });
});

test("empty deletion responses and explicit expected statuses remain supported", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
  assert.equal((await requestSmoke("https://api.example/user", { method: "DELETE" }, { expected: [204] })).body, null);
});

test("caller cancellation is preserved", async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (_url, { signal }) => stall(signal));
  const pending = requestSmoke("https://api.example/ready", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /was cancelled before an HTTP response/);
});

for (const target of ["Render", "Vercel"]) {
  test(`${target} readiness deadline interrupts stalled requests`, { timeout: 5_000 }, async t => {
    const keepAlive = setInterval(() => {}, 1000);
    t.after(() => clearInterval(keepAlive));
    t.mock.method(globalThis, "fetch", async (_url, { signal }) => stall(signal));
    const pending = target === "Render"
      ? waitForRenderApiDeploy({ apiUrl: "https://api.example", timeoutMs: 25 })
      : waitForHostedWebPairingBundle({ webUrl: "https://web.example", timeoutMs: 25 });
    await assert.rejects(pending, new RegExp(`${target} did not publish.*25ms`));
  });
}

test("cleanup continues after failures and reports each failed operation", async () => {
  const attempted = [];
  const failures = await runSmokeCleanup([
    ["delete session", () => { attempted.push("session"); throw new Error("offline"); }],
    ["restore pairing", async () => { attempted.push("pairing"); throw new Error("denied"); }],
    ["close server", () => { attempted.push("server"); }],
  ]);
  assert.deepEqual(attempted, ["session", "pairing", "server"]);
  assert.deepEqual(failures, [
    { name: "delete session", error: "offline" },
    { name: "restore pairing", error: "denied" },
  ]);
});

test("early smoke failure cannot erase a pairing that was never read", async () => {
  await restorePairingSnapshot({ captured: false, pairing: null }, () => assert.fail("must not mutate pairing"));
});

test("cleanup distinguishes an absent pairing from an existing saved pairing", async () => {
  const calls = [];
  const request = async (...args) => { calls.push(args); };
  await restorePairingSnapshot({ captured: true, pairing: null }, request);
  await restorePairingSnapshot({ captured: true, pairing: { engineUrl: "https://localhost:8090" } }, request);
  assert.deepEqual(calls, [
    ["/local-pairings/current", { expected: 204, method: "DELETE" }],
    ["/local-pairings", { body: { engineUrl: "https://localhost:8090" }, method: "POST" }],
  ]);
});
