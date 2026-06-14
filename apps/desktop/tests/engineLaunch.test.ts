import assert from "node:assert/strict";
import test from "node:test";
import {
  createEngineLaunchContext,
  createHostedInviteUrl,
  createLanInvite,
  getDockerRunArgs,
} from "../main/engine/launch";

test("engine launch context separates local and LAN exposure", () => {
  const local = createEngineLaunchContext({ exposureMode: "local" });
  const lan = createEngineLaunchContext({ exposureMode: "lan" });

  assert.equal(local.exposureMode, "local");
  assert.equal(local.inviteCode, undefined);
  assert.deepEqual(local.companionUrls, []);
  assert.equal(lan.exposureMode, "lan");
  assert.match(lan.inviteCode || "", /^[A-F0-9]{8}$/);
  assert.ok(lan.inviteExpiresAt && lan.inviteExpiresAt > Date.now());
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
});

