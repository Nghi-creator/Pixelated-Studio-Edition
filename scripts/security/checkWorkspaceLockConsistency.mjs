import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repositoryRoot = process.cwd();
const rootLock = readJson("package-lock.json");
const rootPackage = readJson("package.json");

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
  );
}

function declaredDependencies(packageJson) {
  return Object.keys({
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.optionalDependencies,
  }).sort();
}

function resolvedVersion(lock, packagePathCandidates) {
  for (const packagePath of packagePathCandidates) {
    const version = lock.packages?.[packagePath]?.version;
    if (version) return version;
  }
  return null;
}

const failures = [];

for (const workspace of rootPackage.workspaces || []) {
  const workspacePackage = readJson(`${workspace}/package.json`);
  const workspaceLock = readJson(`${workspace}/package-lock.json`);

  for (const dependency of declaredDependencies(workspacePackage)) {
    const rootVersion = resolvedVersion(rootLock, [
      `${workspace}/node_modules/${dependency}`,
      `node_modules/${dependency}`,
    ]);
    const workspaceVersion = resolvedVersion(workspaceLock, [
      `node_modules/${dependency}`,
    ]);

    if (!rootVersion || !workspaceVersion) {
      failures.push(
        `${workspace}: ${dependency} is missing from ${!rootVersion ? "the root" : "the workspace"} lockfile`,
      );
      continue;
    }

    if (rootVersion !== workspaceVersion) {
      failures.push(
        `${workspace}: ${dependency} resolves to ${rootVersion} in the root lockfile and ${workspaceVersion} in the workspace lockfile`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Workspace lockfiles are inconsistent:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    "\nRegenerate the root and package-local lockfiles together before committing.",
  );
  process.exitCode = 1;
} else {
  console.log("Workspace direct dependency resolutions are consistent.");
}
