import assert from "node:assert/strict";
import test from "node:test";
import {
  isNormalizedPairingUrlChanged,
  preparePairing,
} from "../../../src/features/local-engine/pairingPreparation.ts";

test("direct pairing requires both an engine URL and token", () => {
  const result = preparePairing({
    engineUrl: "http://localhost:8080",
    inviteCode: "",
    inviteJoinRequested: false,
    preflightReady: false,
    token: "",
  });

  assert.deepEqual(result, {
    message: "Enter the engine URL and desktop pairing token.",
    normalizedUrl: "http://localhost:8080",
    ok: false,
  });
});

test("invite pairing requires a normalized code and completed LAN preflight", () => {
  const missingCode = preparePairing({
    engineUrl: "https://192.168.1.20:8090",
    inviteCode: "",
    inviteJoinRequested: true,
    preflightReady: true,
    token: "",
  });
  assert.equal(missingCode.ok, false);
  assert.match(missingCode.message, /invite code/);

  const pendingPreflight = preparePairing({
    engineUrl: "https://192.168.1.20:8090",
    inviteCode: "ab-12 cd",
    inviteJoinRequested: true,
    preflightReady: false,
    token: "",
  });
  assert.equal(pendingPreflight.ok, false);
  assert.match(pendingPreflight.message, /LAN join checks/);

  const prepared = preparePairing({
    engineUrl: "https://192.168.1.20:8090/",
    inviteCode: "ab-12 cd",
    inviteJoinRequested: true,
    preflightReady: true,
    token: "",
  });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.attempt.normalizedInviteCode, "AB12CD");
  assert.equal(prepared.attempt.normalizedUrl, "https://192.168.1.20:8090");
  assert.equal(prepared.attempt.joiningWithInvite, true);
});

test("pairing detects URL normalization changes before persistence", () => {
  const prepared = preparePairing({
    engineUrl: " https://localhost:8080/// ",
    inviteCode: "",
    inviteJoinRequested: false,
    preflightReady: false,
    token: " desktop-token ",
  });

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.attempt.normalizedUrl, "http://localhost:8080");
  assert.equal(prepared.attempt.normalizedToken, "desktop-token");
  assert.equal(
    isNormalizedPairingUrlChanged(
      " https://localhost:8080/// ",
      prepared.attempt.normalizedUrl,
    ),
    true,
  );
});
