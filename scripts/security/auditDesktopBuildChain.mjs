import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_DEV_ADVISORY_IDS = new Set(["GHSA-MH99-V99M-4GVG"]);
const HIGH_SEVERITIES = new Set(["high", "critical"]);

function getGithubAdvisoryId(url) {
  if (typeof url !== "string") return null;
  return (
    url.match(/\/advisories\/(GHSA-[a-z0-9-]+)/i)?.[1]?.toUpperCase() ?? null
  );
}

function isAllowedDirectAdvisory(via) {
  const advisoryId = getGithubAdvisoryId(via?.url);
  return advisoryId !== null && ALLOWED_DEV_ADVISORY_IDS.has(advisoryId);
}

function isDevelopmentOnly(vulnerability, packageLock) {
  const nodes = Array.isArray(vulnerability?.nodes)
    ? vulnerability.nodes
    : [];
  return (
    nodes.length > 0 &&
    nodes.every((node) => packageLock.packages?.[node]?.dev === true)
  );
}

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

  if (!isDevelopmentOnly(vulnerability, packageLock)) {
    return false;
  }

  const nextVisiting = new Set(visiting);
  nextVisiting.add(name);
  const causes = Array.isArray(vulnerability.via) ? vulnerability.via : [];
  if (causes.length === 0) {
    return Object.entries(vulnerabilities).some(
      ([causeName, cause]) =>
        Array.isArray(cause?.effects) &&
        cause.effects.includes(name) &&
        hasOnlyAllowedAdvisories(
          causeName,
          vulnerabilities,
          packageLock,
          nextVisiting,
        ),
    );
  }

  return causes.every((via) => {
    if (typeof via === "string") {
      return hasOnlyAllowedAdvisories(
        via,
        vulnerabilities,
        packageLock,
        nextVisiting,
      );
    }
    if (typeof via?.url !== "string") {
      const dependencyName = via?.dependency || via?.name;
      return (
        typeof dependencyName === "string" &&
        dependencyName !== name &&
        hasOnlyAllowedAdvisories(
          dependencyName,
          vulnerabilities,
          packageLock,
          nextVisiting,
        )
      );
    }
    return isAllowedDirectAdvisory(via);
  });
}

export function getBlockingVulnerabilities(report, packageLock) {
  const vulnerabilities = report?.vulnerabilities || {};
  const highVulnerabilities = Object.values(vulnerabilities).filter(
    (vulnerability) => HIGH_SEVERITIES.has(vulnerability?.severity),
  );
  const directAdvisories = highVulnerabilities.flatMap((vulnerability) =>
    Array.isArray(vulnerability?.via)
      ? vulnerability.via.filter(
          (via) =>
            typeof via !== "string" && typeof via?.url === "string",
        )
      : [],
  );

  // npm occasionally omits or truncates the `via`/`effects` links on
  // meta-vulnerabilities. If every direct high-severity leaf is the one
  // explicitly accepted advisory, parent entries are safe to classify by
  // their lockfile scope instead of depending on those unstable links.
  if (
    directAdvisories.length > 0 &&
    directAdvisories.every(isAllowedDirectAdvisory)
  ) {
    return Object.entries(vulnerabilities)
      .filter(([, vulnerability]) =>
        HIGH_SEVERITIES.has(vulnerability?.severity),
      )
      .filter(
        ([, vulnerability]) =>
          !isDevelopmentOnly(vulnerability, packageLock),
      )
      .map(([name]) => name);
  }

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
