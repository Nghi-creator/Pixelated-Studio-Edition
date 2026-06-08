import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getCompanionInviteStatus, shouldProxy } from "../main/companionServer";

describe("desktop companion preflight", () => {
  it("distinguishes active, expired, and revoked invite states", () => {
    const now = 1_000;

    assert.equal(
      getCompanionInviteStatus(
        { code: "A1B2C3D4", expiresAt: now + 1, revokedAt: null },
        now,
      ),
      "active",
    );
    assert.equal(
      getCompanionInviteStatus(
        { code: "A1B2C3D4", expiresAt: now, revokedAt: null },
        now,
      ),
      "expired",
    );
    assert.equal(
      getCompanionInviteStatus(
        { code: null, expiresAt: null, revokedAt: now },
        now,
      ),
      "revoked",
    );
  });
});

describe("desktop companion engine proxy", () => {
  it("proxies smoke telemetry capture routes", () => {
    assert.equal(shouldProxy("/smoke/telemetry"), true);
    assert.equal(shouldProxy("/smoke/telemetry/active"), true);
  });
});
