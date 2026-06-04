#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_ENGINE_URL = "http://127.0.0.1:8080";
const DEFAULT_OUT_DIR = ".context/smoke-artifacts";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_MS = 2_000;

let activeRun = null;

function printUsage() {
  console.log(`Usage:
  node scripts/multiplayerSmoke.mjs [options]

Options:
  --engine-url <url>        Engine or HTTPS companion origin. Default: ${DEFAULT_ENGINE_URL}
  --expected-guests <n>     Number of new camera peers to wait for. Default: 1
  --session-id <id>         Require this active engine session id.
  --timeout-ms <ms>         Wait timeout for join/disconnect phases. Default: ${DEFAULT_TIMEOUT_MS}
  --poll-ms <ms>            Health poll interval. Default: ${DEFAULT_POLL_MS}
  --out-dir <path>          Artifact directory. Default: ${DEFAULT_OUT_DIR}
  --label <name>            Artifact label. Default: lan-multiplayer-smoke
  --notes <path>            Copy completed manual notes into the bundle.
  --host-telemetry <path>   Copy host stream telemetry JSON into the bundle.
  --guest-telemetry <path>  Copy guest stream telemetry JSON into the bundle.
  --allow-self-signed       Allow self-signed HTTPS companion certificates.
  --skip-disconnect         Do not wait for guest peer cleanup after join validation.
  --help                    Show this help.

Flow:
  1. Start the host game and wait for the host stream to play.
  2. Run this script before guests open the LAN join page.
  3. Have guests join as spectators or players.
  4. If disconnect validation is enabled, close guest tabs after join passes.

Reports include camera peer counts, session survival checks, input mode, engine
process CPU/RSS snapshots from /health, copied host/guest telemetry, and a
manual pass/fail notes template.
`);
}

function parseArgs(argv) {
  const options = {
    engineUrl: DEFAULT_ENGINE_URL,
    expectedGuests: 1,
    label: "lan-multiplayer-smoke",
    guestTelemetryPath: null,
    hostTelemetryPath: null,
    notesPath: null,
    outDir: DEFAULT_OUT_DIR,
    pollMs: DEFAULT_POLL_MS,
    allowSelfSigned: false,
    sessionId: null,
    skipDisconnect: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    if (arg === "--help") {
      printUsage();
      process.exit(0);
    } else if (arg === "--engine-url") {
      options.engineUrl = next();
    } else if (arg === "--expected-guests") {
      options.expectedGuests = Number(next());
    } else if (arg === "--session-id") {
      options.sessionId = next();
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(next());
    } else if (arg === "--poll-ms") {
      options.pollMs = Number(next());
    } else if (arg === "--out-dir") {
      options.outDir = next();
    } else if (arg === "--label") {
      options.label = next();
    } else if (arg === "--notes") {
      options.notesPath = next();
    } else if (arg === "--host-telemetry") {
      options.hostTelemetryPath = next();
    } else if (arg === "--guest-telemetry") {
      options.guestTelemetryPath = next();
    } else if (arg === "--allow-self-signed") {
      options.allowSelfSigned = true;
    } else if (arg === "--skip-disconnect") {
      options.skipDisconnect = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isInteger(options.expectedGuests) || options.expectedGuests < 1) {
    throw new Error("--expected-guests must be a positive integer.");
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number.");
  }

  if (!Number.isFinite(options.pollMs) || options.pollMs <= 0) {
    throw new Error("--poll-ms must be a positive number.");
  }

  options.engineUrl = options.engineUrl.replace(/\/+$/, "");
  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function getHealthUrl(engineUrl) {
  return `${engineUrl}/health`;
}

function getRuntimeActiveSessionId(health) {
  return health?.checks?.runtime?.activeSessionId || null;
}

function getCameraPeerState(health) {
  const peers = health?.checks?.resources?.cameraPeers || {};
  const peerIds = Array.isArray(peers.peerIds)
    ? peers.peerIds.filter((peerId) => typeof peerId === "string")
    : [];

  return {
    peerCount: Number(peers.peerCount) || 0,
    peerIds,
    sessionId: typeof peers.sessionId === "string" ? peers.sessionId : null,
  };
}

function getInputMode(health) {
  const bridge = health?.checks?.gamepadBridge || {};
  const hasVirtualGamepads =
    bridge.fileExists === true &&
    bridge.uinputAvailable === true &&
    bridge.failed !== true;

  return {
    bridgeFailed: bridge.failed === true,
    bridgeFileExists: bridge.fileExists === true,
    mode: hasVirtualGamepads ? "virtual-gamepads" : "keyboard-fallback",
    supportedPlayers: hasVirtualGamepads ? 4 : 2,
    uinputAvailable: bridge.uinputAvailable === true,
  };
}

function summarizeProcess(processSnapshot) {
  if (!processSnapshot || typeof processSnapshot !== "object") {
    return null;
  }

  return {
    averageCpuPercent:
      typeof processSnapshot.averageCpuPercent === "number"
        ? processSnapshot.averageCpuPercent
        : null,
    pid: typeof processSnapshot.pid === "number" ? processSnapshot.pid : null,
    rssMb:
      typeof processSnapshot.rssMb === "number" ? processSnapshot.rssMb : null,
  };
}

function getResourceSnapshot(health) {
  const resources = health?.checks?.resources || {};

  return {
    camera: summarizeProcess(resources.camera),
    node: summarizeProcess(resources.node),
    retroarch: summarizeProcess(resources.retroarch),
  };
}

function summarizeHealth(health) {
  const cameraPeers = getCameraPeerState(health);
  const runtimeActiveSessionId = getRuntimeActiveSessionId(health);

  return {
    cameraPeers,
    input: getInputMode(health),
    ok: Boolean(health?.ok),
    resources: getResourceSnapshot(health),
    runtimeActiveSessionId,
    runtimeCameraRunning: Boolean(health?.checks?.runtime?.cameraRunning),
    runtimeRetroarchRunning: Boolean(health?.checks?.runtime?.retroarchRunning),
    uptime: typeof health?.uptime === "number" ? health.uptime : null,
  };
}

async function fetchHealth(engineUrl) {
  const response = await fetch(getHealthUrl(engineUrl));
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body ? JSON.stringify(body) : response.statusText;
    throw new Error(`GET /health returned ${response.status}: ${message}`);
  }

  return body;
}

function makeLogger(outDir, runId) {
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

function readOptionalJsonFile(sourcePath, label) {
  if (!sourcePath) return null;

  const raw = fs.readFileSync(sourcePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} is not valid JSON: ${message}`);
  }
}

function writeJsonArtifact(runDir, fileName, payload) {
  const artifactPath = path.join(runDir, fileName);
  fs.writeFileSync(artifactPath, `${JSON.stringify(payload, null, 2)}\n`);
  return artifactPath;
}

function copyTextArtifact(runDir, fileName, sourcePath) {
  if (!sourcePath) return null;

  const artifactPath = path.join(runDir, fileName);
  fs.copyFileSync(sourcePath, artifactPath);
  return artifactPath;
}

function writeTelemetryArtifact(runDir, fileName, sourcePath, description) {
  if (!sourcePath) {
    return writePlaceholderJson(runDir, fileName, description);
  }

  const payload = readOptionalJsonFile(sourcePath, fileName);
  return writeJsonArtifact(runDir, fileName, payload);
}

function writePlaceholderJson(runDir, fileName, description) {
  const artifactPath = path.join(runDir, fileName);
  const payload = {
    instructions: description,
    status: "paste-stream-telemetry-json-here",
  };
  fs.writeFileSync(artifactPath, `${JSON.stringify(payload, null, 2)}\n`);
  return artifactPath;
}

function writeNotesTemplate({
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
    "- [ ] Guest loaded HTTPS companion join page.",
    "- [ ] Guest redeemed invite code without receiving the raw host pairing token.",
    "- [ ] Host stream stayed active after guest joined.",
    "- [ ] Guest stream reached LIVE STREAM ACTIVE.",
    "- [ ] Host telemetry copied to `host-stream-telemetry.json`.",
    "- [ ] Guest telemetry copied to `guest-stream-telemetry.json`.",
    "- [ ] P2 request/input/release worked.",
    "- [ ] P3/P4 state matched engine input mode.",
    "- [ ] Guest disconnect returned engine peer count to baseline.",
    "- [ ] Invite regenerate/revoke behavior checked.",
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

async function pollUntil({ description, engineUrl, log, predicate, pollMs, timeoutMs }) {
  const startedAt = Date.now();
  let lastHealth = null;

  while (Date.now() - startedAt <= timeoutMs) {
    const health = await fetchHealth(engineUrl);
    lastHealth = health;
    const summary = summarizeHealth(health);
    log.write("health-poll", {
      description,
      summary,
    });

    if (predicate(health, summary)) {
      return health;
    }

    await sleep(pollMs);
  }

  const lastSummary = lastHealth ? summarizeHealth(lastHealth) : null;
  throw new Error(
    `Timed out waiting for ${description}. Last health summary: ${JSON.stringify(
      lastSummary,
    )}`,
  );
}

function assertSessionSurvived({ expectedSessionId, health, phase }) {
  const runtimeActiveSessionId = getRuntimeActiveSessionId(health);
  const cameraSessionId = getCameraPeerState(health).sessionId;

  if (!runtimeActiveSessionId) {
    throw new Error(`${phase}: engine has no active session.`);
  }

  if (runtimeActiveSessionId !== expectedSessionId) {
    throw new Error(
      `${phase}: active session changed from ${expectedSessionId} to ${runtimeActiveSessionId}.`,
    );
  }

  if (cameraSessionId && cameraSessionId !== expectedSessionId) {
    throw new Error(
      `${phase}: camera peer state belongs to ${cameraSessionId}, expected ${expectedSessionId}.`,
    );
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.allowSelfSigned) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  const safeLabel = options.label.replace(/[^a-zA-Z0-9_-]+/g, "-");
  const runId = `${safeLabel}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const log = makeLogger(options.outDir, runId);
  const reportPath = path.join(log.runDir, "engine-smoke-report.json");
  const artifactPaths = {
    completedNotesPath: null,
    eventsPath: log.eventsPath,
    guestTelemetryPath: writeTelemetryArtifact(
      log.runDir,
      "guest-stream-telemetry.json",
      options.guestTelemetryPath,
      "Paste the guest player Stream Stats > Copy Stats JSON here after the guest reaches LIVE STREAM ACTIVE.",
    ),
    hostTelemetryPath: writeTelemetryArtifact(
      log.runDir,
      "host-stream-telemetry.json",
      options.hostTelemetryPath,
      "Paste the host player Stream Stats > Copy Stats JSON here after the guest joins.",
    ),
    notesPath: null,
    reportPath,
    runDir: log.runDir,
  };
  activeRun = {
    artifactPaths,
    log,
    options,
    reportPath,
    runId,
  };
  artifactPaths.notesPath = writeNotesTemplate({
    artifactPaths,
    baselinePeerCount: null,
    expectedSessionId: options.sessionId,
    options,
    reportPath,
    runDir: log.runDir,
    runId,
    targetPeerCount: null,
  });

  console.log(`[smoke] Bundle: ${log.runDir}`);
  console.log(`[smoke] Host telemetry: ${artifactPaths.hostTelemetryPath}`);
  console.log(`[smoke] Guest telemetry: ${artifactPaths.guestTelemetryPath}`);
  console.log(`[smoke] Notes: ${artifactPaths.notesPath}`);

  log.write("run-start", {
    engineUrl: options.engineUrl,
    expectedGuests: options.expectedGuests,
    allowSelfSigned: options.allowSelfSigned,
    skipDisconnect: options.skipDisconnect,
  });

  const before = await fetchHealth(options.engineUrl);
  const beforeSummary = summarizeHealth(before);
  const expectedSessionId =
    options.sessionId || beforeSummary.runtimeActiveSessionId;

  if (!expectedSessionId) {
    throw new Error(
      "Engine health has no active session. Start a host game before running this smoke.",
    );
  }

  assertSessionSurvived({
    expectedSessionId,
    health: before,
    phase: "baseline",
  });

  const baselinePeerCount = beforeSummary.cameraPeers.peerCount;
  const targetPeerCount = baselinePeerCount + options.expectedGuests;
  log.write("baseline", {
    expectedSessionId,
    notesPath: artifactPaths.notesPath,
    targetPeerCount,
    summary: beforeSummary,
  });

  console.log(
    `[smoke] Baseline session=${expectedSessionId} peers=${baselinePeerCount}. Waiting for peers>=${targetPeerCount}...`,
  );

  const afterJoin = await pollUntil({
    description: `camera peer count >= ${targetPeerCount}`,
    engineUrl: options.engineUrl,
    log,
    pollMs: options.pollMs,
    timeoutMs: options.timeoutMs,
    predicate: (health, summary) => {
      assertSessionSurvived({
        expectedSessionId,
        health,
        phase: "join-wait",
      });
      return summary.cameraPeers.peerCount >= targetPeerCount;
    },
  });
  const afterJoinSummary = summarizeHealth(afterJoin);
  assertSessionSurvived({
    expectedSessionId,
    health: afterJoin,
    phase: "after-join",
  });
  log.write("after-join", {
    summary: afterJoinSummary,
  });

  let afterDisconnect = null;
  let afterDisconnectSummary = null;
  if (!options.skipDisconnect) {
    console.log(
      `[smoke] Join validated. Close guest tabs now; waiting for peers<=${baselinePeerCount}...`,
    );
    afterDisconnect = await pollUntil({
      description: `camera peer count <= ${baselinePeerCount} after guest disconnect`,
      engineUrl: options.engineUrl,
      log,
      pollMs: options.pollMs,
      timeoutMs: options.timeoutMs,
      predicate: (health, summary) => {
        assertSessionSurvived({
          expectedSessionId,
          health,
          phase: "disconnect-wait",
        });
        return summary.cameraPeers.peerCount <= baselinePeerCount;
      },
    });
    afterDisconnectSummary = summarizeHealth(afterDisconnect);
    assertSessionSurvived({
      expectedSessionId,
      health: afterDisconnect,
      phase: "after-disconnect",
    });
    log.write("after-disconnect", {
      summary: afterDisconnectSummary,
    });
  }

  artifactPaths.completedNotesPath = copyTextArtifact(
    log.runDir,
    "completed-manual-notes.md",
    options.notesPath,
  );

  const report = {
    artifacts: {
      ...artifactPaths,
    },
    engineUrl: options.engineUrl,
    expectedGuests: options.expectedGuests,
    expectedSessionId,
    passed: true,
    phases: {
      afterDisconnect: afterDisconnectSummary,
      afterJoin: afterJoinSummary,
      before: beforeSummary,
    },
    runId,
    timestamp: nowIso(),
  };

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  log.write("run-pass", {
    artifacts: artifactPaths,
    reportPath,
  });

  console.log(`[smoke] PASS ${runId}`);
  console.log(`[smoke] Report: ${reportPath}`);
  console.log(`[smoke] Events: ${log.eventsPath}`);
}

run().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  if (activeRun) {
    const failedReport = {
      artifacts: {
        ...activeRun.artifactPaths,
      },
      engineUrl: activeRun.options.engineUrl,
      error: message,
      expectedGuests: activeRun.options.expectedGuests,
      passed: false,
      runId: activeRun.runId,
      timestamp: nowIso(),
    };

    fs.writeFileSync(
      activeRun.reportPath,
      `${JSON.stringify(failedReport, null, 2)}\n`,
    );
    activeRun.log.write("run-fail", {
      message,
      reportPath: activeRun.reportPath,
    });
    console.error(`[smoke] Bundle: ${activeRun.artifactPaths.runDir}`);
    console.error(`[smoke] Report: ${activeRun.reportPath}`);
  }
  console.error(`[smoke] FAIL: ${message}`);
  process.exitCode = 1;
});
