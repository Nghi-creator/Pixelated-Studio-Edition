#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  fetchHealth,
  getCameraPeerState,
  getRuntimeActiveSessionId,
  isHttpsCompanion,
  normalizeInviteCode,
  nowIso,
  preflightCompanion,
  printCheck,
  requestJson,
  redeemCompanionInvite,
  sleep,
  summarizeHealth,
} from "./multiplayerSmokeHealth.mjs";
import {
  connectCompanionGuest,
  makeSyntheticOffer,
} from "./multiplayerSmokeCompanion.mjs";
import {
  copyTextArtifact,
  makeLogger,
  writeJsonArtifact,
  writeNotesTemplate,
  writePlaceholderJson,
} from "./multiplayerSmokeArtifacts.mjs";

const DEFAULT_ENGINE_URL = "http://127.0.0.1:8080";
const DEFAULT_OUT_DIR = ".context/smoke-artifacts";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_MS = 2_000;
let activeRun = null;

function printUsage() {
  console.log(`Usage:
  node scripts/lan/multiplayerSmoke.mjs [options]

Options:
  --engine-url <url>        Engine or HTTPS companion origin. Default: ${DEFAULT_ENGINE_URL}
  --invite-code <code>      Redeem this LAN companion invite and automate guest join.
  --expected-guests <n>     Number of new camera peers to wait for. Default: 1
  --session-id <id>         Require this active engine session id.
  --timeout-ms <ms>         Wait timeout for join/disconnect phases. Default: ${DEFAULT_TIMEOUT_MS}
  --poll-ms <ms>            Health poll interval. Default: ${DEFAULT_POLL_MS}
  --out-dir <path>          Artifact directory. Default: ${DEFAULT_OUT_DIR}
  --label <name>            Artifact label. Default: lan-multiplayer-smoke
  --notes <path>            Copy completed manual notes into the bundle.
  --allow-self-signed       Allow Node to use a self-signed companion certificate.
  --skip-disconnect         Do not wait for guest peer cleanup after join validation.
  --help                    Show this help.

Environment:
  PIXELATED_ENGINE_TOKEN    Host engine token required to control telemetry capture.

Flow:
  1. Start the host game and wait for the host stream to play.
  2. For HTTPS companion smoke, accept the certificate once, then pass --invite-code.
  3. The harness preflights/redeems the invite and joins a synthetic spectator peer.
  4. Host and real guest browser telemetry is captured through Stream Stats.

Reports include camera peer counts, session survival checks, input mode, engine
process CPU/RSS snapshots from /health, directly captured host/guest telemetry,
and a manual pass/fail notes template.
`);
}

function parseArgs(argv, environment = process.env) {
  const options = {
    engineUrl: DEFAULT_ENGINE_URL,
    engineToken: environment.PIXELATED_ENGINE_TOKEN || "",
    expectedGuests: 1,
    inviteCode: null,
    label: "lan-multiplayer-smoke",
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
    } else if (arg === "--invite-code") {
      options.inviteCode = next().trim();
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

async function activateTelemetryCapture(
  engineUrl,
  engineToken,
  captureToken,
  runId,
  sessionId,
) {
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

async function deactivateTelemetryCapture(engineUrl, captureToken) {
  const response = await fetch(`${engineUrl}/smoke/telemetry/active`, {
    headers: { "X-Smoke-Capture-Token": captureToken },
    method: "DELETE",
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`DELETE /smoke/telemetry/active returned ${response.status}`);
  }
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

async function captureBrowserTelemetry({
  artifactPaths,
  captureToken,
  engineUrl,
  expectedSessionId,
  log,
  pollMs,
  timeoutMs,
}) {
  printCheck(
    "WAIT",
    "Captured host/guest telemetry",
    "open Stream Stats on both browsers and press Copy Stats",
  );

  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const capture = await fetchTelemetryCapture(engineUrl, captureToken);
    const hostCaptured = Boolean(capture?.host);
    const guestCaptured = Boolean(capture?.guest);
    log.write("telemetry-poll", { guestCaptured, hostCaptured });

    if (hostCaptured && guestCaptured) {
      validateCapturedTelemetry(capture, expectedSessionId);
      writeJsonArtifact(
        artifactPaths.runDir,
        "host-stream-telemetry.json",
        capture.host,
      );
      writeJsonArtifact(
        artifactPaths.runDir,
        "guest-stream-telemetry.json",
        capture.guest,
      );
      log.write("telemetry-captured", {
        guestTelemetryPath: artifactPaths.guestTelemetryPath,
        hostTelemetryPath: artifactPaths.hostTelemetryPath,
      });
      printCheck("PASS", "Captured host/guest telemetry");
      return;
    }

    await sleep(pollMs);
  }

  throw new Error(
    "Timed out waiting for host and guest Stream Stats. Open Stream Stats on both devices and press Copy Stats while the run is active.",
  );
}

function validateCapturedTelemetry(capture, expectedSessionId) {
  for (const playerMode of ["host", "guest"]) {
    const snapshot = capture?.[playerMode];
    const telemetry = snapshot?.telemetry || {};
    if (snapshot?.playerMode !== playerMode) {
      throw new Error(
        `Captured ${playerMode} telemetry is identified as ${snapshot?.playerMode || "unknown"}.`,
      );
    }
    if (snapshot?.sessionId !== expectedSessionId) {
      throw new Error(
        `Captured ${playerMode} telemetry belongs to ${snapshot?.sessionId || "unknown"}, expected ${expectedSessionId}.`,
      );
    }
    if (
      telemetry.connectionState !== "connected" ||
      !["connected", "completed"].includes(telemetry.iceConnectionState) ||
      telemetry.lastEngineError
    ) {
      throw new Error(
        `Captured ${playerMode} telemetry is unhealthy: ${JSON.stringify({
          connectionState: telemetry.connectionState || null,
          iceConnectionState: telemetry.iceConnectionState || null,
          lastEngineError: telemetry.lastEngineError || null,
        })}`,
      );
    }
  }
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
    guestTelemetryPath: writePlaceholderJson(
      log.runDir,
      "guest-stream-telemetry.json",
      "The active smoke run replaces this after the guest presses Stream Stats > Copy Stats.",
    ),
    hostTelemetryPath: writePlaceholderJson(
      log.runDir,
      "host-stream-telemetry.json",
      "The active smoke run replaces this after the host presses Stream Stats > Copy Stats.",
    ),
    notesPath: null,
    reportPath,
    runDir: log.runDir,
  };
  activeRun = {
    artifactPaths,
    automatedGuests: [],
    log,
    options,
    reportPath,
    runId,
  };
  const checks = [];
  activeRun.checks = checks;
  const pass = (name, detail = "") => {
    checks.push({ detail, name, passed: true });
    printCheck("PASS", name, detail);
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

  console.log(`\nLAN companion multiplayer smoke: ${runId}`);
  console.log(`Artifacts: ${log.runDir}\n`);

  log.write("run-start", {
    engineUrl: options.engineUrl,
    expectedGuests: options.expectedGuests,
    allowSelfSigned: options.allowSelfSigned,
    skipDisconnect: options.skipDisconnect,
  });

  let companionRedemption = null;
  if (isHttpsCompanion(options.engineUrl)) {
    if (!options.inviteCode) {
      throw new Error(
        "HTTPS companion smoke requires --invite-code after the certificate is trusted.",
      );
    }
    const preflight = await preflightCompanion(options.engineUrl);
    pass(
      "Companion preflight",
      `invite=${preflight.invite.status}, engine=${preflight.engine.status}`,
    );
    companionRedemption = await redeemCompanionInvite(
      options.engineUrl,
      options.inviteCode,
    );
    pass("Invite redemption", "received short-lived companion credential");
    log.write("companion-invite-redeemed", {
      expiresAt: companionRedemption.expiresAt || null,
      tokenStoredBy: companionRedemption.tokenStoredBy || null,
    });
  }

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
  pass(
    "Host session baseline",
    `session=${expectedSessionId}, peers=${beforeSummary.cameraPeers.peerCount}`,
  );

  const captureToken = crypto.randomBytes(32).toString("hex");
  if (!options.engineToken) {
    throw new Error(
      "PIXELATED_ENGINE_TOKEN is required to activate smoke telemetry capture.",
    );
  }
  activeRun.captureToken = captureToken;
  await activateTelemetryCapture(
    options.engineUrl,
    options.engineToken,
    captureToken,
    runId,
    expectedSessionId,
  );
  log.write("telemetry-capture-active", { expectedSessionId });

  const baselinePeerCount = beforeSummary.cameraPeers.peerCount;
  const targetPeerCount = baselinePeerCount + options.expectedGuests;
  log.write("baseline", {
    expectedSessionId,
    notesPath: artifactPaths.notesPath,
    targetPeerCount,
    summary: beforeSummary,
  });

  const automatedGuests = [];
  if (companionRedemption) {
    for (let index = 0; index < options.expectedGuests; index += 1) {
      automatedGuests.push(
        await connectCompanionGuest({
          companionToken: companionRedemption.companionToken,
          engineUrl: options.engineUrl,
          expectedSessionId,
          log,
          timeoutMs: options.timeoutMs,
        }),
      );
    }
    pass(
      "Companion guest join",
      `${automatedGuests.length} spectator${automatedGuests.length === 1 ? "" : "s"} joined and received camera answers`,
    );
    activeRun.automatedGuests = automatedGuests;
  } else {
    printCheck(
      "WAIT",
      "Guest join",
      `waiting for peers to increase from ${baselinePeerCount} to ${targetPeerCount}`,
    );
  }

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
  pass(
    "Peer-count increase",
    `${baselinePeerCount} -> ${afterJoinSummary.cameraPeers.peerCount}`,
  );
  pass("Host session survived guest join", expectedSessionId);

  await captureBrowserTelemetry({
    artifactPaths,
    captureToken,
    engineUrl: options.engineUrl,
    expectedSessionId,
    log,
    pollMs: options.pollMs,
    timeoutMs: options.timeoutMs,
  });
  pass("Host/guest telemetry artifacts", "both snapshots captured");

  let afterDisconnect = null;
  let afterDisconnectSummary = null;
  if (!options.skipDisconnect) {
    if (automatedGuests.length) {
      automatedGuests.forEach((guest) => guest.disconnect());
      activeRun.automatedGuests = [];
    } else {
      printCheck(
        "WAIT",
        "Guest disconnect",
        `close guest tabs; waiting for peers to return to ${baselinePeerCount}`,
      );
    }
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
    pass(
      "Disconnect cleanup",
      `${afterJoinSummary.cameraPeers.peerCount} -> ${afterDisconnectSummary.cameraPeers.peerCount}`,
    );
    pass("Host session survived disconnect", expectedSessionId);
  } else if (automatedGuests.length) {
    automatedGuests.forEach((guest) => guest.disconnect());
    activeRun.automatedGuests = [];
    pass("Automated guest socket closed", "disconnect verification skipped");
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
    checks,
    companion: companionRedemption
      ? {
          automatedGuestJoin: true,
          expiresAt: companionRedemption.expiresAt || null,
          preflightPassed: true,
          redeemed: true,
        }
      : null,
    phases: {
      afterDisconnect: afterDisconnectSummary,
      afterJoin: afterJoinSummary,
      before: beforeSummary,
    },
    runId,
    timestamp: nowIso(),
  };

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await deactivateTelemetryCapture(options.engineUrl, captureToken);
  activeRun.captureToken = null;
  log.write("run-pass", {
    artifacts: artifactPaths,
    reportPath,
  });

  console.log(`\nPASS ${runId}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Events: ${log.eventsPath}`);
}

export {
  connectCompanionGuest,
  getCameraPeerState,
  isHttpsCompanion,
  makeSyntheticOffer,
  normalizeInviteCode,
  parseArgs,
  preflightCompanion,
  redeemCompanionInvite,
  summarizeHealth,
  validateCapturedTelemetry,
};

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  run().catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    if (activeRun) {
      activeRun.automatedGuests?.forEach((guest) => guest.disconnect());
      if (activeRun.captureToken) {
        try {
          await deactivateTelemetryCapture(
            activeRun.options.engineUrl,
            activeRun.captureToken,
          );
        } catch (deactivateError) {
          activeRun.log.write("telemetry-capture-deactivate-fail", {
            message:
              deactivateError instanceof Error
                ? deactivateError.message
                : String(deactivateError),
          });
        }
      }
      const failedReport = {
        artifacts: {
          ...activeRun.artifactPaths,
        },
        engineUrl: activeRun.options.engineUrl,
        error: message,
        expectedGuests: activeRun.options.expectedGuests,
        passed: false,
        checks: activeRun.checks || [],
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
    printCheck("FAIL", "LAN companion multiplayer smoke", message);
    process.exitCode = 1;
  });
}
