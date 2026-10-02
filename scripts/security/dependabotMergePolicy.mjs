import { isDeepStrictEqual as equal } from "node:util";

export const repository = "Nghi-creator/Pixelated-Studio-Edition";
export const allowedTypes = new Set([
  "@types/node", "@types/react", "@types/react-dom", "@types/qrcode",
  "@types/cors", "@types/express", "@types/multer",
]);
export const directories = ["", "apps/web/", "apps/desktop/", "services/api/", "engine/runtime/"];
export const requiredChecks = [
  "API contract", "Hosted web and smoke contract",
  ...[["root", "."], ["web", "apps/web"], ["desktop", "apps/desktop"],
    ["api", "services/api"], ["engine-runtime", "engine/runtime"]]
    .map(([label, dir]) => `npm audit production dependencies (${label}, ${dir})`),
  "Secret pattern scan", "Engine image security (libretro)", "Engine image security (native)", "CodeQL",
];
export const desktopChecks = ["macOS DMG", "Windows NSIS", "Ubuntu AppImage"];
export function requirePolicy(condition, reason) {
  if (!condition) throw new Error(reason);
}

export function validatePull(pr) {
  requirePolicy(pr.user?.login === "dependabot[bot]" && pr.user?.type === "Bot", "Not a Dependabot PR");
  requirePolicy(pr.state === "open" && !pr.draft, "PR is closed or draft");
  requirePolicy(pr.head?.repo?.full_name === repository && pr.base?.repo?.full_name === repository &&
    pr.base.ref === "main", "Unexpected repository or target branch");
  requirePolicy(/^dependabot\/npm_and_yarn\/(?:.*\/)?npm-types-patches-[a-z0-9]+$/.test(pr.head.ref),
    "Not the routine npm-types-patches group");
  requirePolicy(/^[a-f0-9]{40}$/.test(pr.head.sha) && /^[a-f0-9]{40}$/.test(pr.base.sha), "Missing commit SHA");
}

export function patchUpgrade(before, after, range = false) {
  const pattern = range ? /^([~^]?)(\d+)\.(\d+)\.(\d+)$/ : /^()(\d+)\.(\d+)\.(\d+)$/;
  const old = pattern.exec(before);
  const next = pattern.exec(after);
  return !!old && !!next && old[1] === next[1] && old[2] === next[2] && old[3] === next[3] &&
    Number(next[4]) > Number(old[4]);
}

function validateManifest(before, after) {
  const old = structuredClone(before);
  const next = structuredClone(after);
  for (const name of allowedTypes) {
    const a = old.devDependencies?.[name];
    const b = next.devDependencies?.[name];
    if (a === b) continue;
    requirePolicy(typeof a === "string" && typeof b === "string" && patchUpgrade(a, b, true),
      "Manifest change is not an allowed development patch");
    next.devDependencies[name] = a;
  }
  requirePolicy(equal(old, next), "Manifest has other changes");
}

// Compare parsed data only; never load code or dependencies from the PR.
export function validateChanges(files) {
  requirePolicy(files.length > 0 && files.length <= 10, "Unexpected changed-file count");
  const releases = new Map();
  for (const { filename, status, before, after } of files) {
    requirePolicy(status === "modified" && directories.some(dir =>
      filename === `${dir}package.json` || filename === `${dir}package-lock.json`), "Unexpected changed file");
    if (filename.endsWith("/package.json") || filename === "package.json") {
      validateManifest(before, after);
      continue;
    }
    requirePolicy(before.lockfileVersion === 3 && after.lockfileVersion === 3 && before.packages && after.packages,
      "Expected npm lockfile v3");
    const normalized = structuredClone(after);
    requirePolicy(equal(Object.keys(before.packages).sort(), Object.keys(after.packages).sort()),
      "Lockfile adds or removes packages");
    for (const [key, old] of Object.entries(before.packages)) {
      const next = after.packages[key];
      if (equal(old, next)) continue;
      if (key === "" || directories.includes(`${key}/`)) {
        validateManifest(old, next);
      } else {
        const name = key.split("node_modules/").at(-1);
        requirePolicy(allowedTypes.has(name) && patchUpgrade(old.version, next.version),
          "Lockfile changes a package outside the patch allowlist");
        const rest = structuredClone(next);
        for (const field of ["version", "resolved", "integrity"]) rest[field] = old[field];
        requirePolicy(equal(old, rest), "Package metadata or dependency graph changed");
        const leaf = name.split("/")[1];
        requirePolicy(next.resolved === `https://registry.npmjs.org/${name}/-/${leaf}-${next.version}.tgz` &&
          /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(next.integrity), "Unexpected package source or integrity");
        const release = { name, version: next.version, integrity: next.integrity };
        const id = `${name}@${next.version}`;
        requirePolicy(!releases.has(id) || equal(releases.get(id), release), "Conflicting package integrity");
        releases.set(id, release);
      }
      normalized.packages[key] = old;
    }
    requirePolicy(equal(before, normalized), "Other lockfile metadata changed");
  }
  requirePolicy(releases.size > 0, "No allowed package version changed");
  return [...releases.values()];
}

export function validateRelease(release, metadata, now = Date.now()) {
  const published = Date.parse(metadata.time?.[release.version]);
  requirePolicy(Number.isFinite(published) && now - published >= 7 * 24 * 60 * 60 * 1000,
    "Release has not completed its seven-day cooldown");
  const version = metadata.versions?.[release.version];
  requirePolicy(version?.dist?.integrity === release.integrity && !version.deprecated &&
    !version.scripts && !version.bin, "Registry integrity or package metadata is unsuitable");
}

export function validateRules(rules) {
  requirePolicy(rules.some(rule => rule.type === "pull_request"), "Pull requests must be enforced on main");
  const enforced = new Set(rules.filter(rule => rule.type === "required_status_checks" &&
    rule.parameters?.strict_required_status_checks_policy === true)
    .flatMap(rule => rule.parameters.required_status_checks)
    .filter(check => check.integration_id === 15368).map(check => check.context));
  const missing = requiredChecks.filter(name => !enforced.has(name));
  requirePolicy(!missing.length, `Missing strict GitHub Actions required checks: ${missing.join(", ")}`);
}

export function validateChecks(checks, filenames) {
  const expected = [...requiredChecks];
  if (filenames.some(file => /^(apps\/desktop|engine\/runtime)\//.test(file))) expected.push(...desktopChecks);
  for (const name of expected) {
    const runs = checks.filter(check => check.name === name && check.app?.id === 15368)
      .sort((a, b) => b.id - a.id);
    requirePolicy(runs[0]?.status === "completed" && runs[0]?.conclusion === "success", `Check not passing: ${name}`);
  }
}
