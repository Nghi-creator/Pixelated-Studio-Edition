import { api } from "../api/apiClient";

export const STREAM_METRIC_SEND_INTERVAL_MS = 5_000;
export const CLIENT_HEARTBEAT_INTERVAL_MS = 20_000;
export const STREAM_BOOT_READY_TIMEOUT_MS = 45_000;
export const DISCONNECTED_GRACE_MS = 5_000;

export const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

export async function loadIceServers() {
  try {
    const { iceServers } = await api.iceServers();
    return iceServers.length ? iceServers : FALLBACK_ICE_SERVERS;
  } catch (err) {
    console.warn("[WebRTC] Falling back to default STUN config:", err);
    return FALLBACK_ICE_SERVERS;
  }
}
