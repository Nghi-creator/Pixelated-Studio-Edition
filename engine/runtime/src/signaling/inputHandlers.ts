import type { Socket } from "socket.io";

type InputPayload = {
  gameAction?: unknown;
  key?: unknown;
  playerIndex?: unknown;
  sessionId?: unknown;
};

type RuntimeWithActiveSession = {
  getActiveSessionId(): string | null;
  sendInput?: (
    action: "keydown" | "keyup",
    browserKey: unknown,
    playerIndex: number,
  ) => boolean;
};

type InputHandlerOptions = {
  canSendInput?: (
    socket: Socket,
    sessionId: string | null,
    playerIndex: number,
  ) => boolean;
  sendInput?: (
    action: "keydown" | "keyup",
    browserKey: unknown,
    playerIndex: number,
  ) => boolean;
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

  const didSendInput = (options.sendInput || runtime.sendInput)?.(
    action,
    payload.gameAction || payload.key,
    playerIndex,
  );

  if (didSendInput === false) {
    socket.emit("engine-error", {
      message:
        "Player slots 3 and 4 need virtual gamepad support. Start the engine with /dev/uinput available.",
    });
  }
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
