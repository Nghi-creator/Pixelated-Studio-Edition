import assert from "node:assert/strict";
import test from "node:test";

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { location: { origin: "https://app.example.test" } },
});

const { getJoinInvite, getSessionFromInvite } = await import(
  "../../../src/features/multiplayer/inviteUtils.ts"
);

test("multiplayer invite parsing accepts play links and identifies companion URLs", () => {
  const companion = getJoinInvite(
    "https://192.168.1.20:8090/play/game-1?session=session-1",
  );
  assert.equal(companion?.isCompanion, true);
  assert.equal(companion?.target, "/play/game-1?session=session-1");
  assert.equal(getSessionFromInvite(companion?.url || ""), "session-1");

  assert.equal(getJoinInvite("https://example.test/profile"), null);
  assert.equal(getSessionFromInvite("not a url"), "");
});

