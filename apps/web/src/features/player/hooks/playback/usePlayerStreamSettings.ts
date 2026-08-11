import { useEffect, useState } from "react";
import {
  getStreamProfile,
  STREAM_PROFILE_STORAGE_KEY,
  type StreamProfileId,
} from "../../../../lib/engine/streamProfiles";

const STREAM_TELEMETRY_VISIBILITY_KEY = "pixelated_show_stream_telemetry";

export function usePlayerStreamSettings(
  initial?: {
    isMuted?: boolean;
    persistStreamProfile?: boolean;
    streamProfileId?: StreamProfileId;
    volume?: number;
  },
) {
  const [isMuted, setIsMuted] = useState(initial?.isMuted ?? false);
  const [volume, setVolume] = useState(initial?.volume ?? 1);
  const [streamProfileId, setStreamProfileId] = useState<StreamProfileId>(() => {
    if (initial?.streamProfileId) return initial.streamProfileId;
    if (typeof window === "undefined") return "balanced";
    return getStreamProfile(
      window.localStorage.getItem(STREAM_PROFILE_STORAGE_KEY),
    ).id;
  });
  const [showStreamTelemetry, setShowStreamTelemetry] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STREAM_TELEMETRY_VISIBILITY_KEY) === "1";
  });

  useEffect(() => {
    window.localStorage.setItem(
      STREAM_TELEMETRY_VISIBILITY_KEY,
      showStreamTelemetry ? "1" : "0",
    );
  }, [showStreamTelemetry]);

  useEffect(() => {
    if (initial?.persistStreamProfile === false) return;
    window.localStorage.setItem(STREAM_PROFILE_STORAGE_KEY, streamProfileId);
  }, [initial?.persistStreamProfile, streamProfileId]);

  return {
    isMuted,
    setIsMuted,
    setShowStreamTelemetry,
    setStreamProfileId,
    showStreamTelemetry,
    streamProfile: getStreamProfile(streamProfileId),
    streamProfileId,
    setVolume,
    volume,
  };
}
