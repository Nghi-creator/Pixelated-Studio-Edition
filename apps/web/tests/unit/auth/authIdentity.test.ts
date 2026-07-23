import assert from "node:assert/strict";
import test from "node:test";
import {
  isAnonymousUser,
  isPermanentUser,
} from "../../../src/lib/auth/authIdentity.ts";

test("anonymous identities stay separate from permanent signed-in users", () => {
  assert.equal(isAnonymousUser({ is_anonymous: true } as never), true);
  assert.equal(isPermanentUser({ is_anonymous: true } as never), false);
  assert.equal(isPermanentUser({ is_anonymous: false } as never), true);
  assert.equal(isPermanentUser(null), false);
});
