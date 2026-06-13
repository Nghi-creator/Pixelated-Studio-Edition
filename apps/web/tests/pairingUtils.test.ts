import assert from "node:assert/strict";
import test from "node:test";
import {
  engineUrlEndpoint,
  getEngineUrlScope,
  normalizeEngineUrl,
  parseEngineUrl,
} from "../src/features/local-engine/pairingUtils.ts";

test("pairing URLs normalize and classify local, LAN, and custom engines", () => {
  assert.equal(normalizeEngineUrl(" http://localhost:8080/// "), "http://localhost:8080");
  assert.equal(engineUrlEndpoint("http://localhost:8080/", "health"), "http://localhost:8080/health");
  assert.equal(getEngineUrlScope("http://localhost:8080"), "local");
  assert.equal(getEngineUrlScope("https://192.168.1.20:8090"), "lan");
  assert.equal(getEngineUrlScope("https://engine.example.test"), "custom");
  assert.equal(parseEngineUrl("file:///tmp/engine"), null);
});

