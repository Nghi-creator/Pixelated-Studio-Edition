import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCompanionAccessToken } from "../../../main/companion/invite/inviteState";
import {
  canUseRuntimeSwitchToken,
  canProxyCompanionRequest,
  consumeCompanionRequestLimit,
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
  it("rate limits generic companion invite traffic per client", () => {
    const now = 1_000;

    assert.equal(
      consumeCompanionRequestLimit("preflight-client", now, 2).allowed,
      true,
    );
    assert.equal(
      consumeCompanionRequestLimit("preflight-client", now + 1, 2).allowed,
      true,
    );
    const blocked = consumeCompanionRequestLimit("preflight-client", now + 2, 2);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSeconds, 60);
    assert.equal(
      consumeCompanionRequestLimit("preflight-client", now + 60_000, 2).allowed,
      true,
    );
  });

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

  it("keeps LAN guest tokens away from host management routes", () => {
    assert.equal(canProxyCompanionRequest("/health", "guest"), true);
    assert.equal(canProxyCompanionRequest("/socket.io/?EIO=4", "guest"), true);
    assert.equal(canProxyCompanionRequest("/smoke/telemetry", "guest"), true);

    assert.equal(canProxyCompanionRequest("/clients", "guest"), false);
    assert.equal(canProxyCompanionRequest("/display/frame", "guest"), false);
    assert.equal(canProxyCompanionRequest("/local-games", "guest"), false);
    assert.equal(canProxyCompanionRequest("/session/stop-active", "guest"), false);
    assert.equal(canProxyCompanionRequest("/upload", "guest"), false);
  });

  it("allows host companion tokens and raw engine-token requests to manage routes", () => {
    assert.equal(canProxyCompanionRequest("/clients", "host"), true);
    assert.equal(canProxyCompanionRequest("/local-games/game.nes", "host"), true);
    assert.equal(canProxyCompanionRequest("/session/stop-active", null), true);
    assert.equal(canProxyCompanionRequest("/not-an-engine-route", "host"), false);
  });
});

describe("desktop companion runtime switching", () => {
  it("requires host access or the raw engine token", () => {
    const hostToken = createCompanionAccessToken(Date.now() + 60_000, "host");
    const guestToken = createCompanionAccessToken(Date.now() + 60_000, "guest");

    assert.equal(canUseRuntimeSwitchToken(hostToken, "engine-token"), true);
    assert.equal(canUseRuntimeSwitchToken("engine-token", "engine-token"), true);
    assert.equal(canUseRuntimeSwitchToken(guestToken, "engine-token"), false);
    assert.equal(canUseRuntimeSwitchToken("wrong-token", "engine-token"), false);
    assert.equal(canUseRuntimeSwitchToken("", "engine-token"), false);
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
