import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEngineTokenAuth } from "../../src/signaling/socketAuth";

describe("engine token authentication", () => {
  it("rejects production requests when the configured engine token is missing", () => {
    const auth = createEngineTokenAuth("");

    assert.equal(auth.isValidEngineToken(undefined), false);
    assert.equal(auth.isValidEngineToken(""), false);
    assert.equal(auth.isValidEngineToken("anything"), false);
  });

  it("allows missing tokens only when explicitly enabled for tests", () => {
    const auth = createEngineTokenAuth("", { allowMissingToken: true });

    assert.equal(auth.isValidEngineToken(undefined), true);
    assert.equal(auth.isValidEngineToken("anything"), true);
  });

  it("compares configured tokens exactly", () => {
    const auth = createEngineTokenAuth("expected-token");

    assert.equal(auth.isValidEngineToken("expected-token"), true);
    assert.equal(auth.isValidEngineToken("wrong-token"), false);
    assert.equal(auth.isValidEngineToken("expected-token "), false);
  });
});
