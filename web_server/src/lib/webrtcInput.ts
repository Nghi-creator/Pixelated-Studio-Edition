import type { Socket } from "socket.io-client";

export const attachEngineInput = (socket: Socket, sessionId: string) => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return;
    socket.emit("keydown", { sessionId, key: event.key });
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    socket.emit("keyup", { sessionId, key: event.key });
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  return () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
  };
};
