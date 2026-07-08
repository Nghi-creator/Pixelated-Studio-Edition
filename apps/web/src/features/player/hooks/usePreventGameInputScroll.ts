import { useEffect } from "react";
import { shouldIgnoreGameInput } from "../../../lib/webrtc/webrtcInput";

export function usePreventGameInputScroll() {
  useEffect(() => {
    const gameKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "];

    const preventScroll = (event: KeyboardEvent) => {
      if (!shouldIgnoreGameInput(event) && gameKeys.includes(event.key)) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", preventScroll, {
      passive: false,
      capture: true,
    });

    return () =>
      window.removeEventListener("keydown", preventScroll, { capture: true });
  }, []);
}
