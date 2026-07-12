import { useEffect, useRef } from "react";
import { engineAuthHeaders } from "../../../lib/engine/engineAuth";
import { engineEndpoint } from "../../../lib/engine/engineConfig";
import { engineFetch } from "../../../lib/engine/engineRequest";

type FallbackFrameCanvasProps = {
  active: boolean;
};

const MIN_FRAME_DELAY_MS = 300;
const MAX_FRAME_DELAY_MS = 1500;
const START_FRAME_DELAY_MS = 500;

export function FallbackFrameCanvas({ active }: FallbackFrameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;

    let disposed = false;
    let delayMs = START_FRAME_DELAY_MS;
    let timeoutId: number | null = null;
    const abortController = new AbortController();

    const drawBlob = async (blob: Blob) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;

      const bitmap = await createImageBitmap(blob);
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
    };

    const scheduleNextFrame = () => {
      if (disposed) return;
      timeoutId = window.setTimeout(fetchAndDrawFrame, delayMs);
    };

    const fetchAndDrawFrame = async () => {
      try {
        const response = await engineFetch(engineEndpoint("/display/frame"), {
          cache: "no-store",
          headers: engineAuthHeaders(),
          signal: abortController.signal,
        }, 3_000);
        if (!response.ok || disposed) {
          delayMs = Math.min(MAX_FRAME_DELAY_MS, delayMs + 250);
          scheduleNextFrame();
          return;
        }

        await drawBlob(await response.blob());
        delayMs = Math.max(MIN_FRAME_DELAY_MS, delayMs - 50);
      } catch (err) {
        if (!disposed && !(err instanceof DOMException && err.name === "AbortError")) {
          console.warn("[WebRTC] Display fallback frame failed:", err);
        }
        delayMs = Math.min(MAX_FRAME_DELAY_MS, delayMs + 250);
      } finally {
        scheduleNextFrame();
      }
    };

    void fetchAndDrawFrame();

    return () => {
      disposed = true;
      abortController.abort();
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-contain"
      ref={canvasRef}
    />
  );
}
