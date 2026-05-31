#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_ENGINE_URL = "http://127.0.0.1:8080";
const DEFAULT_OUT_DIR = ".context/smoke-artifacts";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_MS = 2_000;

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
  --allow-self-signed       Allow self-signed HTTPS companion certificates.
  --skip-disconnect         Do not wait for guest peer cleanup after join validation.
  --help                    Show this help.

Flow:
  1. Start the host game and wait for the host stream to play.
  2. Run this script before guests open the LAN join page.
  3. Have guests join as spectators or players.
  4. If disconnect validation is enabled, close guest tabs after join passes.
`);
}

function parseArgs(argv) {
  const options = {
    engineUrl: DEFAULT_ENGINE_URL,
    expectedGuests: 1,
    label: "lan-multiplayer-smoke",
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

function summarizeHealth(health) {
  const cameraPeers = getCameraPeerState(health);
  const runtimeActiveSessionId = getRuntimeActiveSessionId(health);

  return {
    cameraPeers,
    input: getInputMode(health),
    ok: Boolean(health?.ok),
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
  fs.mkdirSync(outDir, { recursive: true });
  const eventsPath = path.join(outDir, `${runId}.ndjson`);

  return {
    eventsPath,
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
  const reportPath = path.join(options.outDir, `${runId}.json`);

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

  const report = {
    artifacts: {
      eventsPath: log.eventsPath,
      reportPath,
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
    reportPath,
  });

  console.log(`[smoke] PASS ${runId}`);
  console.log(`[smoke] Report: ${reportPath}`);
  console.log(`[smoke] Events: ${log.eventsPath}`);
}

run().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[smoke] FAIL: ${message}`);
  process.exitCode = 1;
});
