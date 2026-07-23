import {
  authCaptchaSiteKey,
  isAuthCaptchaEnabled,
} from "../../features/auth/captchaConfig";

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_TIMEOUT_MS = 2 * 60 * 1000;

type TurnstileRenderOptions = {
  action: string;
  appearance: "interaction-only";
  callback: (token: string) => void;
  "error-callback": (errorCode?: string) => void;
  "expired-callback": () => void;
  language: "auto";
  sitekey: string;
  theme: "dark";
  "timeout-callback": () => void;
};

export type TurnstileGlobal = {
  render: (
    container: HTMLElement,
    options: TurnstileRenderOptions,
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileGlobal;
  }
}

let scriptPromise: Promise<TurnstileGlobal> | null = null;
let challengePromise: Promise<string | undefined> | null = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TurnstileGlobal>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_SRC}"]`,
    );
    const script = existingScript || document.createElement("script");

    const cleanup = () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
    const handleLoad = () => {
      cleanup();
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        scriptPromise = null;
        reject(new Error("Human verification loaded without its browser API."));
      }
    };
    const handleError = () => {
      cleanup();
      scriptPromise = null;
      reject(new Error("Human verification could not be loaded. Check your connection and try again."));
    };

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);
    if (!existingScript) {
      script.async = true;
      script.defer = true;
      script.src = TURNSTILE_SCRIPT_SRC;
      document.head.appendChild(script);
    }
  });

  return scriptPromise;
}

async function runTurnstileChallenge() {
  if (!isAuthCaptchaEnabled) return undefined;

  const turnstile = await loadTurnstile();
  return new Promise<string>((resolve, reject) => {
    const host = document.createElement("div");
    host.setAttribute("aria-label", "Human verification");
    Object.assign(host.style, {
      alignItems: "center",
      display: "flex",
      inset: "0",
      justifyContent: "center",
      pointerEvents: "none",
      position: "fixed",
      zIndex: "2147483647",
    });

    const container = document.createElement("div");
    container.style.pointerEvents = "auto";
    host.appendChild(container);
    document.body.appendChild(host);

    let widgetId: string | null = null;
    let settled = false;
    const finish = (error?: Error, token?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (widgetId) turnstile.remove(widgetId);
      host.remove();
      if (error) reject(error);
      else resolve(token || "");
    };
    const timeoutId = window.setTimeout(
      () => finish(new Error("Human verification timed out. Try Play again.")),
      TURNSTILE_TIMEOUT_MS,
    );

    widgetId = turnstile.render(container, {
      action: "anonymous_play",
      appearance: "interaction-only",
      callback: (token) => finish(undefined, token),
      "error-callback": () =>
        finish(new Error("Human verification failed. Try Play again.")),
      "expired-callback": () =>
        finish(new Error("Human verification expired. Try Play again.")),
      language: "auto",
      sitekey: authCaptchaSiteKey,
      theme: "dark",
      "timeout-callback": () =>
        finish(new Error("Human verification timed out. Try Play again.")),
    });
  });
}

export function requestAnonymousSignupCaptchaToken() {
  if (!challengePromise) {
    challengePromise = runTurnstileChallenge().finally(() => {
      challengePromise = null;
    });
  }
  return challengePromise;
}
