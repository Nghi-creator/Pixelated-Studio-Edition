import assert from "node:assert/strict";
import test from "node:test";
import { BrowserCostSpan } from "./browserCostSpan.mjs";

test("browser CPU span retains failed prefix and finishes idempotently", async () => {
  let count = 0, detached = 0;
  const session = { send: async () => ({ processInfo: [{ id: 1, type: "browser", cpuTime: ++count }] }), detach: async () => { detached++; } };
  const span = new BrowserCostSpan({ newBrowserCDPSession: async () => session });
  await span.start();
  const result = await span.finish("failed_prefix");
  assert.equal(result.before.cpu_seconds, 1);
  assert.equal(result.after.cpu_seconds, 2);
  assert.equal(result.outcome, "failed_prefix");
  assert.equal(await span.finish("completed"), result);
  assert.equal(detached, 1);
});

test("missing final browser observation never fabricates zero cost", async () => {
  let count = 0;
  const session = { send: async () => { if (count++) throw new Error("closed"); return { processInfo: [{ id: 1, type: "browser", cpuTime: 3 }] }; }, detach: async () => {} };
  const span = new BrowserCostSpan({ newBrowserCDPSession: async () => session });
  await span.start();
  const result = await span.finish("failed_prefix");
  assert.equal(result.after, null);
  assert.equal(result.before.cpu_seconds, 3);
  assert.equal(result.failure, "browser_process_observation_unavailable");
});
