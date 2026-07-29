import assert from "node:assert/strict";
import test from "node:test";

test("engine client id survives token clearing so revocation stays bound to the browser", async () => {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      dispatchEvent: () => true,
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
    const {
      clearEngineToken,
      ENGINE_CONTROL_TOKEN_STORAGE_KEY,
      ENGINE_TOKEN_EXPIRES_AT_STORAGE_KEY,
      engineAuthHeaders,
      engineControlAuthHeaders,
      getEngineToken,
      setEngineControlToken,
      setEngineToken,
    } = await import("../../../src/lib/engine/engineAuth.ts");

    setEngineToken("first-token");
    const firstClientId = engineAuthHeaders()["X-Pixelated-Client-Id"];

    clearEngineToken();
    setEngineToken("second-token");
    const secondClientId = engineAuthHeaders()["X-Pixelated-Client-Id"];

    assert.ok(firstClientId);
    assert.equal(secondClientId, firstClientId);

    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    setEngineToken("expiring-token", expiresAt);
    setEngineControlToken("expiring-control-token");
    assert.equal(
      storage.get(ENGINE_TOKEN_EXPIRES_AT_STORAGE_KEY),
      String(Date.parse(expiresAt)),
    );

    storage.set(ENGINE_TOKEN_EXPIRES_AT_STORAGE_KEY, String(Date.now() - 1));
    assert.equal(getEngineToken(), "");
    assert.deepEqual(engineControlAuthHeaders(), {});
    assert.equal(storage.has(ENGINE_CONTROL_TOKEN_STORAGE_KEY), false);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});
