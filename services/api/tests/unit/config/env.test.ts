import assert from "node:assert/strict";
import test from "node:test";
import { buildAllowedOrigins } from "../../../src/config/env.js";

test("Studio origin overrides are also accepted by CORS", () => {
  const origins = buildAllowedOrigins(
    "https://user.example.test",
    "https://studio.example.test/path/",
  );
  const originSet = new Set(origins);

  assert.equal(originSet.has("https://user.example.test"), true);
  assert.equal(originSet.has("https://studio.example.test"), true);
  assert.equal(originSet.has("https://user.example.test.attacker.invalid"), false);
  assert.equal(
    originSet.has("https://studio.example.test.attacker.invalid"),
    false,
  );
});
