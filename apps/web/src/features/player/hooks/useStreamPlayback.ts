import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { WebRTCStatus } from "../../../lib/webrtc/webrtcSession";

const BLACK_VIDEO_SAMPLE_THRESHOLD = 6;
const FALLBACK_BAD_SAMPLE_COUNT = 3;
const FALLBACK_HEALTHY_SAMPLE_COUNT = 4;

export function useStreamPlayback({
  isMuted,
  setIsMuted,
  status,
  stream,
  videoRef,
}: {
  isMuted: boolean;
  setIsMuted: (isMuted: boolean) => void;
  status: WebRTCStatus;
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const [fallbackActive, setFallbackActive] = useState(false);

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
      setFallbackActive(false);
      return;
    }

    let blackSamples = 0;
    let healthySamples = 0;
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (
        !video ||
        !context ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        blackSamples += 1;
        healthySamples = 0;
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
          if (average < BLACK_VIDEO_SAMPLE_THRESHOLD) {
            blackSamples += 1;
            healthySamples = 0;
          } else {
            blackSamples = 0;
            healthySamples += 1;
          }
        } catch {
          blackSamples += 1;
          healthySamples = 0;
        }
      }

      if (blackSamples >= FALLBACK_BAD_SAMPLE_COUNT) {
        setFallbackActive(true);
      } else if (healthySamples >= FALLBACK_HEALTHY_SAMPLE_COUNT) {
        setFallbackActive(false);
      }
    }, 750);

    return () => {
      window.clearInterval(interval);
      setFallbackActive(false);
    };
  }, [status, videoRef]);

  return fallbackActive;
}
