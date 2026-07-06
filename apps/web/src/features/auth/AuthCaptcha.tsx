import { useEffect, useRef, useState } from "react";
import { authCaptchaSiteKey, isAuthCaptchaEnabled } from "./captchaConfig";

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

type TurnstileGlobal = {
  render: (
    container: HTMLElement,
    options: {
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      sitekey: string;
      theme: "dark";
    },
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileGlobal;
  }
}

type AuthCaptchaProps = {
  onTokenChange: (token: string) => void;
  resetKey: number;
};

export function AuthCaptcha({ onTokenChange, resetKey }: AuthCaptchaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(
    typeof window !== "undefined" && Boolean(window.turnstile),
  );

  useEffect(() => {
    if (!isAuthCaptchaEnabled || scriptReady) return;

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_SRC}"]`,
    );
    const script = existingScript || document.createElement("script");

    const handleLoad = () => setScriptReady(true);
    script.addEventListener("load", handleLoad);

    if (!existingScript) {
      script.async = true;
      script.defer = true;
      script.src = TURNSTILE_SCRIPT_SRC;
      document.head.appendChild(script);
    }

    return () => script.removeEventListener("load", handleLoad);
  }, [scriptReady]);

  useEffect(() => {
    if (!isAuthCaptchaEnabled || !scriptReady || !containerRef.current) return;
    if (widgetIdRef.current || !window.turnstile) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      callback: onTokenChange,
      "error-callback": () => onTokenChange(""),
      "expired-callback": () => onTokenChange(""),
      sitekey: authCaptchaSiteKey,
      theme: "dark",
    });

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [onTokenChange, scriptReady]);

  useEffect(() => {
    if (!widgetIdRef.current || !window.turnstile) return;

    window.turnstile.reset(widgetIdRef.current);
    onTokenChange("");
  }, [onTokenChange, resetKey]);

  if (!isAuthCaptchaEnabled) return null;

  return (
    <div className="flex justify-center">
      <div ref={containerRef} />
    </div>
  );
}
