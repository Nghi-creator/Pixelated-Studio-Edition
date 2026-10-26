/** Keep a failed peer from failing other viewers or a replacement session. */
export function bindWebRTCEngineErrors({ socket, peerId, isDisposed, failStream, report, clearRejectedToken }: {
  socket: { on(event: "engine-error", listener: (payload: unknown) => void): unknown };
  peerId: string;
  isDisposed: () => boolean;
  failStream: (message: string) => void;
  report: (details: { code: string | null; message: string | null; source: string }) => void;
  clearRejectedToken: () => void;
}) {
  socket.on("engine-error", (payload) => {
    if (isDisposed() || !payload || typeof payload !== "object" || Array.isArray(payload)) return;
    const error = payload as { peerId?: unknown; code?: unknown; message?: unknown };
    if ("peerId" in error && error.peerId !== peerId) return;
    const code = typeof error.code === "string" ? error.code : null;
    const message = typeof error.message === "string" ? error.message : null;
    console.error("[WebRTC] Engine error:", message);
    report({ code, message, source: "engine-error" });
    if (code === "engine_access_revoked") clearRejectedToken();
    failStream(message || "Engine error");
  });
}
