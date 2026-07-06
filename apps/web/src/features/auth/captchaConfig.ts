const viteEnv = import.meta.env as
  | { VITE_TURNSTILE_SITE_KEY?: string }
  | undefined;

export const authCaptchaSiteKey = viteEnv?.VITE_TURNSTILE_SITE_KEY || "";
export const isAuthCaptchaEnabled = Boolean(authCaptchaSiteKey);
