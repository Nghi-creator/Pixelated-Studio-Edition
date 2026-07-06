export function requireProfileCaptchaToken({
  captchaToken = "",
  isCaptchaEnabled = false,
}: {
  captchaToken?: string;
  isCaptchaEnabled?: boolean;
}) {
  if (!isCaptchaEnabled) return undefined;
  if (captchaToken) return captchaToken;

  throw new Error("Complete the verification challenge before continuing.");
}

export function buildPasswordReauthPayload({
  captchaToken,
  email,
  isCaptchaEnabled,
  password,
}: {
  captchaToken?: string;
  email: string;
  isCaptchaEnabled?: boolean;
  password: string;
}) {
  const verifiedCaptchaToken = requireProfileCaptchaToken({
    captchaToken,
    isCaptchaEnabled,
  });

  return {
    email,
    options: verifiedCaptchaToken
      ? {
          captchaToken: verifiedCaptchaToken,
        }
      : undefined,
    password,
  };
}
