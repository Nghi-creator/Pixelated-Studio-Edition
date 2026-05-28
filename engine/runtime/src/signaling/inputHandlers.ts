import type { Socket } from "socket.io";
import { injectKey } from "../input/injectKey";
import { translateKey } from "../input/translateKey";

type InputPayload = {
  key?: unknown;
  playerIndex?: unknown;
  sessionId?: unknown;
};

type RuntimeWithActiveSession = {
  getActiveSessionId(): string | null;
};

type InputHandlerOptions = {
  canSendInput?: (
    socket: Socket,
    sessionId: string | null,
    playerIndex: number,
  ) => boolean;
  injectKey?: (action: "keydown" | "keyup", linuxKey: string) => void;
};

function normalizePlayerIndex(payload: InputPayload, socket: Socket) {
  const playerIndex = Number(payload.playerIndex);
  if (Number.isInteger(playerIndex) && playerIndex >= 1 && playerIndex <= 4) {
    return playerIndex;
  }

  return typeof socket.data.playerIndex === "number"
    ? socket.data.playerIndex
    : 1;
}

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
  socket: Socket,
  options: InputHandlerOptions,
) {
  if (shouldDropInputForSession(payload, runtime)) {
    return;
  }

  const sessionId =
    typeof payload.sessionId === "string"
      ? payload.sessionId
      : runtime.getActiveSessionId();
  const playerIndex = normalizePlayerIndex(payload, socket);

  if (
    options.canSendInput &&
    !options.canSendInput(socket, sessionId, playerIndex)
  ) {
    socket.emit("engine-error", {
      message: "Input is not allowed for this player slot.",
    });
    return;
  }

  if (playerIndex > 2) {
    socket.emit("engine-error", {
      message: "Keyboard input is only mapped for player slots 1 and 2.",
    });
    return;
  }

  const linuxKey = translateKey(payload.key, playerIndex);
  if (linuxKey) (options.injectKey || injectKey)(action, linuxKey);
}

export function registerInputHandlers(
  socket: Socket,
  runtime: RuntimeWithActiveSession,
  options: InputHandlerOptions = {},
) {
  socket.on("keydown", (data: InputPayload = {}) => {
    handleKeyAction("keydown", data, runtime, socket, options);
  });

  socket.on("keyup", (data: InputPayload = {}) => {
    handleKeyAction("keyup", data, runtime, socket, options);
  });
}
