import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_DEV_ADVISORIES = new Set([
  "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
]);
const HIGH_SEVERITIES = new Set(["high", "critical"]);

function hasOnlyAllowedAdvisories(
  name,
  vulnerabilities,
  packageLock,
  visiting = new Set(),
) {
  const vulnerability = vulnerabilities[name];
  if (!vulnerability || !HIGH_SEVERITIES.has(vulnerability.severity)) {
    return true;
  }
  if (visiting.has(name)) return true;

  const nodes = Array.isArray(vulnerability.nodes)
    ? vulnerability.nodes
    : [];
  if (
    nodes.length === 0 ||
    nodes.some((node) => packageLock.packages?.[node]?.dev !== true)
  ) {
    return false;
  }

  const nextVisiting = new Set(visiting);
  nextVisiting.add(name);
  const causes = Array.isArray(vulnerability.via) ? vulnerability.via : [];
  if (causes.length === 0) return false;

  return causes.every((via) => {
    if (typeof via === "string") {
      return hasOnlyAllowedAdvisories(
        via,
        vulnerabilities,
        packageLock,
        nextVisiting,
      );
    }
    return Boolean(via?.url && ALLOWED_DEV_ADVISORIES.has(via.url));
  });
}

export function getBlockingVulnerabilities(report, packageLock) {
  const vulnerabilities = report?.vulnerabilities || {};
  return Object.keys(vulnerabilities).filter(
    (name) =>
      !hasOnlyAllowedAdvisories(name, vulnerabilities, packageLock),
  );
}

function runAudit() {
  const packageLockPath = path.resolve(process.cwd(), "package-lock.json");
  const packageLock = JSON.parse(fs.readFileSync(packageLockPath, "utf8"));
  const audit = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["audit", "--json", "--audit-level=high"],
    { encoding: "utf8" },
  );

  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    process.stderr.write(audit.stderr || audit.stdout);
    throw new Error("npm audit did not return a valid JSON report.");
  }

  if (report.error) {
    throw new Error(report.error.summary || report.error.message || "npm audit failed.");
  }

  const blocking = getBlockingVulnerabilities(report, packageLock);
  if (blocking.length > 0) {
    process.stderr.write(
      `Blocking high-severity desktop dependencies: ${blocking.join(", ")}\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (audit.status !== 0) {
    process.stdout.write(
      "Only the allowlisted build-time brace-expansion advisory remains; all affected lockfile nodes are development-only.\n",
    );
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) runAudit();
