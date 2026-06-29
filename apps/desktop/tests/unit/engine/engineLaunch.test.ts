import assert from "node:assert/strict";
import test from "node:test";
import {
  createEngineLaunchContext,
  createHostedInviteUrl,
  createHostedWebLaunchUrl,
  createLanInvite,
  getDockerRunArgs,
} from "../../../main/engine/launch";

test("engine launch context separates local and LAN exposure", () => {
  const local = createEngineLaunchContext({ exposureMode: "local" });
  const lan = createEngineLaunchContext({ exposureMode: "lan" });

  assert.equal(local.exposureMode, "local");
  assert.equal(local.inviteCode, undefined);
  assert.deepEqual(local.companionUrls, []);
  assert.equal(lan.exposureMode, "lan");
  assert.match(lan.inviteCode || "", /^[A-F0-9]{8}$/);
  assert.ok(lan.inviteExpiresAt && lan.inviteExpiresAt > Date.now());
  assert.equal(local.runtimeKind, "libretro");
  assert.equal(local.runtimeConfig.engineImage, "pixelated-engine");
});

test("engine launch context can request the native runtime for a restart", () => {
  const native = createEngineLaunchContext({
    exposureMode: "local",
    runtimeKind: "native_linux",
  });

  assert.equal(native.runtimeKind, "native_linux");
  assert.equal(native.runtimeConfig.engineRuntimeKind, "native_linux");
  assert.match(native.runtimeConfig.engineImage, /^pixelated-engine-native/);
});

test("engine launch helpers build hosted invite and Docker arguments", () => {
  const inviteUrl = new URL(createHostedInviteUrl("https://192.168.1.20:8090"));
  assert.equal(inviteUrl.pathname, "/engine");
  assert.equal(inviteUrl.searchParams.get("join"), "invite");
  assert.equal(
    inviteUrl.searchParams.get("companionUrl"),
    "https://192.168.1.20:8090",
  );

  const invite = createLanInvite();
  assert.match(invite.inviteCode, /^[A-F0-9]{8}$/);

  const args = getDockerRunArgs({
    advertisedUrls: ["http://192.168.1.20:8080"],
    companionUrls: ["https://192.168.1.20:8090"],
    engineToken: "token",
    exposureMode: "lan",
    includeUinputDevice: false,
    inviteCode: invite.inviteCode,
    inviteExpiresAt: invite.inviteExpiresAt,
    publishHost: "0.0.0.0",
  });
  assert.ok(
    args.includes(
      "PIXELATED_COMPANION_URLS=https://192.168.1.20:8090",
    ),
  );

  const nativeArgs = getDockerRunArgs({
    advertisedUrls: ["http://127.0.0.1:8080"],
    companionUrls: [],
    engineToken: "token",
    exposureMode: "local",
    includeUinputDevice: false,
    publishHost: "127.0.0.1",
    runtimeKind: "native_linux",
  });
  assert.ok(nativeArgs.includes("PIXELATED_ENGINE_RUNTIME_KIND=native_linux"));
  assert.match(nativeArgs.at(-1) || "", /^pixelated-engine-native/);
});

test("hosted web launch URL uses direct local pairing and ticketed LAN pairing", () => {
  const localUrl = new URL(
    createHostedWebLaunchUrl({
      advertisedUrls: ["http://127.0.0.1:8080"],
      companionLaunchUrl: "https://localhost:8090",
      createLaunchTicket: () => "launch-ticket",
      engineToken: "local-token",
      exposureMode: "local",
    }),
  );

  assert.equal(localUrl.searchParams.get("engineUrl"), "http://127.0.0.1:8080");
  assert.equal(localUrl.searchParams.get("engineToken"), "local-token");
  assert.equal(localUrl.searchParams.get("companionUrl"), "https://localhost:8090");
  assert.equal(localUrl.searchParams.get("launchTicket"), "launch-ticket");

  const lanUrl = new URL(
    createHostedWebLaunchUrl({
      advertisedUrls: ["http://192.168.1.20:8080"],
      companionLaunchUrl: "https://localhost:8090",
      createLaunchTicket: () => "launch-ticket",
      engineToken: "lan-token",
      exposureMode: "lan",
    }),
  );

  assert.equal(lanUrl.searchParams.get("companionUrl"), "https://localhost:8090");
  assert.equal(lanUrl.searchParams.get("launchTicket"), "launch-ticket");
  assert.equal(lanUrl.searchParams.get("engineUrl"), null);
  assert.equal(lanUrl.searchParams.get("engineToken"), null);
});
