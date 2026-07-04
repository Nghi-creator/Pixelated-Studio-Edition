import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { WebRTCStatus } from "../../../lib/webrtc/webrtcSession";
import {
  BLACK_VIDEO_SAMPLE_THRESHOLD,
  createStreamPlaybackSampleTracker,
} from "./streamPlaybackSamples";

export function useStreamPlayback({
  isMuted,
  onBlackFrameStall,
  onFirstVisibleFrame,
  setIsMuted,
  status,
  stream,
  videoRef,
}: {
  isMuted: boolean;
  onBlackFrameStall?: () => void;
  onFirstVisibleFrame?: () => void;
  setIsMuted: (isMuted: boolean) => void;
  status: WebRTCStatus;
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const [sampledFallbackActive, setSampledFallbackActive] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = stream;
    if (!stream) return;

    video.muted = isMuted;
    video.play().catch((err) => {
      console.warn("[WebRTC] Browser blocked stream playback:", err);
      if (!isMuted) {
        video.muted = true;
        setIsMuted(true);
        video.play().catch((retryErr) => {
          console.warn("[WebRTC] Muted stream playback retry failed:", retryErr);
        });
      }
    });
  }, [isMuted, setIsMuted, stream, videoRef]);

  useEffect(() => {
    if (status !== "playing") {
      return;
    }

    const tracker = createStreamPlaybackSampleTracker();
    let firstVisibleFrameReported = false;
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const recordSample = (isBlackSample: boolean) => {
      if (!isBlackSample && !firstVisibleFrameReported) {
        firstVisibleFrameReported = true;
        onFirstVisibleFrame?.();
      }
      const result = tracker.recordSample(isBlackSample);
      setSampledFallbackActive(result.fallbackActive);
      if (result.shouldReportStall) {
        onBlackFrameStall?.();
      }
    };

    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (
        !video ||
        !context ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        recordSample(true);
      } else {
        try {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          let total = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            total += pixels[index] + pixels[index + 1] + pixels[index + 2];
          }
          const average = total / (pixels.length / 4) / 3;
          recordSample(average < BLACK_VIDEO_SAMPLE_THRESHOLD);
        } catch {
          recordSample(true);
        }
      }
    }, 750);

    return () => {
      window.clearInterval(interval);
    };
  }, [onBlackFrameStall, onFirstVisibleFrame, status, videoRef]);

  return status === "playing" && sampledFallbackActive;
}
