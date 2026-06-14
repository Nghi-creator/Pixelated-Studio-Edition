import type { Socket } from "socket.io-client";

type InputTargetLike = EventTarget & {
  closest?: (selector: string) => Element | null;
  isContentEditable?: boolean;
  tagName?: string;
};

function shouldIgnoreGameInput(event: KeyboardEvent) {
  if (event.defaultPrevented) return true;

  const target = event.target as InputTargetLike | null;
  if (!target || typeof target !== "object") return false;

  if (target.isContentEditable) return true;

  const tagName = target.tagName?.toUpperCase();
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    Boolean(target.closest?.("[data-ignore-game-input]"))
  );
}

export const attachEngineInput = (
  socket: Socket,
  sessionId: string,
  playerIndex = 1,
) => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (shouldIgnoreGameInput(event)) return;
    if (event.repeat) return;
    socket.emit("keydown", { sessionId, playerIndex, key: event.key });
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (shouldIgnoreGameInput(event)) return;
    socket.emit("keyup", { sessionId, playerIndex, key: event.key });
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  return () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
  };
};

export const __testing = {
  shouldIgnoreGameInput,
};
