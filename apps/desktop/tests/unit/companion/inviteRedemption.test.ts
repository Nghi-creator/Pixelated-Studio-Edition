import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRedeemCompanionInvite } from "../../../main/companion/invite/redeemInvite";

function createHarness() {
  let state = {
    code: "ABCD1234",
    expiresAt: Date.now() + 60_000,
    revokedAt: null,
  };
  let cleared = false;
  const redeem = createRedeemCompanionInvite({
    clearFailure: () => {
      cleared = true;
    },
    createAccessToken: () => "guest-token",
    getInviteState: () => state,
    getInviteStatus: () =>
      state.code && state.expiresAt && state.expiresAt > Date.now()
        ? "active"
        : "revoked",
    probeEngineHealth: async () => true,
    recordFailure: () => ({ blocked: false, retryAfterSeconds: 0 }),
    secretsEqual: (left, right) => left === right,
  });
  return {
    get cleared() {
      return cleared;
    },
    redeem,
    replaceInvite() {
      state = { ...state, code: "REPLACED" };
    },
  };
}

describe("companion invite redemption", () => {
  it("normalizes and redeems an active invite through the workflow", async () => {
    const harness = createHarness();
    const result = await harness.redeem({
      remoteAddress: "127.0.0.1",
      submittedCode: "abcd-1234",
    });

    assert.equal(result.status, "redeemed");
    assert.equal(harness.cleared, true);
    if (result.status === "redeemed") {
      assert.equal(result.companionToken, "guest-token");
    }
  });

  it("rejects an invalid invite without issuing access", async () => {
    const harness = createHarness();
    const result = await harness.redeem({
      remoteAddress: "127.0.0.1",
      submittedCode: "wrong",
    });

    assert.equal(result.status, "invalid");
    assert.equal(harness.cleared, false);
  });

  it("detects an invite replaced while engine health is checked", async () => {
    let replaced = false;
    const redeem = createRedeemCompanionInvite({
      clearFailure: () => undefined,
      createAccessToken: () => "guest-token",
      getInviteState: () => ({
        code: replaced ? "REPLACED" : "ABCD1234",
        expiresAt: Date.now() + 60_000,
        revokedAt: null,
      }),
      getInviteStatus: () => "active",
      probeEngineHealth: async () => {
        replaced = true;
        return true;
      },
      recordFailure: () => ({ blocked: false, retryAfterSeconds: 0 }),
      secretsEqual: (left, right) => left === right,
    });

    const result = await redeem({
      remoteAddress: "127.0.0.1",
      submittedCode: "ABCD1234",
    });
    assert.equal(result.status, "replaced");
  });
});
