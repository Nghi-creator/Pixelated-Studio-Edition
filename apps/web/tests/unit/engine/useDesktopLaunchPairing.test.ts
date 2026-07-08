import assert from "node:assert/strict";
import test from "node:test";
import { pairFromDesktopLaunchUrl } from "../../../src/lib/engine/desktopLaunchPairing.ts";

test("desktop launch pairing rejects legacy raw engine token query params", async () => {
  const calls: Array<{ name: string; value: unknown }> = [];
  const url = new URL(
    "https://pixelated.example/engine?engineUrl=http%3A%2F%2Flocalhost%3A8080&engineToken=local-token&companionUrl=https%3A%2F%2Flocalhost%3A8090&launchTicket=ticket-1&keep=1",
  );

  const paired = await pairFromDesktopLaunchUrl(url, {
    createCompanionEngineToken: (token) => `companion:${token}`,
    engineAuthHeaders: () => ({ "X-Engine-Token": "unused" }),
    fetch: ((input, init) => {
      calls.push({ name: "fetch", value: { input, init } });
      if (String(input).endsWith("/launch/redeem")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ companionToken: "control-token" }),
          status: 200,
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    }) as typeof fetch,
    pairLocalEngine: async (engineUrl) => {
      calls.push({ name: "pairLocalEngine", value: engineUrl });
      return {
        pairing: {
          createdAt: "2026-06-17T00:00:00.000Z",
          engineUrl,
          pairingId: "pairing-id",
          tokenStoredBy: "browser-local-storage",
          updatedAt: "2026-06-17T00:00:00.000Z",
        },
      };
    },
    replaceState: (nextUrl) => {
      calls.push({ name: "replaceState", value: nextUrl.toString() });
    },
    setEngineControlToken: (token) => {
      calls.push({ name: "setEngineControlToken", value: token });
    },
    setEngineControlUrl: (engineUrl) => {
      calls.push({ name: "setEngineControlUrl", value: engineUrl });
    },
    setEngineToken: (token) => {
      calls.push({ name: "setEngineToken", value: token });
    },
    setEngineUrl: (engineUrl) => {
      calls.push({ name: "setEngineUrl", value: engineUrl });
    },
  });

  assert.equal(paired, false);
  assert.deepEqual(calls, [
    {
      name: "replaceState",
      value: "https://pixelated.example/engine?keep=1",
    },
  ]);
});

test("desktop launch pairing redeems companion launch tickets locally", async () => {
  const calls: Array<{ name: string; value: unknown }> = [];
  const url = new URL(
    "https://pixelated.example/engine?companionUrl=https%3A%2F%2Flocalhost%3A8090&launchTicket=ticket-1",
  );

  const paired = await pairFromDesktopLaunchUrl(url, {
    createCompanionEngineToken: (token) => `companion:${token}`,
    engineAuthHeaders: () => ({
      "X-Engine-Token": "redeemed-token",
      "X-Pixelated-Client-Id": "client-id",
    }),
    fetch: ((input, init) => {
      calls.push({ name: "fetch", value: { input, init } });
      if (String(input).endsWith("/launch/redeem")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ companionToken: "redeemed-token" }),
          status: 200,
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    }) as typeof fetch,
    pairLocalEngine: async (engineUrl) => {
      calls.push({ name: "pairLocalEngine", value: engineUrl });
      return {
        pairing: {
          createdAt: "2026-06-17T00:00:00.000Z",
          engineUrl,
          pairingId: "pairing-id",
          tokenStoredBy: "browser-local-storage",
          updatedAt: "2026-06-17T00:00:00.000Z",
        },
      };
    },
    replaceState: (nextUrl) => {
      calls.push({ name: "replaceState", value: nextUrl.toString() });
    },
    setEngineControlToken: (token) => {
      calls.push({ name: "setEngineControlToken", value: token });
    },
    setEngineControlUrl: (engineUrl) => {
      calls.push({ name: "setEngineControlUrl", value: engineUrl });
    },
    setEngineToken: (token) => {
      calls.push({ name: "setEngineToken", value: token });
    },
    setEngineUrl: (engineUrl) => {
      calls.push({ name: "setEngineUrl", value: engineUrl });
    },
  });

  assert.equal(paired, true);
  assert.deepEqual(calls, [
    {
      name: "fetch",
      value: {
        input: "https://localhost:8090/launch/redeem",
        init: {
          body: JSON.stringify({ ticket: "ticket-1" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      },
    },
    { name: "setEngineUrl", value: "https://localhost:8090" },
    { name: "setEngineToken", value: "companion:redeemed-token" },
    { name: "setEngineControlUrl", value: "https://localhost:8090" },
    { name: "setEngineControlToken", value: "redeemed-token" },
    {
      name: "fetch",
      value: {
        input: "https://localhost:8090/local-games",
        init: {
          cache: "no-store",
          headers: {
            "X-User-Id": "connection-monitor",
            "X-Engine-Token": "redeemed-token",
            "X-Pixelated-Client-Id": "client-id",
          },
        },
      },
    },
    { name: "replaceState", value: "https://pixelated.example/engine" },
    { name: "pairLocalEngine", value: "https://localhost:8090" },
  ]);
});

test("desktop launch pairing rejects unsafe companion launch URLs before redeeming", async () => {
  const calls: Array<{ name: string; value: unknown }> = [];
  const url = new URL(
    "https://pixelated.example/engine?companionUrl=https%3A%2F%2Fattacker.example.test%3A8090&launchTicket=ticket-1",
  );

  const paired = await pairFromDesktopLaunchUrl(url, {
    createCompanionEngineToken: (token) => `companion:${token}`,
    engineAuthHeaders: () => ({ "X-Engine-Token": "unused" }),
    fetch: ((input, init) => {
      calls.push({ name: "fetch", value: { input, init } });
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    }) as typeof fetch,
    pairLocalEngine: async (engineUrl) => {
      calls.push({ name: "pairLocalEngine", value: engineUrl });
    },
    replaceState: (nextUrl) => {
      calls.push({ name: "replaceState", value: nextUrl.toString() });
    },
    setEngineControlToken: (token) => {
      calls.push({ name: "setEngineControlToken", value: token });
    },
    setEngineControlUrl: (engineUrl) => {
      calls.push({ name: "setEngineControlUrl", value: engineUrl });
    },
    setEngineToken: (token) => {
      calls.push({ name: "setEngineToken", value: token });
    },
    setEngineUrl: (engineUrl) => {
      calls.push({ name: "setEngineUrl", value: engineUrl });
    },
  });

  assert.equal(paired, false);
  assert.deepEqual(calls, [
    { name: "replaceState", value: "https://pixelated.example/engine" },
  ]);
});

test("desktop launch pairing scrubs launch params after failed ticket redemption", async () => {
  const calls: Array<{ name: string; value: unknown }> = [];
  const url = new URL(
    "https://pixelated.example/engine?companionUrl=https%3A%2F%2Flocalhost%3A8090&launchTicket=ticket-1&keep=1",
  );

  const paired = await pairFromDesktopLaunchUrl(url, {
    createCompanionEngineToken: (token) => `companion:${token}`,
    engineAuthHeaders: () => ({ "X-Engine-Token": "unused" }),
    fetch: ((input, init) => {
      calls.push({ name: "fetch", value: { input, init } });
      return Promise.resolve({
        ok: false,
        json: async () => ({ error: "invalid ticket" }),
        status: 401,
      } as Response);
    }) as typeof fetch,
    pairLocalEngine: async (engineUrl) => {
      calls.push({ name: "pairLocalEngine", value: engineUrl });
    },
    replaceState: (nextUrl) => {
      calls.push({ name: "replaceState", value: nextUrl.toString() });
    },
    setEngineControlToken: (token) => {
      calls.push({ name: "setEngineControlToken", value: token });
    },
    setEngineControlUrl: (engineUrl) => {
      calls.push({ name: "setEngineControlUrl", value: engineUrl });
    },
    setEngineToken: (token) => {
      calls.push({ name: "setEngineToken", value: token });
    },
    setEngineUrl: (engineUrl) => {
      calls.push({ name: "setEngineUrl", value: engineUrl });
    },
  });

  assert.equal(paired, false);
  assert.deepEqual(calls, [
    {
      name: "fetch",
      value: {
        input: "https://localhost:8090/launch/redeem",
        init: {
          body: JSON.stringify({ ticket: "ticket-1" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      },
    },
    {
      name: "replaceState",
      value: "https://pixelated.example/engine?keep=1",
    },
  ]);
});

test("desktop launch pairing scrubs launch params when ticket redemption is unreachable", async () => {
  const calls: Array<{ name: string; value: unknown }> = [];
  const url = new URL(
    "https://pixelated.example/?companionUrl=https%3A%2F%2Flocalhost%3A8090&launchTicket=ticket-1&keep=1",
  );

  const paired = await pairFromDesktopLaunchUrl(url, {
    createCompanionEngineToken: (token) => `companion:${token}`,
    engineAuthHeaders: () => ({ "X-Engine-Token": "unused" }),
    fetch: ((input, init) => {
      calls.push({ name: "fetch", value: { input, init } });
      return Promise.reject(new Error("connection refused"));
    }) as typeof fetch,
    pairLocalEngine: async (engineUrl) => {
      calls.push({ name: "pairLocalEngine", value: engineUrl });
    },
    replaceState: (nextUrl) => {
      calls.push({ name: "replaceState", value: nextUrl.toString() });
    },
    setEngineControlToken: (token) => {
      calls.push({ name: "setEngineControlToken", value: token });
    },
    setEngineControlUrl: (engineUrl) => {
      calls.push({ name: "setEngineControlUrl", value: engineUrl });
    },
    setEngineToken: (token) => {
      calls.push({ name: "setEngineToken", value: token });
    },
    setEngineUrl: (engineUrl) => {
      calls.push({ name: "setEngineUrl", value: engineUrl });
    },
  });

  assert.equal(paired, false);
  assert.deepEqual(calls, [
    {
      name: "fetch",
      value: {
        input: "https://localhost:8090/launch/redeem",
        init: {
          body: JSON.stringify({ ticket: "ticket-1" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      },
    },
    {
      name: "replaceState",
      value: "https://pixelated.example/home?keep=1",
    },
  ]);
});

test("desktop launch pairing sends bare launch tickets to home after redemption", async () => {
  const calls: Array<{ name: string; value: unknown }> = [];
  const url = new URL(
    "https://pixelated.example/?companionUrl=https%3A%2F%2Flocalhost%3A8090&launchTicket=ticket-1",
  );

  const paired = await pairFromDesktopLaunchUrl(url, {
    createCompanionEngineToken: (token) => `companion:${token}`,
    engineAuthHeaders: () => ({
      "X-Engine-Token": "redeemed-token",
      "X-Pixelated-Client-Id": "client-id",
    }),
    fetch: ((input, init) => {
      calls.push({ name: "fetch", value: { input, init } });
      if (String(input).endsWith("/launch/redeem")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ companionToken: "redeemed-token" }),
          status: 200,
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    }) as typeof fetch,
    pairLocalEngine: async (engineUrl) => {
      calls.push({ name: "pairLocalEngine", value: engineUrl });
      return {
        pairing: {
          createdAt: "2026-06-17T00:00:00.000Z",
          engineUrl,
          pairingId: "pairing-id",
          tokenStoredBy: "browser-local-storage",
          updatedAt: "2026-06-17T00:00:00.000Z",
        },
      };
    },
    replaceState: (nextUrl) => {
      calls.push({ name: "replaceState", value: nextUrl.toString() });
    },
    setEngineControlToken: (token) => {
      calls.push({ name: "setEngineControlToken", value: token });
    },
    setEngineControlUrl: (engineUrl) => {
      calls.push({ name: "setEngineControlUrl", value: engineUrl });
    },
    setEngineToken: (token) => {
      calls.push({ name: "setEngineToken", value: token });
    },
    setEngineUrl: (engineUrl) => {
      calls.push({ name: "setEngineUrl", value: engineUrl });
    },
  });

  assert.equal(paired, true);
  assert.equal(
    calls.find((call) => call.name === "replaceState")?.value,
    "https://pixelated.example/home",
  );
  assert.equal(
    calls.find((call) => call.name === "pairLocalEngine")?.value,
    "https://localhost:8090",
  );
});
