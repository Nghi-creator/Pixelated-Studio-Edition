import assert from "node:assert/strict";
import test from "node:test";
import {
  getInviteCompanionUrl,
  getInviteFailureMessage,
  isLikelyCompanionUrl,
} from "../../../src/features/local-engine/inviteUtils.ts";

test("companion invite initialization requires explicit invite mode", () => {
  const companionUrl = "https://192.168.1.20:8090";

  assert.equal(
    getInviteCompanionUrl(`?join=invite&companionUrl=${encodeURIComponent(companionUrl)}`),
    companionUrl,
  );
  assert.equal(
    getInviteCompanionUrl(`?companionUrl=${encodeURIComponent(companionUrl)}`),
    null,
  );
  assert.equal(isLikelyCompanionUrl(new URL(companionUrl)), true);
  assert.equal(isLikelyCompanionUrl(new URL("http://192.168.1.20:8090")), false);
});

test("invite failures preserve actionable host guidance", () => {
  assert.match(getInviteFailureMessage(401), /not accepted/);
  assert.match(getInviteFailureMessage(410, "invite_expired"), /expired/);
  assert.match(
    getInviteFailureMessage(503, "host_engine_unavailable"),
    /host engine is unavailable/,
  );
});
