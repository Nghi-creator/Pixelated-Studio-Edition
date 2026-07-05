import fs from "node:fs";
import path from "node:path";
import { nowIso } from "./multiplayerSmokeHealth.mjs";

export function makeLogger(outDir, runId) {
  const runDir = path.join(outDir, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const eventsPath = path.join(runDir, "engine-health-events.ndjson");

  return {
    eventsPath,
    runDir,
    write(event, payload = {}) {
      const entry = {
        event,
        timestamp: nowIso(),
        ...payload,
      };
      fs.appendFileSync(eventsPath, `${JSON.stringify(entry)}\n`);
      return entry;
    },
  };
}

export function writeJsonArtifact(runDir, fileName, payload) {
  const artifactPath = path.join(runDir, fileName);
  fs.writeFileSync(artifactPath, `${JSON.stringify(payload, null, 2)}\n`);
  return artifactPath;
}

export function copyTextArtifact(runDir, fileName, sourcePath) {
  if (!sourcePath) return null;

  const artifactPath = path.join(runDir, fileName);
  fs.copyFileSync(sourcePath, artifactPath);
  return artifactPath;
}

export function writePlaceholderJson(runDir, fileName, description) {
  const artifactPath = path.join(runDir, fileName);
  const payload = {
    instructions: description,
    status: "paste-stream-telemetry-json-here",
  };
  fs.writeFileSync(artifactPath, `${JSON.stringify(payload, null, 2)}\n`);
  return artifactPath;
}

export function writeNotesTemplate({
  artifactPaths,
  baselinePeerCount,
  expectedSessionId,
  options,
  reportPath,
  runDir,
  runId,
  targetPeerCount,
}) {
  const notesPath = path.join(runDir, "manual-smoke-notes.md");
  const sessionLabel =
    expectedSessionId || "captured in engine-smoke-report.json after baseline";
  const peerTargetLabel =
    baselinePeerCount !== null &&
    baselinePeerCount !== undefined &&
    targetPeerCount !== null &&
    targetPeerCount !== undefined
      ? `${baselinePeerCount} -> ${targetPeerCount}`
      : "captured in engine-smoke-report.json after baseline";
  const lines = [
    "# LAN Multiplayer Smoke Notes",
    "",
    `Run ID: ${runId}`,
    `Started: ${nowIso()}`,
    `Engine URL: ${options.engineUrl}`,
    `Session ID: ${sessionLabel}`,
    `Expected guest peer delta: ${options.expectedGuests}`,
    `Peer count target: ${peerTargetLabel}`,
    `Report: ${reportPath}`,
    `Events: ${artifactPaths.eventsPath}`,
    "",
    "## Device Details",
    "",
    "- Date/time:",
    "- Host OS:",
    "- Guest device/browser:",
    "- Host LAN URL:",
    "- Companion URL:",
    "- ROM:",
    "",
    "## Pass/Fail",
    "",
    "- [ ] Browser accepted the HTTPS companion certificate.",
    "- [ ] Real guest browser stream reached LIVE STREAM ACTIVE.",
    "- [ ] P2 request/input/release worked.",
    "- [ ] P3/P4 state matched engine input mode.",
    "- [ ] Invite regenerate/revoke behavior checked.",
    "",
    "Automated checks are recorded in `engine-smoke-report.json`: companion preflight, invite redemption, spectator join, camera answer, peer-count transition, host session survival, disconnect cleanup, and host/guest telemetry capture.",
    "",
    "## Results",
    "",
    "- Host result:",
    "- Guest result:",
    "- Guest disconnect result:",
    "- P2 input result:",
    "- P3/P4 visible state:",
    "- Certificate UX notes:",
    "- Invite regenerate/revoke notes:",
    "- Overall: PASS / FAIL",
    "",
    "## Artifact Files",
    "",
    `- Engine report: ${reportPath}`,
    `- Engine poll log: ${artifactPaths.eventsPath}`,
    `- Host telemetry: ${artifactPaths.hostTelemetryPath}`,
    `- Guest telemetry: ${artifactPaths.guestTelemetryPath}`,
  ];

  fs.writeFileSync(notesPath, `${lines.join("\n")}\n`);
  return notesPath;
}


