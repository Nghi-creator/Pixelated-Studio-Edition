import assert from "node:assert/strict";
import test from "node:test";
import { getHostedWebBuild } from "./hostedPairingReadiness.mjs";

test("hosted pairing readiness follows lazy Vite chunks", async () => {
  const originalFetch = globalThis.fetch;
  const pairingMarker = "pairing-marker";
  const runtimeSwitchMarker = "runtime-switch-marker";
  const responses = new Map([
    [
      "https://pixelated.example/engine",
      '<script type="module" src="/assets/index.js"></script>',
    ],
    [
      "https://pixelated.example/assets/index.js",
      `${pairingMarker};const loadPlayer=()=>import("./Player-lazy.js");`,
    ],
    [
      "https://pixelated.example/assets/Player-lazy.js",
      `const message="${runtimeSwitchMarker}";`,
    ],
  ]);
  globalThis.fetch = async (input) => {
    const url = String(input);
    const body = responses.get(url);
    return new Response(body || "not found", { status: body ? 200 : 404 });
  };

  try {
    const build = await getHostedWebBuild({
      hostedPairingBuildMarker: pairingMarker,
      hostedRuntimeSwitchBuildMarker: runtimeSwitchMarker,
      webUrl: "https://pixelated.example",
    });

    assert.equal(build.hasLaunchPairing, true);
    assert.equal(build.hasRuntimeSwitch, true);
    assert.equal(build.assetCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("hosted pairing readiness ignores cross-origin chunk references", async () => {
  const originalFetch = globalThis.fetch;
  const fetchedUrls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    fetchedUrls.push(url);
    if (url.endsWith("/engine")) {
      return new Response('<script type="module" src="/assets/index.js"></script>');
    }
    return new Response(
      'import("https://attacker.example/runtime-switch.js");',
    );
  };

  try {
    const build = await getHostedWebBuild({
      hostedPairingBuildMarker: "missing-pairing",
      hostedRuntimeSwitchBuildMarker: "missing-runtime-switch",
      webUrl: "https://pixelated.example",
    });

    assert.equal(build.assetCount, 1);
    assert.deepEqual(fetchedUrls, [
      "https://pixelated.example/engine",
      "https://pixelated.example/assets/index.js",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
