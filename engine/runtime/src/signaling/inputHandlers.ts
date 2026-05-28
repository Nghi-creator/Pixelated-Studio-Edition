import type { Socket } from "socket.io";
import { injectKey } from "../input/injectKey";
import { translateKey } from "../input/translateKey";

type InputPayload = {
  key?: unknown;
  sessionId?: unknown;
};

type RuntimeWithActiveSession = {
  getActiveSessionId(): string | null;
};

function shouldDropInputForSession(
  payload: InputPayload,
  runtime: RuntimeWithActiveSession,
) {
  return (
    typeof payload.sessionId === "string" &&
    payload.sessionId !== runtime.getActiveSessionId()
  );
}

function handleKeyAction(
  action: "keydown" | "keyup",
  payload: InputPayload,
  runtime: RuntimeWithActiveSession,
) {
  if (shouldDropInputForSession(payload, runtime)) {
    return;
  }

  const linuxKey = translateKey(payload.key);
  if (linuxKey) injectKey(action, linuxKey);
}

export function registerInputHandlers(
  socket: Socket,
  runtime: RuntimeWithActiveSession,
) {
  socket.on("keydown", (data: InputPayload = {}) => {
    handleKeyAction("keydown", data, runtime);
  });

  socket.on("keyup", (data: InputPayload = {}) => {
    handleKeyAction("keyup", data, runtime);
  });
}
