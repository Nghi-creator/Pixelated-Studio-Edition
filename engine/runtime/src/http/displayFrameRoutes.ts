import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { Express, Request, RequestHandler, Response } from "express";

type DisplayFrameRouteOptions = {
  requireEngineToken: RequestHandler;
};

export function createConcurrencyLimiter(maxConcurrent: number) {
  let active = 0;
  return {
    acquire() {
      if (active >= maxConcurrent) return false;
      active += 1;
      return true;
    },
    release() {
      active = Math.max(0, active - 1);
    },
  };
}

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
  const captures = createConcurrencyLimiter(2);
  app.get(
    "/display/frame",
    requireEngineToken,
    async (_req: Request, res: Response) => {
      if (!captures.acquire()) {
        res.setHeader("retry-after", "1");
        res.status(429).json({ error: "Display capture is busy" });
        return;
      }

      let captureDirectory = "";

      try {
        captureDirectory = await fs.promises.mkdtemp(
          path.join(os.tmpdir(), "pixelated-frame-"),
        );
        const outputPath = path.join(captureDirectory, "frame.png");
        await captureDisplayFrame(outputPath);
        const frame = await fs.promises.readFile(outputPath);
        res.setHeader("cache-control", "no-store");
        res.setHeader("content-type", "image/png");
        res.end(frame);
      } catch (err) {
        console.error("[Engine] Display frame capture failed:", err);
        res.status(503).json({ error: "Could not capture display" });
      } finally {
        captures.release();
        if (captureDirectory) {
          await fs.promises
            .rm(captureDirectory, { force: true, recursive: true })
            .catch(() => undefined);
        }
      }
    },
  );
}
