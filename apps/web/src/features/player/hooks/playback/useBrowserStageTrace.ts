import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { WebRTCStatus } from "../../../../lib/webrtc/session/webrtcSession";
import { BrowserStageTraceRecording, attachBrowserStageTrace } from "../../observability/browserStageTrace";
import { parseBrowserStageTraceConfig } from "../../observability/browserStageTraceConfig";

export function useBrowserStageTrace(videoRef: RefObject<HTMLVideoElement | null>, stream: MediaStream | null, status: WebRTCStatus) {
  const [recording] = useState(() => {
    try {
      const config = parseBrowserStageTraceConfig(import.meta.env);
      return config ? new BrowserStageTraceRecording(config) : null;
    } catch {
      console.warn("[N4] Invalid browser trace configuration; tracing disabled");
      return null;
    }
  });
  useEffect(() => {
    const video = videoRef.current;
    if (!recording || !video || !stream || status !== "playing") return;
    return attachBrowserStageTrace(video, recording);
  }, [recording, status, stream, videoRef]);
  return recording;
}
