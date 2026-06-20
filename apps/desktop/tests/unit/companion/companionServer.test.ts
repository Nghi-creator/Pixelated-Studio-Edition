import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  consumeCompanionLaunchTicket,
  createCompanionLaunchTicket,
  getCompanionStatusPage,
  getCompanionInviteStatus,
  recordCompanionInviteFailure,
  revokeCompanionInvite,
  shouldProxy,
} from "../../../main/companion/server";

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

describe("desktop companion invite abuse controls", () => {
  it("temporarily blocks repeated invalid invite attempts", () => {
    revokeCompanionInvite();
    const now = 1_000;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      assert.equal(
        recordCompanionInviteFailure("client", now + attempt).blocked,
        false,
      );
    }

    assert.equal(recordCompanionInviteFailure("client", now + 8).blocked, true);
    assert.equal(recordCompanionInviteFailure("other", now + 8).blocked, false);
    assert.equal(recordCompanionInviteFailure("client", now + 60_000).blocked, false);
  });
});

describe("desktop companion engine proxy", () => {
  it("proxies smoke telemetry capture routes", () => {
    assert.equal(shouldProxy("/smoke/telemetry"), true);
    assert.equal(shouldProxy("/smoke/telemetry/active"), true);
  });
});

describe("desktop companion launch tickets", () => {
  it("consumes launch tickets once and rejects them after expiry", () => {
    const now = 1_000;
    const ticket = createCompanionLaunchTicket(now);

    assert.equal(consumeCompanionLaunchTicket(ticket, now + 1), true);
    assert.equal(consumeCompanionLaunchTicket(ticket, now + 2), false);

    const expiredTicket = createCompanionLaunchTicket(now);
    assert.equal(consumeCompanionLaunchTicket(expiredTicket, now + 60_000), false);
  });
});

describe("desktop companion status page", () => {
  it("shows a small companion status page instead of the bundled web app", () => {
    const page = getCompanionStatusPage();

    assert.match(page, /Companion is running/);
    assert.doesNotMatch(page, /All Games|pixelated_engine_url/);
  });
});
