import assert from "node:assert/strict";
import test from "node:test";
import {
  ENGINE_CONTROL_URL_STORAGE_KEY,
  ENGINE_URL_STORAGE_KEY,
  engineEndpoint,
  getEngineControlUrl,
  getEngineUrl,
  isAllowedEngineUrl,
  setEngineControlUrl,
  setEngineUrl,
} from "../../../src/lib/engine/engineConfig.ts";

test("engine URLs are constrained to local and LAN engine origins", () => {
  assert.equal(isAllowedEngineUrl("http://localhost:8080"), true);
  assert.equal(isAllowedEngineUrl("http://127.0.0.1:8080"), true);
  assert.equal(isAllowedEngineUrl("https://192.168.1.20:8090"), true);
  assert.equal(isAllowedEngineUrl("https://pixelated.local:8090"), true);
  assert.equal(isAllowedEngineUrl("https://engine.example.test:8090"), false);
  assert.equal(isAllowedEngineUrl("https://192.168.1.20"), false);
  assert.equal(isAllowedEngineUrl("file:///tmp/engine"), false);
  assert.equal(isAllowedEngineUrl("https://user:pass@192.168.1.20:8090"), false);
});

test("stored invalid engine URLs fall back to the default local endpoint", () => {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) || null,
        removeItem: (key: string) => {
          storage.delete(key);
        },
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    },
  });

  try {
    storage.set(ENGINE_URL_STORAGE_KEY, "https://engine.example.test:8090");
    storage.set(
      ENGINE_CONTROL_URL_STORAGE_KEY,
      "https://control.example.test:8090",
    );

    assert.equal(getEngineUrl(), "http://localhost:8080");
    assert.equal(getEngineControlUrl(), "http://localhost:8080");
    assert.equal(engineEndpoint("/health"), "http://localhost:8080/health");

    setEngineUrl("https://192.168.1.20:8090/");
    setEngineControlUrl("https://192.168.1.21:8091/");
    assert.equal(getEngineUrl(), "https://192.168.1.20:8090");
    assert.equal(getEngineControlUrl(), "https://192.168.1.21:8091");
    assert.equal(engineEndpoint("health"), "https://192.168.1.20:8090/health");
    assert.throws(
      () => setEngineUrl("https://engine.example.test:8090"),
      /local or LAN engine/,
    );
    assert.throws(
      () => setEngineControlUrl("https://control.example.test:8090"),
      /local or LAN engine/,
    );
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});
