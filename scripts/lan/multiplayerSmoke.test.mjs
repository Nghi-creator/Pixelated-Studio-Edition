import assert from "node:assert/strict";
import test from "node:test";
import {
  isHttpsCompanion,
  makeSyntheticOffer,
  normalizeInviteCode,
  parseArgs,
  preflightCompanion,
  redeemCompanionInvite,
  validateCapturedTelemetry,
} from "./multiplayerSmoke.mjs";

test("parses companion invite smoke options", () => {
  const options = parseArgs([
    "--engine-url",
    "https://192.168.1.20:8090/",
    "--invite-code",
    "ab12-cd34",
    "--expected-guests",
    "2",
  ]);

  assert.equal(options.engineUrl, "https://192.168.1.20:8090");
  assert.equal(options.inviteCode, "ab12-cd34");
  assert.equal(options.expectedGuests, 2);
  assert.equal(isHttpsCompanion(options.engineUrl), true);
  assert.equal(normalizeInviteCode(options.inviteCode), "AB12CD34");
});

test("validates companion preflight and redeem flow", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (url === "https://companion.test/invite/preflight") {
      return Response.json({
          certificate: { status: "accepted" },
          engine: { status: "available" },
          invite: { status: "active" },
          ready: true,
      });
    }
    if (
      url === "https://companion.test/invite/redeem" &&
      options.method === "POST"
    ) {
      return Response.json({ companionToken: "guest-token" });
    }
    return Response.json({ error: "not found" }, { status: 404 });
  };

  try {
    assert.equal((await preflightCompanion("https://companion.test")).ready, true);
    assert.equal(
      (
        await redeemCompanionInvite(
          "https://companion.test",
          "ab12-cd34",
        )
      ).companionToken,
      "guest-token",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("builds a peer-targeted recv-only WebRTC offer", () => {
  const offer = makeSyntheticOffer("peer-1");
  assert.equal(offer.peerId, "peer-1");
  assert.equal(offer.type, "offer");
  assert.match(offer.sdp, /m=video/);
  assert.match(offer.sdp, /m=audio/);
  assert.match(offer.sdp, /a=recvonly/);
});

test("requires healthy host and guest telemetry for the active session", () => {
  const capture = {
    guest: {
      playerMode: "guest",
      sessionId: "session-1",
      telemetry: {
        connectionState: "connected",
        iceConnectionState: "completed",
        lastEngineError: null,
      },
    },
    host: {
      playerMode: "host",
      sessionId: "session-1",
      telemetry: {
        connectionState: "connected",
        iceConnectionState: "connected",
        lastEngineError: null,
      },
    },
  };

  assert.doesNotThrow(() => validateCapturedTelemetry(capture, "session-1"));
  assert.throws(
    () =>
      validateCapturedTelemetry(
        {
          ...capture,
          guest: {
            ...capture.guest,
            telemetry: {
              ...capture.guest.telemetry,
              connectionState: "failed",
            },
          },
        },
        "session-1",
      ),
    /guest telemetry is unhealthy/,
  );
});
