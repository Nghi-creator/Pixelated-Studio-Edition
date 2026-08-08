import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

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

function captureDisplayFrameFile(outputPath: string) {
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
      (error) => (error ? reject(error) : resolve()),
    );
    child.on("error", reject);
  });
}

export function createDisplayFrameCapture(maxConcurrent = 2) {
  const captures = createConcurrencyLimiter(maxConcurrent);
  return async function captureDisplayFrame() {
    if (!captures.acquire()) return { status: "busy" } as const;

    let captureDirectory = "";
    try {
      captureDirectory = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "pixelated-frame-"),
      );
      const outputPath = path.join(captureDirectory, "frame.png");
      await captureDisplayFrameFile(outputPath);
      return {
        frame: await fs.promises.readFile(outputPath),
        status: "captured",
      } as const;
    } finally {
      captures.release();
      if (captureDirectory) {
        await fs.promises
          .rm(captureDirectory, { force: true, recursive: true })
          .catch(() => undefined);
      }
    }
  };
}
