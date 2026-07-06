import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPasswordReauthPayload,
  requireProfileCaptchaToken,
} from "../../../src/features/profile/profileAuthCaptcha.ts";

test("profile password re-auth omits captcha options when captcha is disabled", () => {
  assert.deepEqual(
    buildPasswordReauthPayload({
      email: "User@Example.com",
      isCaptchaEnabled: false,
      password: "current-password",
    }),
    {
      email: "User@Example.com",
      options: undefined,
      password: "current-password",
    },
  );
});

test("profile password re-auth includes captcha token when captcha is enabled", () => {
  assert.deepEqual(
    buildPasswordReauthPayload({
      captchaToken: "turnstile-token",
      email: "user@example.com",
      isCaptchaEnabled: true,
      password: "current-password",
    }),
    {
      email: "user@example.com",
      options: {
        captchaToken: "turnstile-token",
      },
      password: "current-password",
    },
  );
});

test("profile password re-auth requires captcha token when captcha is enabled", () => {
  assert.throws(
    () =>
      requireProfileCaptchaToken({
        captchaToken: "",
        isCaptchaEnabled: true,
      }),
    /Complete the verification challenge/,
  );
});
