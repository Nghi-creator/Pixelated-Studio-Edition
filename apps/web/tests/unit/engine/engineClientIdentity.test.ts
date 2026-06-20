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
    const { clearEngineToken, engineAuthHeaders, setEngineToken } =
      await import("../../../src/lib/engine/engineAuth.ts");

    setEngineToken("first-token");
    const firstClientId = engineAuthHeaders()["X-Pixelated-Client-Id"];

    clearEngineToken();
    setEngineToken("second-token");
    const secondClientId = engineAuthHeaders()["X-Pixelated-Client-Id"];

    assert.ok(firstClientId);
    assert.equal(secondClientId, firstClientId);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});
