import {
  ENGINE_CONTROL_TOKEN_STORAGE_KEY,
  ENGINE_TOKEN_EXPIRES_AT_STORAGE_KEY,
  ENGINE_TOKEN_STORAGE_KEY,
} from "./engineStorageKeys.ts";

export type EngineConnectionStatus =
  | "unpaired"
  | "checking"
  | "online"
  | "offline"
  | "rejected";

export const ENGINE_CONNECTION_EVENT =
  "pixelated-engine-connection-status-changed";

function getInitialStatus(): EngineConnectionStatus {
  if (typeof window === "undefined") return "unpaired";
  const token = window.localStorage.getItem(ENGINE_TOKEN_STORAGE_KEY);
  if (!token) return "unpaired";

  const expiresAt = Number(
    window.localStorage.getItem(ENGINE_TOKEN_EXPIRES_AT_STORAGE_KEY),
  );
  if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= Date.now()) {
    window.localStorage.removeItem(ENGINE_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(ENGINE_CONTROL_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(ENGINE_TOKEN_EXPIRES_AT_STORAGE_KEY);
    return "rejected";
  }
  return "checking";
}

let engineConnectionStatus = getInitialStatus();

export function getEngineConnectionStatus() {
  return engineConnectionStatus;
}

export function setEngineConnectionStatus(status: EngineConnectionStatus) {
  if (engineConnectionStatus === status) return;
  engineConnectionStatus = status;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ENGINE_CONNECTION_EVENT));
  }
}

export function isEngineOnline(
  status: EngineConnectionStatus = engineConnectionStatus,
) {
  return status === "online";
}
