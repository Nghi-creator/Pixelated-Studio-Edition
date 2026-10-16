import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fetchHealth, summarizeHealth, nowIso, isHttpsCompanion, preflightCompanion, redeemCompanionInvite, printCheck } from "./multiplayerSmokeHealth.mjs";
import { connectCompanionGuest } from "./multiplayerSmokeCompanion.mjs";
import { copyTextArtifact, makeLogger, writeNotesTemplate, writePlaceholderJson } from "./multiplayerSmokeArtifacts.mjs";
import { activateTelemetryCapture, deactivateTelemetryCapture, captureBrowserTelemetry } from "./multiplayerSmokeTelemetry.mjs";
import { pollUntil, assertSessionSurvived } from "./multiplayerSmokeSession.mjs";
import { connectOwnedGuests, disconnectOwnedGuests } from "./multiplayerSmokeCleanup.mjs";
export async function run(options, runState) {
  const safeLabel = options.label.replace(/[^a-zA-Z0-9_-]+/g, "-");
  const runId = `${safeLabel}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const log = makeLogger(options.outDir, runId);
  const reportPath = path.join(log.runDir, "engine-smoke-report.json");
  const artifactPaths = {
    completedNotesPath: null,
    eventsPath: log.eventsPath,
    guestTelemetryPath: writePlaceholderJson(log.runDir, "guest-stream-telemetry.json", "The active smoke run replaces this after the guest presses Stream Stats > Copy Stats."),
    hostTelemetryPath: writePlaceholderJson(log.runDir, "host-stream-telemetry.json", "The active smoke run replaces this after the host presses Stream Stats > Copy Stats."),
    notesPath: null,
    reportPath,
    runDir: log.runDir,
  };
  const activeRun = runState.activeRun = {
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
    skipDisconnect: options.skipDisconnect,
  });
  let companionRedemption = null;
  if (isHttpsCompanion(options.engineUrl)) {
    if (!options.inviteCode) {
      throw new Error("HTTPS companion smoke requires --invite-code after the certificate is trusted.");
    }
    const preflight = await preflightCompanion(options.engineUrl);
    pass("Companion preflight", `invite=${preflight.invite.status}, engine=${preflight.engine.status}`);
    companionRedemption = await redeemCompanionInvite(options.engineUrl, options.inviteCode);
    pass("Invite redemption", "received short-lived companion credential");
    log.write("companion-invite-redeemed", {
      expiresAt: companionRedemption.expiresAt || null,
      tokenStoredBy: companionRedemption.tokenStoredBy || null,
    });
  }
  const before = await fetchHealth(options.engineUrl);
  const beforeSummary = summarizeHealth(before);
  const expectedSessionId = options.sessionId || beforeSummary.runtimeActiveSessionId;
  if (!expectedSessionId) {
    throw new Error("Engine health has no active session. Start a host game before running this smoke.");
  }
  assertSessionSurvived({
    expectedSessionId,
    health: before,
    phase: "baseline",
  });
  pass("Host session baseline", `session=${expectedSessionId}, peers=${beforeSummary.cameraPeers.peerCount}`);
  const captureToken = crypto.randomBytes(32).toString("hex");
  if (!options.engineToken) {
    throw new Error("PIXELATED_ENGINE_TOKEN is required to activate smoke telemetry capture.");
  }
  activeRun.captureToken = captureToken;
  await activateTelemetryCapture(options.engineUrl, options.engineToken, captureToken, runId, expectedSessionId);
  log.write("telemetry-capture-active", { expectedSessionId });
  const baselinePeerCount = beforeSummary.cameraPeers.peerCount;
  const targetPeerCount = baselinePeerCount + options.expectedGuests;
  log.write("baseline", {
    expectedSessionId,
    notesPath: artifactPaths.notesPath,
    targetPeerCount,
    summary: beforeSummary,
  });
  const automatedGuests = activeRun.automatedGuests;
  if (companionRedemption) {
    await connectOwnedGuests(activeRun, options.expectedGuests, () => connectCompanionGuest({
      companionToken: companionRedemption.companionToken,
      engineUrl: options.engineUrl, expectedSessionId, log, timeoutMs: options.timeoutMs,
    }));
    pass("Companion guest join", `${automatedGuests.length} spectator${automatedGuests.length === 1 ? "" : "s"} joined and received camera answers`);
  }
  else {
    printCheck("WAIT", "Guest join", `waiting for peers to increase from ${baselinePeerCount} to ${targetPeerCount}`);
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
  pass("Peer-count increase", `${baselinePeerCount} -> ${afterJoinSummary.cameraPeers.peerCount}`);
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
      await disconnectOwnedGuests(activeRun);
    }
    else {
      printCheck("WAIT", "Guest disconnect", `close guest tabs; waiting for peers to return to ${baselinePeerCount}`);
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
    pass("Disconnect cleanup", `${afterJoinSummary.cameraPeers.peerCount} -> ${afterDisconnectSummary.cameraPeers.peerCount}`);
    pass("Host session survived disconnect", expectedSessionId);
  }
  else if (automatedGuests.length) {
    await disconnectOwnedGuests(activeRun);
    pass("Automated guest socket closed", "disconnect verification skipped");
  }
  artifactPaths.completedNotesPath = copyTextArtifact(log.runDir, "completed-manual-notes.md", options.notesPath);
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
  await deactivateTelemetryCapture(options.engineUrl, captureToken);
  activeRun.captureToken = null;
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  log.write("run-pass", {
    artifacts: artifactPaths,
    reportPath,
  });
  console.log(`\nPASS ${runId}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Events: ${log.eventsPath}`);
}
