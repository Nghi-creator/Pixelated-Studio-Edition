#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ARTIFACT_ROOT = ".context/smoke-artifacts";
const REQUIRED_ARTIFACTS = [
  "engine-smoke-report.json",
  "engine-health-events.ndjson",
  "host-stream-telemetry.json",
  "guest-stream-telemetry.json",
  "manual-smoke-notes.md",
];
const PROCESS_NAMES = ["camera", "retroarch", "node"];

const isRecord = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const numberOrNull = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function readNdjson(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        throw new Error(
          `${path.basename(filePath)} line ${index + 1} is invalid JSON: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    });
}

const getPeerCount = (summary) =>
  numberOrNull(summary?.cameraPeers?.peerCount);
const getSessionIds = (summary) =>
  [summary?.runtimeActiveSessionId, summary?.cameraPeers?.sessionId].filter(
    (value) => typeof value === "string" && value.length > 0,
  );
const getProcess = (summary, name) =>
  isRecord(summary?.resources?.[name]) ? summary.resources[name] : null;
const formatNumber = (value, digits = 1) =>
  value === null ? "n/a" : value.toFixed(digits);
const formatDelta = (value, unit) =>
  value === null
    ? "n/a"
    : `${value >= 0 ? "+" : ""}${value.toFixed(2)} ${unit}`;

function resourceDelta(before, after, processName) {
  const beforeProcess = getProcess(before, processName);
  const afterProcess = getProcess(after, processName);
  const beforeCpu = numberOrNull(beforeProcess?.averageCpuPercent);
  const afterCpu = numberOrNull(afterProcess?.averageCpuPercent);
  const beforeRss = numberOrNull(beforeProcess?.rssMb);
  const afterRss = numberOrNull(afterProcess?.rssMb);

  return {
    cpu:
      beforeCpu === null || afterCpu === null ? null : afterCpu - beforeCpu,
    rss:
      beforeRss === null || afterRss === null ? null : afterRss - beforeRss,
  };
}

function telemetrySummary(payload) {
  if (
    !isRecord(payload) ||
    payload.status === "paste-stream-telemetry-json-here"
  ) {
    return { complete: false, healthy: false };
  }

  const telemetry = isRecord(payload.telemetry) ? payload.telemetry : payload;
  const connectionState =
    typeof telemetry.connectionState === "string"
      ? telemetry.connectionState
      : null;
  const iceConnectionState =
    typeof telemetry.iceConnectionState === "string"
      ? telemetry.iceConnectionState
      : null;
  const lastEngineError =
    typeof telemetry.lastEngineError === "string" && telemetry.lastEngineError
      ? telemetry.lastEngineError
      : null;

  return {
    bitrateKbps: numberOrNull(telemetry.bitrateKbps),
    complete: true,
    connectionState,
    fps: numberOrNull(telemetry.fps),
    healthy:
      connectionState === "connected" &&
      ["connected", "completed"].includes(iceConnectionState) &&
      !lastEngineError,
    iceConnectionState,
    jitterMs: numberOrNull(telemetry.jitterMs),
    lastEngineError,
    packetsLost: numberOrNull(telemetry.packetsLost),
    sessionId: typeof payload.sessionId === "string" ? payload.sessionId : null,
  };
}

function parseManualNotes(notes) {
  const overall = notes.match(/(?:^|\n)\s*-\s*Overall:\s*(PASS|FAIL)\b/i)?.[1];
  const uncheckedCount = (notes.match(/-\s*\[\s\]/g) || []).length;
  const checkedCount = (notes.match(/-\s*\[[xX]\]/g) || []).length;

  return {
    checkedCount,
    complete: overall?.toUpperCase() === "PASS" && uncheckedCount === 0,
    overall: overall?.toUpperCase() || "UNSET",
    uncheckedCount,
  };
}

function loadBundle(runDir) {
  const missing = REQUIRED_ARTIFACTS.filter(
    (fileName) => !fs.existsSync(path.join(runDir, fileName)),
  );
  const errors = [];
  const load = (fileName, reader) => {
    if (missing.includes(fileName)) return null;
    try {
      return reader(path.join(runDir, fileName));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  return {
    errors,
    events: load("engine-health-events.ndjson", readNdjson) || [],
    guestTelemetry: load("guest-stream-telemetry.json", (file) =>
      JSON.parse(fs.readFileSync(file, "utf8")),
    ),
    hostTelemetry: load("host-stream-telemetry.json", (file) =>
      JSON.parse(fs.readFileSync(file, "utf8")),
    ),
    missing,
    notes: load("manual-smoke-notes.md", (file) => fs.readFileSync(file, "utf8")),
    report: load("engine-smoke-report.json", (file) =>
      JSON.parse(fs.readFileSync(file, "utf8")),
    ),
  };
}

function deriveEngineEvidence(report, events) {
  const phases = isRecord(report?.phases) ? report.phases : {};
  const summaries = [
    phases.before,
    phases.afterJoin,
    phases.afterDisconnect,
    ...events.map((event) => event?.summary),
  ].filter(isRecord);
  const before = isRecord(phases.before)
    ? phases.before
    : events.find((event) => event?.event === "baseline")?.summary;
  const afterJoin = isRecord(phases.afterJoin)
    ? phases.afterJoin
    : summaries.reduce(
        (best, summary) =>
          (getPeerCount(summary) ?? -1) > (getPeerCount(best) ?? -1)
            ? summary
            : best,
        undefined,
      );
  const afterDisconnect = isRecord(phases.afterDisconnect)
    ? phases.afterDisconnect
    : events.findLast((event) => event?.event === "after-disconnect")?.summary;
  const baselinePeers = getPeerCount(before);
  const joinPeers = getPeerCount(afterJoin);
  const disconnectPeers = getPeerCount(afterDisconnect);
  const expectedSessionId =
    typeof report?.expectedSessionId === "string"
      ? report.expectedSessionId
      : getSessionIds(before)[0] || null;
  const observedSessionIds = [...new Set(summaries.flatMap(getSessionIds))];
  const sessionSurvived =
    Boolean(expectedSessionId) &&
    observedSessionIds.length > 0 &&
    observedSessionIds.every((sessionId) => sessionId === expectedSessionId);
  const peerTransitionPassed =
    baselinePeers !== null &&
    joinPeers !== null &&
    joinPeers > baselinePeers &&
    disconnectPeers !== null &&
    disconnectPeers === baselinePeers;

  return {
    afterDisconnect,
    afterJoin,
    baselinePeers,
    before,
    disconnectPeers,
    expectedSessionId,
    joinPeers,
    observedSessionIds,
    peerTransitionPassed,
    sessionSurvived,
  };
}

function telemetryLine(label, telemetry) {
  if (!telemetry.complete) return `- ${label}: missing usable telemetry`;
  return `- ${label}: ${telemetry.connectionState || "unknown"}/ICE ${
    telemetry.iceConnectionState || "unknown"
  }, ${formatNumber(telemetry.fps, 0)} FPS, ${formatNumber(
    telemetry.bitrateKbps,
    0,
  )} kbps, loss ${formatNumber(telemetry.packetsLost, 0)}, jitter ${formatNumber(
    telemetry.jitterMs,
    1,
  )} ms${telemetry.lastEngineError ? `, error: ${telemetry.lastEngineError}` : ""}`;
}

export function summarizeSmokeArtifacts(runDir) {
  const bundle = loadBundle(runDir);
  const engine = deriveEngineEvidence(bundle.report, bundle.events);
  const host = telemetrySummary(bundle.hostTelemetry);
  const guest = telemetrySummary(bundle.guestTelemetry);
  const notes = parseManualNotes(bundle.notes || "");
  const failures = [];

  if (bundle.missing.length) {
    failures.push(`missing artifacts: ${bundle.missing.join(", ")}`);
  }
  failures.push(...bundle.errors);
  if (bundle.report?.passed !== true) {
    failures.push(
      `engine report did not pass${
        typeof bundle.report?.error === "string"
          ? ` (${bundle.report.error})`
          : ""
      }`,
    );
  }
  if (!engine.sessionSurvived) failures.push("session survival was not proven");
  if (!engine.peerTransitionPassed) failures.push("peer join/disconnect transition was not proven");
  if (!host.complete || !host.healthy) failures.push("host telemetry is incomplete or unhealthy");
  if (!guest.complete || !guest.healthy) failures.push("guest telemetry is incomplete or unhealthy");
  if (host.complete && host.sessionId !== engine.expectedSessionId) {
    failures.push("host telemetry session does not match the engine session");
  }
  if (guest.complete && guest.sessionId !== engine.expectedSessionId) {
    failures.push("guest telemetry session does not match the engine session");
  }
  if (!notes.complete) {
    failures.push(
      `manual notes are incomplete (overall=${notes.overall}, unchecked=${notes.uncheckedCount})`,
    );
  }

  const verdict = failures.length === 0 ? "PASS" : "FAIL";
  const peerPath = [engine.baselinePeers, engine.joinPeers, engine.disconnectPeers]
    .map((value) => (value === null ? "?" : value))
    .join(" -> ");
  const lines = [
    `# LAN Smoke Verdict: ${verdict}`,
    "",
    `Run: \`${path.basename(runDir)}\``,
    "",
    "## PASS/FAIL",
    "",
    `**${verdict}**${failures.length ? `: ${failures.join("; ")}.` : ": all required automated and manual evidence passed."}`,
    "",
    "## Engine",
    "",
    `- Session survival: ${engine.sessionSurvived ? "PASS" : "FAIL"} (${engine.expectedSessionId || "unknown"}; observed ${engine.observedSessionIds.join(", ") || "none"})`,
    `- Peer counts: ${peerPath} (${engine.peerTransitionPassed ? "PASS" : "FAIL"})`,
    `- Health events: ${bundle.events.length}`,
    "",
    "## CPU/RSS Delta",
    "",
    "| Process | Join CPU | Join RSS | Disconnect CPU | Disconnect RSS |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...PROCESS_NAMES.map((processName) => {
      const join = resourceDelta(engine.before, engine.afterJoin, processName);
      const disconnect = resourceDelta(engine.before, engine.afterDisconnect, processName);
      return `| ${processName} | ${formatDelta(join.cpu, "pp")} | ${formatDelta(join.rss, "MB")} | ${formatDelta(disconnect.cpu, "pp")} | ${formatDelta(disconnect.rss, "MB")} |`;
    }),
    "",
    "## WebRTC",
    "",
    telemetryLine("Host", host),
    telemetryLine("Guest", guest),
    "",
    "## Artifacts",
    "",
    `- Present: ${REQUIRED_ARTIFACTS.length - bundle.missing.length}/${REQUIRED_ARTIFACTS.length}`,
    `- Missing: ${bundle.missing.length ? bundle.missing.map((name) => `\`${name}\``).join(", ") : "none"}`,
    `- Manual notes: ${notes.overall}; ${notes.checkedCount} checked, ${notes.uncheckedCount} unchecked`,
    "",
  ];

  return { markdown: lines.join("\n"), verdict };
}

function resolveRunDir(input) {
  const direct = path.resolve(input);
  return fs.existsSync(direct)
    ? direct
    : path.resolve(DEFAULT_ARTIFACT_ROOT, input);
}

function printUsage() {
  console.log(`Usage:
  node scripts/summarizeSmokeArtifacts.mjs <run-id-or-directory> [--out <path|->]

By default, writes <run-directory>/smoke-verdict.md and prints the verdict.
Use --out - to print without writing a file.`);
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help")) {
    printUsage();
    process.exitCode = args.length ? 0 : 1;
    return;
  }
  const runDir = resolveRunDir(args[0]);
  if (!fs.existsSync(runDir) || !fs.statSync(runDir).isDirectory()) {
    throw new Error(`Smoke artifact directory not found: ${runDir}`);
  }
  const outIndex = args.indexOf("--out");
  if (args.length > 1 && (outIndex !== 1 || args.length !== 3)) {
    throw new Error(`Unknown arguments: ${args.slice(1).join(" ")}`);
  }
  if (outIndex >= 0 && !args[outIndex + 1]) throw new Error("--out requires a path or -");
  const output = outIndex >= 0 ? args[outIndex + 1] : path.join(runDir, "smoke-verdict.md");
  const result = summarizeSmokeArtifacts(runDir);
  if (output !== "-") {
    const outputPath = path.resolve(output);
    fs.writeFileSync(outputPath, result.markdown);
    console.error(`Wrote ${outputPath}`);
  }
  console.log(result.markdown);
  process.exitCode = result.verdict === "PASS" ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
