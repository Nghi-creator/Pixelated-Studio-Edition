import type { Express, RequestHandler } from "express";

type SessionControlRouteOptions = {
  cleanupActiveSession: (sessionId?: string | null) => void;
  getActiveSessionId: () => string | null;
  requireEngineToken: RequestHandler;
};

export function registerSessionControlRoutes(
  app: Express,
  {
    cleanupActiveSession,
    getActiveSessionId,
    requireEngineToken,
  }: SessionControlRouteOptions,
) {
  app.post("/session/stop-active", requireEngineToken, (_req, res) => {
    const activeSessionId = getActiveSessionId();
    if (!activeSessionId) {
      res.status(200).json({ stopped: false });
      return;
    }

    cleanupActiveSession(activeSessionId);
    res.status(200).json({ sessionId: activeSessionId, stopped: true });
  });
}
