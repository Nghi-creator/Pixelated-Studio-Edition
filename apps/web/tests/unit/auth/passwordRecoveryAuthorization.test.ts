import assert from "node:assert/strict";
import test from "node:test";
import { createPasswordRecoveryAuthorization } from "../../../src/lib/auth/passwordRecoveryAuthorization.ts";

const session = (accessToken: string) => ({ access_token: accessToken }) as never;

test("password recovery authorization only accepts the observed recovery session", () => {
  const authorization = createPasswordRecoveryAuthorization();

  assert.equal(authorization.observe("SIGNED_IN", session("normal"), 100), false);
  assert.equal(authorization.permits(session("normal"), 101), false);

  assert.equal(
    authorization.observe("PASSWORD_RECOVERY", session("recovery"), 200),
    true,
  );
  assert.equal(authorization.permits(session("other"), 201), false);
  assert.equal(authorization.permits(session("recovery"), 201), true);
});

test("password recovery authorization expires and clears on sign out", () => {
  const authorization = createPasswordRecoveryAuthorization();
  authorization.observe("PASSWORD_RECOVERY", session("recovery"), 0);
  assert.equal(authorization.permits(session("recovery"), 10 * 60 * 1000 + 1), false);

  authorization.observe("PASSWORD_RECOVERY", session("recovery"), 100);
  authorization.observe("SIGNED_OUT", null, 101);
  assert.equal(authorization.permits(session("recovery"), 102), false);
});
