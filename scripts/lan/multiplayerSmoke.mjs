#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const DEFAULT_ENGINE_URL = "http://127.0.0.1:8080";
const DEFAULT_OUT_DIR = ".context/smoke-artifacts";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_MS = 2_000;
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

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

function parseArgs(argv) {
  const options = {
    engineUrl: DEFAULT_ENGINE_URL,
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function printCheck(status, label, detail = "") {
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`[${status}] ${label}${suffix}`);
}

function getHealthUrl(engineUrl) {
  return `${engineUrl}/health`;
}

function isHttpsCompanion(engineUrl) {
  return new URL(engineUrl).protocol === "https:";
}

function normalizeInviteCode(inviteCode) {
  return inviteCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
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

async function requestJson(engineUrl, route, options = {}) {
  const response = await fetch(`${engineUrl}${route}`, options);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body ? JSON.stringify(body) : response.statusText;
    throw new Error(
      `${options.method || "GET"} ${route} returned ${response.status}: ${message}`,
    );
  }

  return body;
}

async function preflightCompanion(engineUrl) {
  const preflight = await requestJson(engineUrl, "/invite/preflight");
  if (preflight?.certificate?.status !== "accepted") {
    throw new Error("Companion preflight did not confirm certificate acceptance.");
  }
  if (preflight?.invite?.status !== "active") {
    throw new Error(
      `Companion invite is ${preflight?.invite?.status || "unknown"}, expected active.`,
    );
  }
  if (preflight?.engine?.status !== "available" || preflight?.ready !== true) {
    throw new Error("Companion preflight reports that the host engine is unavailable.");
  }
  return preflight;
}

async function redeemCompanionInvite(engineUrl, inviteCode) {
  const normalizedInviteCode = normalizeInviteCode(inviteCode);
  if (!normalizedInviteCode) {
    throw new Error("--invite-code must contain letters or numbers.");
  }

  const redemption = await requestJson(engineUrl, "/invite/redeem", {
    body: JSON.stringify({ code: normalizedInviteCode }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!redemption?.companionToken) {
    throw new Error("Companion invite redemption returned no companion credential.");
  }
  return redemption;
}

function makeSyntheticOffer(peerId) {
  const fingerprint = crypto
    .randomBytes(32)
    .toString("hex")
    .toUpperCase()
    .match(/.{2}/g)
    .join(":");

  return {
    peerId,
    sdp: [
      "v=0",
      `o=- ${Date.now()} 2 IN IP4 127.0.0.1`,
      "s=Pixelated LAN smoke",
      "t=0 0",
      "a=group:BUNDLE 0 1",
      "a=msid-semantic: WMS",
      "m=video 9 UDP/TLS/RTP/SAVPF 96",
      "c=IN IP4 0.0.0.0",
      "a=mid:0",
      "a=recvonly",
      "a=rtcp:9 IN IP4 0.0.0.0",
      "a=rtcp-mux",
      "a=rtcp-rsize",
      "a=rtpmap:96 VP8/90000",
      "a=ice-options:trickle",
      "a=ice-ufrag:smoke",
      "a=ice-pwd:pixelatedsmokepixelatedsmoke",
      `a=fingerprint:sha-256 ${fingerprint}`,
      "a=setup:actpass",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "c=IN IP4 0.0.0.0",
      "a=mid:1",
      "a=recvonly",
      "a=rtcp:9 IN IP4 0.0.0.0",
      "a=rtcp-mux",
      "a=rtcp-rsize",
      "a=rtpmap:111 opus/48000/2",
      "a=ice-options:trickle",
      "a=ice-ufrag:smoke",
      "a=ice-pwd:pixelatedsmokepixelatedsmoke",
      `a=fingerprint:sha-256 ${fingerprint}`,
      "a=setup:actpass",
      "",
    ].join("\r\n"),
    type: "offer",
  };
}

async function connectCompanionGuest({
  companionToken,
  engineUrl,
  expectedSessionId,
  log,
  timeoutMs,
}) {
  const require = createRequire(path.join(REPO_ROOT, "apps/web/package.json"));
  const { io } = require("socket.io-client");
  const peerId = `smoke-${crypto.randomBytes(8).toString("hex")}`;
  const socket = io(engineUrl, {
    autoConnect: false,
    query: { companionToken },
    reconnection: false,
  });
  const disconnectSocket = () => {
    socket.emit("webrtc-peer-disconnect", {
      peerId,
      sessionId: expectedSessionId,
    });
    socket.disconnect();
  };

  const connected = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out connecting the companion smoke guest.")),
      timeoutMs,
    );
    socket.once("connect_error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Companion guest Socket.IO connection failed: ${err.message}`));
    });
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  socket.connect();
  try {
    await connected;
  } catch (err) {
    disconnectSocket();
    throw err;
  }
  log.write("companion-guest-socket-connected", { peerId, socketId: socket.id });

  const lobbyJoined = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for companion guest lobby state.")),
      timeoutMs,
    );
    socket.on("lobby-state", (state) => {
      const participant = state?.participants?.find(
        (entry) => entry.socketId === socket.id,
      );
      if (!participant) return;
      clearTimeout(timeout);
      resolve({ participant, state });
    });
  });
  socket.emit("join-session", {
    displayName: "LAN Smoke Guest",
    role: "spectator",
    sessionId: expectedSessionId,
  });
  let lobby;
  try {
    lobby = await lobbyJoined;
  } catch (err) {
    disconnectSocket();
    throw err;
  }
  if (lobby.participant.role !== "spectator") {
    disconnectSocket();
    throw new Error(
      `Companion smoke guest joined as ${lobby.participant.role}, expected spectator.`,
    );
  }
  log.write("companion-guest-lobby-joined", {
    participant: lobby.participant,
    participantCount: lobby.state.participants.length,
  });

  const answered = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for the camera WebRTC answer.")),
      timeoutMs,
    );
    socket.on("engine-error", (payload) => {
      clearTimeout(timeout);
      reject(new Error(payload?.message || "Camera rejected the smoke guest."));
    });
    socket.on("webrtc-answer", (answer) => {
      if (answer?.peerId !== peerId) return;
      clearTimeout(timeout);
      resolve(answer);
    });
  });
  socket.emit("webrtc-offer", {
    ...makeSyntheticOffer(peerId),
    sessionId: expectedSessionId,
  });
  log.write("companion-guest-offer-sent", { peerId });
  try {
    await answered;
  } catch (err) {
    disconnectSocket();
    throw err;
  }
  log.write("companion-guest-answer-received", { peerId });

  return {
    disconnect() {
      disconnectSocket();
      log.write("companion-guest-disconnected", { peerId });
    },
    peerId,
  };
}

async function activateTelemetryCapture(
  engineUrl,
  captureToken,
  runId,
  sessionId,
) {
  await requestJson(engineUrl, "/smoke/telemetry/active", {
    body: JSON.stringify({ captureToken, runId, sessionId }),
    headers: { "Content-Type": "application/json" },
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
  activeRun.captureToken = captureToken;
  await activateTelemetryCapture(
    options.engineUrl,
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
