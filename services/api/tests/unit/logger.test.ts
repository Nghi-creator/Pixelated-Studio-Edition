import assert from "node:assert/strict";
import test from "node:test";
import { createLoggerOptions } from "../../src/plugins/logger.js";

test("API logger redacts authentication and cookie headers", () => {
  const options = createLoggerOptions();
  assert.ok(options && typeof options === "object");

  const redact = (options as {
    redact?: { paths?: string[] };
  }).redact;
  assert.ok(redact?.paths?.includes("req.headers.authorization"));
  assert.ok(redact?.paths?.includes("req.headers.cookie"));
  assert.ok(redact?.paths?.includes("req.headers.x-engine-token"));
  assert.ok(redact?.paths?.includes("res.headers.set-cookie"));
});
