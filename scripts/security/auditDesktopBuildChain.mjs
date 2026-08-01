import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GLOB_CLI_ADVISORY_ID = "GHSA-5J98-MCP5-4VW2";
const HIGH_SEVERITIES = new Set(["high", "critical"]);

function getGithubAdvisoryId(url) {
  if (typeof url !== "string") return null;
  return (
    url.match(/\/advisories\/(GHSA-[a-z0-9-]+)/i)?.[1]?.toUpperCase() ?? null
  );
}

function isAffectedGlobCliVersion(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return true;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  return (
    (major === 10 && minor >= 2 && minor < 5) ||
    (major === 11 && minor < 1)
  );
}

function resolveLockedPackage(node, packageLock) {
  if (typeof node !== "string") return null;

  const normalizedNode = node.replaceAll("\\", "/");
  const direct = packageLock.packages?.[normalizedNode];
  if (direct) return { node: normalizedNode, package: direct };

  const firstNodeModules = normalizedNode.indexOf("node_modules/");
  if (firstNodeModules < 0) return null;

  const dependencyChain = normalizedNode
    .slice(firstNodeModules + "node_modules/".length)
    .split("/node_modules/");
  const dependencyName = dependencyChain.at(-1);
  if (!dependencyName) return null;

  for (let depth = dependencyChain.length - 2; depth >= 0; depth -= 1) {
    const ancestorChain = dependencyChain.slice(0, depth);
    const candidate =
      ancestorChain.length > 0
        ? `node_modules/${ancestorChain.join(
            "/node_modules/",
          )}/node_modules/${dependencyName}`
        : `node_modules/${dependencyName}`;
    const lockedPackage = packageLock.packages?.[candidate];
    if (lockedPackage) {
      return { node: candidate, package: lockedPackage };
    }
  }

  return null;
}

function isAllowedDirectAdvisory(via, vulnerability, packageLock) {
  const advisoryId = getGithubAdvisoryId(via?.url);
  if (advisoryId !== GLOB_CLI_ADVISORY_ID) {
    return false;
  }

  const nodes = Array.isArray(vulnerability?.nodes)
    ? vulnerability.nodes
    : [];
  return (
    nodes.length > 0 &&
    nodes.every((node) => {
      const lockedVersion = resolveLockedPackage(
        node,
        packageLock,
      )?.package?.version;
      return (
        typeof lockedVersion === "string" &&
        !isAffectedGlobCliVersion(lockedVersion)
      );
    })
  );
}

function isDevelopmentOnly(vulnerability, packageLock) {
  const nodes = Array.isArray(vulnerability?.nodes)
    ? vulnerability.nodes
    : [];
  return (
    nodes.length > 0 &&
    nodes.every(
      (node) =>
        resolveLockedPackage(node, packageLock)?.package?.dev === true,
    )
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
    return isAllowedDirectAdvisory(via, vulnerability, packageLock);
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
        ).map((via) => ({ via, vulnerability }))
      : [],
  );

  // npm occasionally omits or truncates the `via`/`effects` links on
  // meta-vulnerabilities. If every direct high-severity leaf is an explicitly
  // accepted false positive, parent entries are safe to classify by
  // their lockfile scope instead of depending on those unstable links.
  if (
    directAdvisories.length > 0 &&
    directAdvisories.every(({ via, vulnerability }) =>
      isAllowedDirectAdvisory(via, vulnerability, packageLock),
    )
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
    for (const name of blocking) {
      const vulnerability = report.vulnerabilities?.[name];
      const causes = Array.isArray(vulnerability?.via)
        ? vulnerability.via.map((via) => {
            if (typeof via === "string") return via;
            return (
              getGithubAdvisoryId(via?.url) ||
              via?.dependency ||
              via?.name ||
              "unidentified"
            );
          })
        : [];
      const lockedNodes = Array.isArray(vulnerability?.nodes)
        ? vulnerability.nodes.map((node) => {
            const resolution = resolveLockedPackage(node, packageLock);
            const resolutionSuffix =
              resolution && resolution.node !== node
                ? `->${resolution.node}`
                : "";
            return `${node}${resolutionSuffix}@${
              resolution?.package?.version || "unknown"
            }:${
              resolution?.package?.dev === true ? "dev" : "non-dev"
            }`;
          })
        : [];
      process.stderr.write(
        `  ${name}: causes=${causes.join("|") || "none"} nodes=${
          lockedNodes.join("|") || "none"
        }\n`,
      );
    }
    process.exitCode = 1;
    return;
  }

  if (audit.status !== 0) {
    process.stdout.write(
      "Only explicitly allowlisted build-time advisories remain; all affected lockfile nodes are development-only.\n",
    );
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) runAudit();
