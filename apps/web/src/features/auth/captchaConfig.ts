export const authCaptchaSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
export const isAuthCaptchaEnabled = Boolean(authCaptchaSiteKey);
