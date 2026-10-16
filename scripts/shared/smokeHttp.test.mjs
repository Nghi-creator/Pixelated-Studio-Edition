import assert from "node:assert/strict";
import test from "node:test";
import { requestSmoke } from "./smokeHttp.mjs";
import { createSmokeLog, redactSmokeText, safeSmokeUrl } from "./smokeArtifacts.mjs";
test("network diagnostics discard credentials, all query values and auth fragments", () => {
  assert.equal(safeSmokeUrl("https://name:secret@auth.test/verify?token_hash=private&launchTicket=private#access_token=private"), "https://auth.test/verify");
  assert.equal(safeSmokeUrl("private opaque value"), "[invalid URL]");
});
test("browser logs are capped with explicit drops and redact credentials before retention", () => {
  const log = createSmokeLog({ limit: 2, secrets: () => ["private-secret"] });
  log.push({ text: 'private-secret {"sessionToken":"private-session"} Bearer opaque-token' });
  log.push({ url: "https://api.test/callback?code=private-code" });
  log.push({ text: "discarded" });
  assert.equal(log.dropped, 1);
  assert.deepEqual(log.entries, [{ text: '[redacted] {"sessionToken":"[redacted]"} Bearer [redacted]' }, { url: "https://api.test/callback" }]);
  assert.equal(redactSmokeText("x".repeat(10000)).length, 4096);
});
for (const declared of [false, true])
  test(`HTTP body limit cancels ${declared ? "declared" : "chunked"} excess without echoing contents`, async (t) => {
    let cancelled = false;
    t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("private-value")); },
      cancel() { cancelled = true; },
    }), { headers: declared ? { "content-length": "100" } : {} }));
    await assert.rejects(requestSmoke("https://api.test/user?token=private-value", {}, { maxBodyBytes: 4 }), { message: "GET https://api.test/user failed while reading HTTP 200 body." });
    assert.equal(cancelled, true);
  });
