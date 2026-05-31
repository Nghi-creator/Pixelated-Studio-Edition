import type {
  ErrorRequestHandler,
  Express,
  NextFunction,
  Request,
  Response,
} from "express";

export function registerErrorHandlers(app: Express): void {
  const handler: ErrorRequestHandler = (
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    console.error("[HTTP] Unhandled engine route error:", err);
    res.status(500).json({ error: "Internal engine error" });
  };

  app.use(handler);
}
