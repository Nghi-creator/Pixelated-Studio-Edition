import crypto from "crypto";

type PlayerMode = "guest" | "host";

type SmokeTelemetrySnapshot = Record<string, unknown> & {
  playerMode: PlayerMode;
  sessionId: string;
};

type ActiveSmokeCapture = {
  captureTokenHash: string;
  expiresAt: number;
  runId: string;
  sessionId: string;
  telemetry: Partial<Record<PlayerMode, SmokeTelemetrySnapshot>>;
};

type SmokeTelemetryStoreOptions = {
  captureTtlMs?: number;
  now?: () => number;
};

const DEFAULT_CAPTURE_TTL_MS = 15 * 60_000;
const MAX_CAPTURE_TOKEN_LENGTH = 256;
const MAX_IDENTIFIER_LENGTH = 128;

export const isTelemetryRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const boundedString = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.slice(0, maxLength) : null;

const finiteNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function sanitizeSnapshot(
  snapshot: Record<string, unknown>,
  playerMode: PlayerMode,
  sessionId: string,
): SmokeTelemetrySnapshot {
  const telemetry = isTelemetryRecord(snapshot.telemetry)
    ? snapshot.telemetry
    : {};
  return {
    capturedAt: boundedString(snapshot.capturedAt, 64),
    gameId: boundedString(snapshot.gameId, MAX_IDENTIFIER_LENGTH),
    playerMode,
    sessionId,
    status: boundedString(snapshot.status, MAX_IDENTIFIER_LENGTH),
    telemetry: {
      bitrateKbps: finiteNumber(telemetry.bitrateKbps),
      connectionState: boundedString(telemetry.connectionState, 32),
      fps: finiteNumber(telemetry.fps),
      iceConnectionState: boundedString(telemetry.iceConnectionState, 32),
      jitterMs: finiteNumber(telemetry.jitterMs),
      lastEngineError: boundedString(telemetry.lastEngineError, 1_000),
      lastUpdatedAt: finiteNumber(telemetry.lastUpdatedAt),
      packetsLost: finiteNumber(telemetry.packetsLost),
    },
    userAgent: boundedString(snapshot.userAgent, 512),
  };
}

export function createSmokeTelemetryStore(
  getActiveSessionId: () => string | null,
  options: SmokeTelemetryStoreOptions = {},
) {
  let activeCapture: ActiveSmokeCapture | null = null;
  const captureTtlMs = options.captureTtlMs || DEFAULT_CAPTURE_TTL_MS;
  const now = options.now || Date.now;

  const getCurrentCapture = () => {
    if (activeCapture && activeCapture.expiresAt <= now()) activeCapture = null;
    return activeCapture;
  };

  const tokenMatches = (captureToken: string, expectedHash: string) => {
    if (!captureToken || captureToken.length > MAX_CAPTURE_TOKEN_LENGTH) {
      return false;
    }
    return crypto.timingSafeEqual(
      Buffer.from(hashToken(captureToken), "hex"),
      Buffer.from(expectedHash, "hex"),
    );
  };

  return {
    activate(captureToken: string, runId: string, sessionId: string) {
      if (
        captureToken.length < 32 ||
        captureToken.length > MAX_CAPTURE_TOKEN_LENGTH ||
        !runId ||
        runId.length > MAX_IDENTIFIER_LENGTH ||
        !sessionId ||
        sessionId.length > MAX_IDENTIFIER_LENGTH
      ) {
        return "invalid";
      }
      if (getActiveSessionId() !== sessionId) return "session-mismatch";

      activeCapture = {
        captureTokenHash: hashToken(captureToken),
        expiresAt: now() + captureTtlMs,
        runId,
        sessionId,
        telemetry: {},
      };
      return "activated";
    },
    deactivate(captureToken: string) {
      const capture = getCurrentCapture();
      if (!capture || !tokenMatches(captureToken, capture.captureTokenHash)) {
        return false;
      }
      activeCapture = null;
      return true;
    },
    getActive() {
      const capture = getCurrentCapture();
      return capture
        ? { active: true as const, runId: capture.runId, sessionId: capture.sessionId }
        : { active: false as const };
    },
    read(captureToken: string) {
      const capture = getCurrentCapture();
      if (!capture || !tokenMatches(captureToken, capture.captureTokenHash)) {
        return null;
      }
      return {
        guest: capture.telemetry.guest || null,
        host: capture.telemetry.host || null,
        runId: capture.runId,
        sessionId: capture.sessionId,
      };
    },
    submit(snapshot: Record<string, unknown>, accessScope?: string) {
      const capture = getCurrentCapture();
      if (!capture) return "inactive";
      const playerMode = snapshot.playerMode;
      if (
        (playerMode !== "host" && playerMode !== "guest") ||
        snapshot.sessionId !== capture.sessionId
      ) {
        return "session-mismatch";
      }
      if (
        (accessScope === "companion-host" && playerMode !== "host") ||
        (accessScope === "companion-guest" && playerMode !== "guest")
      ) {
        return "role-mismatch";
      }
      capture.telemetry[playerMode] = sanitizeSnapshot(
        snapshot,
        playerMode,
        capture.sessionId,
      );
      return "captured";
    },
  };
}
