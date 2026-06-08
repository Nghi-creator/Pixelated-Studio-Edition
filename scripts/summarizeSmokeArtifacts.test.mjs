import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { summarizeSmokeArtifacts } from "./summarizeSmokeArtifacts.mjs";

const writeJson = (dir, name, value) =>
  fs.writeFileSync(path.join(dir, name), `${JSON.stringify(value)}\n`);

function summary(peerCount, offset = 0) {
  return {
    cameraPeers: { peerCount, sessionId: "session-1" },
    resources: {
      camera: { averageCpuPercent: 20 + offset, rssMb: 90 + offset },
      node: { averageCpuPercent: null, rssMb: 50 + offset },
      retroarch: { averageCpuPercent: 50 + offset, rssMb: 180 + offset },
    },
    runtimeActiveSessionId: "session-1",
  };
}

function telemetry(playerMode = "host") {
  return {
    playerMode,
    sessionId: "session-1",
    status: "LIVE STREAM ACTIVE",
    telemetry: {
      bitrateKbps: 1200,
      connectionState: "connected",
      fps: 60,
      iceConnectionState: "connected",
      jitterMs: 4.5,
      lastEngineError: null,
      packetsLost: 0,
    },
  };
}

function makeBundle() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-summary-"));
  writeJson(dir, "engine-smoke-report.json", {
    expectedSessionId: "session-1",
    passed: true,
    phases: {
      afterDisconnect: summary(1, 1),
      afterJoin: summary(2, 5),
      before: summary(1),
    },
  });
  fs.writeFileSync(
    path.join(dir, "engine-health-events.ndjson"),
    `${JSON.stringify({ event: "baseline", summary: summary(1) })}\n${JSON.stringify({ event: "after-join", summary: summary(2, 5) })}\n${JSON.stringify({ event: "after-disconnect", summary: summary(1, 1) })}\n`,
  );
  writeJson(dir, "host-stream-telemetry.json", telemetry("host"));
  writeJson(dir, "guest-stream-telemetry.json", telemetry("guest"));
  fs.writeFileSync(
    path.join(dir, "manual-smoke-notes.md"),
    "- [x] Host passed.\n- [x] Guest passed.\n- Overall: PASS\n",
  );
  return dir;
}

test("summarizes a complete passing smoke bundle", () => {
  const result = summarizeSmokeArtifacts(makeBundle());
  assert.equal(result.verdict, "PASS");
  assert.match(result.markdown, /Peer counts: 1 -> 2 -> 1 \(PASS\)/);
  assert.match(result.markdown, /\| camera \| \+5\.00 pp \| \+5\.00 MB/);
  assert.match(result.markdown, /Host: connected\/ICE connected, 60 FPS/);
  assert.match(result.markdown, /Present: 5\/5/);
});

test("fails clearly when artifacts and manual evidence are incomplete", () => {
  const dir = makeBundle();
  fs.rmSync(path.join(dir, "guest-stream-telemetry.json"));
  fs.writeFileSync(
    path.join(dir, "manual-smoke-notes.md"),
    "- [ ] Guest passed.\n- Overall: PASS\n",
  );
  const result = summarizeSmokeArtifacts(dir);
  assert.equal(result.verdict, "FAIL");
  assert.match(result.markdown, /missing artifacts: guest-stream-telemetry\.json/);
  assert.match(result.markdown, /guest telemetry is incomplete or unhealthy/);
  assert.match(result.markdown, /Manual notes: PASS; 0 checked, 1 unchecked/);
});

test("fails when browser telemetry belongs to a different session", () => {
  const dir = makeBundle();
  writeJson(dir, "guest-stream-telemetry.json", {
    ...telemetry(),
    sessionId: "other-session",
  });
  const result = summarizeSmokeArtifacts(dir);
  assert.equal(result.verdict, "FAIL");
  assert.match(
    result.markdown,
    /guest telemetry session does not match the engine session/,
  );
});

test("fails when direct-capture roles do not match their artifact files", () => {
  const dir = makeBundle();
  writeJson(dir, "guest-stream-telemetry.json", telemetry("host"));
  const result = summarizeSmokeArtifacts(dir);
  assert.equal(result.verdict, "FAIL");
  assert.match(
    result.markdown,
    /guest telemetry is not identified as a guest snapshot/,
  );
});

test("CLI writes smoke-verdict.md into a passing bundle", () => {
  const dir = makeBundle();
  const result = spawnSync(
    process.execPath,
    [path.resolve("scripts/summarizeSmokeArtifacts.mjs"), dir],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /# LAN Smoke Verdict: PASS/);
  assert.match(
    fs.readFileSync(path.join(dir, "smoke-verdict.md"), "utf8"),
    /## PASS\/FAIL/,
  );
});
