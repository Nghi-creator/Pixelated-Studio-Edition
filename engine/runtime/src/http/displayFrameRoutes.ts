import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { Express, Request, RequestHandler, Response } from "express";

type DisplayFrameRouteOptions = {
  requireEngineToken: RequestHandler;
};

function captureDisplayFrame(outputPath: string) {
  return new Promise<void>((resolve, reject) => {
    const child = execFile(
      "gst-launch-1.0",
      [
        "-q",
        "ximagesrc",
        "display-name=:99",
        "num-buffers=1",
        "use-damage=0",
        "show-pointer=false",
        "!",
        "videoconvert",
        "!",
        "pngenc",
        "!",
        "filesink",
        `location=${outputPath}`,
      ],
      { timeout: 2500 },
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      },
    );

    child.on("error", reject);
  });
}

export function registerDisplayFrameRoutes(
  app: Express,
  { requireEngineToken }: DisplayFrameRouteOptions,
) {
  app.get(
    "/display/frame",
    requireEngineToken,
    async (_req: Request, res: Response) => {
      const outputPath = path.join(
        os.tmpdir(),
        `pixelated-frame-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.png`,
      );

      try {
        await captureDisplayFrame(outputPath);
        const frame = await fs.promises.readFile(outputPath);
        res.setHeader("cache-control", "no-store");
        res.setHeader("content-type", "image/png");
        res.end(frame);
      } catch (err) {
        res.status(503).json({
          error:
            err instanceof Error ? err.message : "Could not capture display",
        });
      } finally {
        fs.promises.unlink(outputPath).catch(() => undefined);
      }
    },
  );
}
