import assert from "node:assert/strict";
import test from "node:test";
import { buildAllowedOrigins } from "../../../src/config/env.js";

test("Studio origin overrides are also accepted by CORS", () => {
  const origins = buildAllowedOrigins(
    "https://user.example.test",
    "https://studio.example.test/path/",
  );

  assert.ok(origins.includes("https://user.example.test"));
  assert.ok(origins.includes("https://studio.example.test"));
});
