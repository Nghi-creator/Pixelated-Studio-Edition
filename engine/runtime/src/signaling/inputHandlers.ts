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
  inputLimitPerSecond?: number;
  now?: () => number;
};

const DEFAULT_INPUT_LIMIT_PER_SECOND = 60;

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
  const inputLimit = options.inputLimitPerSecond || DEFAULT_INPUT_LIMIT_PER_SECOND;
  const now = options.now || Date.now;
  let inputCount = 0;
  let inputWindowStartedAt = now();
  let rateLimitWarningSent = false;

  const consumeInputBudget = () => {
    const currentTime = now();
    if (currentTime - inputWindowStartedAt >= 1_000) {
      inputCount = 0;
      inputWindowStartedAt = currentTime;
      rateLimitWarningSent = false;
    }

    inputCount += 1;
    if (inputCount <= inputLimit) return true;
    if (!rateLimitWarningSent) {
      rateLimitWarningSent = true;
      socket.emit("engine-error", {
        code: "engine_input_rate_limited",
        message: "Input rate limit reached.",
      });
    }
    return false;
  };

  socket.on("keydown", (data: InputPayload = {}) => {
    if (!consumeInputBudget()) return;
    handleKeyAction("keydown", data, runtime, socket, options);
  });

  socket.on("keyup", (data: InputPayload = {}) => {
    if (!consumeInputBudget()) return;
    handleKeyAction("keyup", data, runtime, socket, options);
  });
}
