import type { Express, Request, RequestHandler, Response } from "express";
import {
  createConcurrencyLimiter,
  createDisplayFrameCapture,
} from "../display/displayFrameCapture";

export { createConcurrencyLimiter };

type DisplayFrameRouteOptions = {
  requireEngineToken: RequestHandler;
};

export function registerDisplayFrameRoutes(
  app: Express,
  { requireEngineToken }: DisplayFrameRouteOptions,
) {
  const captureDisplayFrame = createDisplayFrameCapture();
  app.get(
    "/display/frame",
    requireEngineToken,
    async (_req: Request, res: Response) => {
      try {
        const result = await captureDisplayFrame();
        if (result.status === "busy") {
          res.setHeader("retry-after", "1");
          res.status(429).json({ error: "Display capture is busy" });
          return;
        }
        res.setHeader("cache-control", "no-store");
        res.setHeader("content-type", "image/png");
        res.end(result.frame);
      } catch (error) {
        console.error("[Engine] Display frame capture failed:", error);
        res.status(503).json({ error: "Could not capture display" });
      }
    },
  );
}
