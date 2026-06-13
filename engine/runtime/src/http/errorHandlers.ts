import type {
  ErrorRequestHandler,
  Express,
  NextFunction,
  Request,
  Response,
} from "express";

export function getHttpErrorResponse(err: unknown) {
  if (
    err &&
    typeof err === "object" &&
    "statusCode" in err &&
    (err as { statusCode?: unknown }).statusCode === 403
  ) {
    return { body: { error: "Origin not allowed" }, status: 403 };
  }

  return { body: { error: "Internal engine error" }, status: 500 };
}

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

    const response = getHttpErrorResponse(err);
    if (response.status >= 500) {
      console.error("[HTTP] Unhandled engine route error:", err);
    }
    res.status(response.status).json(response.body);
  };

  app.use(handler);
}
