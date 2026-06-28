import type { Socket } from "socket.io-client";

type InputTargetLike = EventTarget & {
  closest?: (selector: string) => Element | null;
  isContentEditable?: boolean;
  tagName?: string;
};

type IgnoreGameInputOptions = {
  respectDefaultPrevented?: boolean;
};

const keyToGameAction: Record<string, string> = {
  ArrowDown: "dpad_down",
  ArrowLeft: "dpad_left",
  ArrowRight: "dpad_right",
  ArrowUp: "dpad_up",
  Enter: "start",
  Shift: "select",
  " ": "select",
  a: "shoulder_left",
  A: "shoulder_left",
  s: "shoulder_right",
  S: "shoulder_right",
  x: "face_east",
  X: "face_east",
  z: "face_south",
  Z: "face_south",
};

const codeToGameAction: Record<string, string> = {
  ArrowDown: "dpad_down",
  ArrowLeft: "dpad_left",
  ArrowRight: "dpad_right",
  ArrowUp: "dpad_up",
  Enter: "start",
  KeyA: "shoulder_left",
  KeyS: "shoulder_right",
  KeyX: "face_east",
  KeyZ: "face_south",
  ShiftLeft: "select",
  ShiftRight: "select",
  Space: "select",
};

export function getGameActionForKey(key: string, code = "") {
  return keyToGameAction[key] || codeToGameAction[code] || "";
}

export function shouldIgnoreGameInput(
  event: KeyboardEvent,
  options: IgnoreGameInputOptions = {},
) {
  if (options.respectDefaultPrevented !== false && event.defaultPrevented) {
    return true;
  }

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
    if (shouldIgnoreGameInput(event, { respectDefaultPrevented: false })) return;
    if (event.repeat) return;
    const gameAction = getGameActionForKey(event.key, event.code);
    if (!gameAction) return;
    socket.emit("keydown", { sessionId, playerIndex, gameAction });
    event.preventDefault();
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (shouldIgnoreGameInput(event, { respectDefaultPrevented: false })) return;
    const gameAction = getGameActionForKey(event.key, event.code);
    if (!gameAction) return;
    socket.emit("keyup", { sessionId, playerIndex, gameAction });
    event.preventDefault();
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  return () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
  };
};

export const __testing = {
  getGameActionForKey,
  shouldIgnoreGameInput,
};
