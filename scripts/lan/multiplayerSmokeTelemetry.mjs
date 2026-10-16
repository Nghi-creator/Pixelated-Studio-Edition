import { requestJson, printCheck, sleep } from "./multiplayerSmokeHealth.mjs";
import { writeJsonArtifact } from "./multiplayerSmokeArtifacts.mjs";
export async function activateTelemetryCapture(engineUrl, engineToken, captureToken, runId, sessionId) {
  await requestJson(engineUrl, "/smoke/telemetry/active", {
    body: JSON.stringify({ captureToken, runId, sessionId }),
    headers: {
      "Content-Type": "application/json",
      "X-Engine-Token": engineToken,
    },
    method: "PUT",
  });
}
async function fetchTelemetryCapture(engineUrl, captureToken) {
  return requestJson(engineUrl, "/smoke/telemetry", {
    headers: { "X-Smoke-Capture-Token": captureToken },
  });
}
export async function deactivateTelemetryCapture(engineUrl, captureToken) {
  const response = await fetch(`${engineUrl}/smoke/telemetry/active`, {
    signal: AbortSignal.timeout(20000),
    headers: { "X-Smoke-Capture-Token": captureToken },
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`DELETE /smoke/telemetry/active returned ${response.status}`);
  }
}
export async function captureBrowserTelemetry({ artifactPaths, captureToken, engineUrl, expectedSessionId, log, pollMs, timeoutMs, }) {
  printCheck("WAIT", "Captured host/guest telemetry", "open Stream Stats on both browsers and press Copy Stats");
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const capture = await fetchTelemetryCapture(engineUrl, captureToken);
    const hostCaptured = Boolean(capture?.host);
    const guestCaptured = Boolean(capture?.guest);
    log.write("telemetry-poll", { guestCaptured, hostCaptured });
    if (hostCaptured && guestCaptured) {
      validateCapturedTelemetry(capture, expectedSessionId);
      writeJsonArtifact(artifactPaths.runDir, "host-stream-telemetry.json", capture.host);
      writeJsonArtifact(artifactPaths.runDir, "guest-stream-telemetry.json", capture.guest);
      log.write("telemetry-captured", {
        guestTelemetryPath: artifactPaths.guestTelemetryPath,
        hostTelemetryPath: artifactPaths.hostTelemetryPath,
      });
      printCheck("PASS", "Captured host/guest telemetry");
      return;
    }
    await sleep(pollMs);
  }
  throw new Error("Timed out waiting for host and guest Stream Stats. Open Stream Stats on both devices and press Copy Stats while the run is active.");
}
export function validateCapturedTelemetry(capture, expectedSessionId) {
  for (const playerMode of ["host", "guest"]) {
    const snapshot = capture?.[playerMode];
    const telemetry = snapshot?.telemetry || {};
    if (snapshot?.playerMode !== playerMode) {
      throw new Error(`Captured ${playerMode} telemetry is identified as ${snapshot?.playerMode || "unknown"}.`);
    }
    if (snapshot?.sessionId !== expectedSessionId) {
      throw new Error(`Captured ${playerMode} telemetry belongs to ${snapshot?.sessionId || "unknown"}, expected ${expectedSessionId}.`);
    }
    if (telemetry.connectionState !== "connected" ||
      !["connected", "completed"].includes(telemetry.iceConnectionState) ||
      telemetry.lastEngineError) {
      throw new Error(`Captured ${playerMode} telemetry is unhealthy: ${JSON.stringify({
        connectionState: telemetry.connectionState || null,
        iceConnectionState: telemetry.iceConnectionState || null,
        lastEngineError: telemetry.lastEngineError || null,
      })}`);
    }
  }
}
