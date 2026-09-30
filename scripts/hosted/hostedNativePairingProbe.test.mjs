import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { probeHostedNativePairing } from "./hostedNativePairingProbe.mjs";

const apiUrl = "https://api.example";
const input = { apiUrl, gameId: "native-game", sessionId: "native-session" };

function runProbe(fetch, signedIn = true, storage = {}, configuration = input) {
  const values = {
    ...(signedIn ? { "sb-project-auth-token": JSON.stringify({ access_token: "private-auth-token" }) } : {}),
    pixelated_engine_url: "https://localhost:8090",
    pixelated_engine_token: "companion:private-control-token",
    ...storage,
  };
  const localStorage = { ...values, getItem: key => values[key] ?? null };
  // Like page.evaluate, run only the serialized function, without module closures.
  return vm.runInNewContext(`(${probeHostedNativePairing.toString()})(input)`, {
    input: configuration, fetch, window: { localStorage }, URL, AbortSignal, Error, setTimeout,
  });
}

function fixture(failingPath) {
  const calls = [];
  let runtimeKind = "libretro";
  return {
    calls,
    fetch: async (url, options) => {
      const pathname = new URL(url).pathname;
      calls.push({ pathname, options });
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.redirect, "error");
      assert.equal(options.credentials, "omit");
      if (pathname === failingPath) throw new TypeError("Failed to fetch: private-auth-token");
      if (pathname === "/sessions") return Response.json({
        sessionId: input.sessionId, sessionToken: "private-session-token",
        boot: { runtimeKind: "native_linux", launchManifestId: "native-manifest" },
      });
      if (pathname.endsWith("/verify")) return Response.json({ sessionId: input.sessionId });
      if (pathname === "/health") return Response.json({ runtimeKind });
      if (pathname === "/session/stop-active") return Response.json({ stopped: false });
      if (pathname === "/runtime/switch") {
        runtimeKind = "native_linux";
        return Response.json({ status: "restarting" }, { status: 202 });
      }
      throw new Error(`Unexpected request ${pathname}`);
    },
  };
}

test("untrusted engine and control destinations are rejected before any credentialed request", async () => {
  for (const key of ["pixelated_engine_url", "pixelated_engine_control_url"]) {
    for (const value of [
      "https://attacker.example", "https://localhost.attacker.example:8090",
      "https://localhost:8090@attacker.example", "https://user:pass@localhost:8090",
      "http://localhost:8090", "https://localhost:4444", "//localhost:8090",
      "https://localhost:8090/path", "https://localhost:8090?next=https://attacker.example",
      "https://localhost:8090#fragment", "https://192.168.1.20:8090", "file:///tmp/probe",
    ]) {
      const backend = fixture();
      await assert.rejects(runProbe(backend.fetch, true, { [key]: value }), /Unapproved native probe engine destination/);
      assert.equal(backend.calls.length, 0, `${key}: ${value}`);
    }
  }
});

test("trusted HTTPS API configuration and safe session paths are required before fetch", async () => {
  for (const apiUrl of ["http://api.example", "https://user:pass@api.example", "https://api.example/path", "https://api.example?key=secret", "https://api.example#fragment"]) {
    const backend = fixture();
    await assert.rejects(runProbe(backend.fetch, true, {}, { ...input, apiUrl }), /configured HTTPS API origin/);
    assert.equal(backend.calls.length, 0);
  }
  const backend = fixture();
  await assert.rejects(runProbe(backend.fetch, true, {}, { ...input, sessionId: "../admin?redirect=elsewhere" }), /Invalid smoke session ID/);
  assert.equal(backend.calls.length, 0);
});

test("approved local destinations work and tokens stay on their intended origin", async () => {
  for (const engineUrl of ["https://localhost:8090/", "https://127.0.0.1:8090", "https://[::1]:8090", "http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"]) {
    const backend = fixture();
    const result = await runProbe((url, options) => {
      const origin = new URL(url).origin;
      if (origin === apiUrl) {
        assert.equal(options.headers["X-Engine-Token"], undefined);
      } else {
        assert.equal(origin, new URL(engineUrl).origin);
        assert.equal(options.headers.authorization, undefined);
        assert.equal(options.headers["X-Engine-Token"], "private-control-token");
      }
      return backend.fetch(url, options);
    }, true, { pixelated_engine_url: engineUrl });
    assert.equal(result.activeRuntimeKind, "native_linux");
  }
});

for (const [pathname, stage] of [
  ["/sessions", "native session creation"],
  ["/sessions/native-session/verify", "native session verification"],
  ["/session/stop-active", "engine control"],
  ["/runtime/switch", "engine control"],
]) {
  test(`native probe identifies ${pathname} network failures without exposing credentials or retrying`, async () => {
    const backend = fixture(pathname);
    await assert.rejects(runProbe(backend.fetch), error => {
      assert.ok(error.message.includes(stage));
      assert.ok(error.message.includes(`POST ${pathname.startsWith("/sessions") ? apiUrl : "https://localhost:8090"}${pathname}`));
      assert.ok(error.message.includes("before an HTTP response"));
      assert.ok(!error.message.includes("private-"));
      return true;
    });
    assert.equal(backend.calls.filter(call => call.pathname === pathname).length, 1);
  });
}

test("serialized native probe still creates, verifies, and switches the runtime", async () => {
  const backend = fixture();
  const result = await runProbe(backend.fetch);
  assert.equal(result.activeRuntimeKind, "native_linux");
  assert.equal(result.bootTarget, "native-manifest");
  assert.equal(result.verified.sessionId, input.sessionId);
  assert.equal(backend.calls[0].options.headers.authorization, "Bearer private-auth-token");
});

test("native probe rejects a missing browser login before making requests", async () => {
  const backend = fixture();
  await assert.rejects(runProbe(backend.fetch, false), /requires a signed-in hosted browser session/);
  assert.equal(backend.calls.length, 0);
});

test("native probe stops after malformed successful session responses", async () => {
  for (const body of ["<html>proxy page</html>", "null", "{}"] ) {
    let requests = 0;
    const result = await runProbe(async () => { requests += 1; return new Response(body); });
    assert.equal(result.error, "session create returned invalid native boot credentials");
    assert.equal(requests, 1);
  }
});

test("native probe does not switch runtime after stop-active is denied", async () => {
  const backend = fixture();
  const result = await runProbe((url, options) => new URL(url).pathname === "/session/stop-active"
    ? Response.json({ error: "forbidden" }, { status: 403 }) : backend.fetch(url, options));
  assert.equal(result.error, "stop active session returned 403");
  assert.equal(backend.calls.some(call => call.pathname === "/runtime/switch"), false);
});
