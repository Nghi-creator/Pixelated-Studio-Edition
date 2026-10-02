import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { evaluatePull } from "./dependabotAutomerge.mjs";
import {
  repository, allowedTypes, requiredChecks, desktopChecks, validatePull, validateChanges,
  validateRelease, validateRules, validateChecks,
} from "./dependabotMergePolicy.mjs";

const sha = "a".repeat(40);
const base = "b".repeat(40);
const integrity = `sha512-${Buffer.alloc(64, 1).toString("base64")}`;
const pull = () => ({
  user: { login: "dependabot[bot]", type: "Bot" }, state: "open", draft: false,
  head: { repo: { full_name: repository }, ref: "dependabot/npm_and_yarn/npm-types-patches-123abc", sha },
  base: { repo: { full_name: repository }, ref: "main", sha: base },
  commits: 1, changed_files: 1, mergeable: true, mergeable_state: "clean",
});
const rules = () => [{ type: "pull_request" }, { type: "required_status_checks", parameters: {
  strict_required_status_checks_policy: true,
  required_status_checks: requiredChecks.map(context => ({ context, integration_id: 15368 })),
} }];
const checks = names => names.map((name, id) => ({ id, name, app: { id: 15368 }, status: "completed", conclusion: "success" }));
const record = version => ({ version, resolved: `https://registry.npmjs.org/@types/node/-/node-${version}.tgz`, integrity, dev: true });
const lock = version => ({ lockfileVersion: 3, packages: { "": { name: "fixture" }, "node_modules/@types/node": record(version) } });
const changes = () => [{ filename: "apps/web/package-lock.json", status: "modified", before: lock("24.1.1"), after: lock("24.1.2") }];
const metadata = () => ({ time: { "24.1.2": "2020-01-01T00:00:00Z" }, versions: { "24.1.2": { dist: { integrity } } } });

test("only same-repository routine Dependabot group PRs qualify", () => {
  validatePull(pull());
  for (const change of [
    p => { p.user.login = "someone"; }, p => { p.user.type = "User"; },
    p => { p.head.repo.full_name = "attacker/fork"; }, p => { p.base.ref = "dev-branch"; },
    p => { p.draft = true; }, p => { p.state = "closed"; },
    p => { p.head.ref = "dependabot/npm_and_yarn/npm-security-123abc"; },
    p => { p.head.ref = "dependabot/npm_and_yarn/electron-40.0.0"; },
  ]) { const p = pull(); change(p); assert.throws(() => validatePull(p)); }
});

test("allows only type patches with unchanged dependency graphs", () => {
  assert.equal(validateChanges(changes())[0].version, "24.1.2");
  for (const change of [
    f => { f.filename = ".github/workflows/evil.yml"; },
    f => { f.status = "added"; },
    f => { f.after.packages["node_modules/@types/node"] = record("24.2.0"); },
    f => { f.after.packages["node_modules/@types/node"] = record("25.0.0"); },
    f => { f.after.packages["node_modules/@types/node"] = record("24.1.0"); },
    f => { f.after.packages["node_modules/@types/node"].hasInstallScript = true; },
    f => { f.after.packages["node_modules/@types/node"].dependencies = { evil: "1.0.0" }; },
    f => { f.after.packages["node_modules/@types/node"].resolved = "https://attacker.test/package.tgz"; },
    f => { f.after.packages["node_modules/electron"] = { version: "40.0.0" }; },
    f => { delete f.after.packages[""]; },
    f => { f.after.name = "changed"; },
    f => { for (const tree of [f.before, f.after]) { tree.packages["node_modules/engine.io"] = tree.packages["node_modules/@types/node"]; delete tree.packages["node_modules/@types/node"]; } },
  ]) { const f = changes(); change(f[0]); assert.throws(() => validateChanges(f)); }
});

test("manifest changes cannot smuggle scripts, production updates, range widening, or new packages", () => {
  const before = { devDependencies: { "@types/node": "^24.1.1" }, scripts: { test: "node --test" } };
  const manifest = () => ({ filename: "apps/web/package.json", status: "modified", before,
    after: { ...structuredClone(before), devDependencies: { "@types/node": "^24.1.2" } } });
  validateChanges([...changes(), manifest()]);
  for (const change of [
    f => { f.after.scripts.test = "evil"; },
    f => { f.after.dependencies = { "@types/node": "24.1.2" }; },
    f => { f.after.devDependencies["@types/node"] = "*"; },
    f => { f.after.devDependencies["@types/node"] = "~24.1.2"; },
    f => { f.after.devDependencies["@types/react"] = "19.1.2"; },
  ]) { const f = manifest(); change(f); assert.throws(() => validateChanges([...changes(), f])); }
});

test("registry age, integrity, and executable package metadata fail closed", () => {
  const release = validateChanges(changes())[0];
  const now = Date.parse("2020-01-08T00:00:00Z");
  validateRelease(release, metadata(), now);
  assert.throws(() => validateRelease(release, metadata(), now - 1));
  for (const change of [
    m => { m.time = {}; }, m => { m.versions["24.1.2"].dist.integrity = "bad"; },
    m => { m.versions["24.1.2"].deprecated = "unsafe"; },
    m => { m.versions["24.1.2"].scripts = { postinstall: "evil" }; },
    m => { m.versions["24.1.2"].bin = "evil"; },
  ]) { const m = metadata(); change(m); assert.throws(() => validateRelease(release, m, now)); }
});

test("requires strict rules and successful checks from GitHub Actions", () => {
  validateRules(rules());
  for (const change of [
    r => { r.shift(); }, r => { r[1].parameters.strict_required_status_checks_policy = false; },
    r => { r[1].parameters.required_status_checks.pop(); },
    r => { r[1].parameters.required_status_checks[0].integration_id = null; },
  ]) { const r = rules(); change(r); assert.throws(() => validateRules(r)); }
  validateChecks(checks(requiredChecks), ["apps/web/package-lock.json"]);
  assert.throws(() => validateChecks(checks(requiredChecks), ["apps/desktop/package-lock.json"]));
  validateChecks(checks([...requiredChecks, ...desktopChecks]), ["engine/runtime/package-lock.json"]);
  for (const conclusion of ["failure", "cancelled", "skipped", "neutral", null]) {
    const runs = checks(requiredChecks); runs[0].conclusion = conclusion;
    assert.throws(() => validateChecks(runs, []));
  }
  const forged = checks(requiredChecks); forged[0].app.id = 999;
  assert.throws(() => validateChecks(forged, []));
  const stale = checks(requiredChecks);
  stale.push({ ...stale[0], id: 999, status: "in_progress", conclusion: null });
  assert.throws(() => validateChecks(stale, []));
});

function fixture({ mutateFresh, mutateCommit, mutateRules, mutateChecks, mergeResult = { merged: true } } = {}) {
  const writes = [];
  let reads = 0;
  const api = async (route, options = {}) => {
    if (options.method === "PUT") { writes.push({ route, ...options }); return mergeResult; }
    if (route.endsWith("/pulls/1")) { const p = pull(); if (++reads > 1) mutateFresh?.(p); return p; }
    if (route.endsWith("/rules/branches/main")) { const r = rules(); mutateRules?.(r); return r; }
    if (route.endsWith("/commits")) {
      const c = { author: { login: "dependabot[bot]" }, commit: { verification: { verified: true } } };
      mutateCommit?.(c); return [c];
    }
    if (route.endsWith("/files")) return changes().map(({ filename, status }) => ({ filename, status }));
    if (route.includes("/contents/")) return { encoding: "base64", content: Buffer.from(JSON.stringify(lock(route.endsWith(sha) ? "24.1.2" : "24.1.1"))).toString("base64") };
    if (route.endsWith("/check-runs")) { const c = checks(requiredChecks); mutateChecks?.(c); return c; }
    throw new Error(`Unexpected test API route: ${route}`);
  };
  return { api, writes, registry: async () => metadata(), number: 1, expectedHead: sha };
}

test("dry run never writes; eligible merge atomically pins the validated head", async () => {
  const f = fixture();
  assert.match(await evaluatePull(f), /dry run/);
  assert.equal(f.writes.length, 0);
  await evaluatePull({ ...f, dryRun: false });
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.writes[0].body, { sha, merge_method: "squash" });
});

test("stale heads, failing checks, weak protections, unsigned commits, and races never merge", async () => {
  for (const options of [
    { mutateFresh: p => { p.head.sha = "c".repeat(40); } },
    { mutateFresh: p => { p.base.sha = "c".repeat(40); } },
    { mutateFresh: p => { p.mergeable_state = "blocked"; } },
    { mutateCommit: c => { c.commit.verification.verified = false; } },
    { mutateCommit: c => { c.author.login = "someone"; } },
    { mutateRules: r => { r.pop(); } },
    { mutateChecks: c => { c[0].conclusion = "failure"; } },
  ]) {
    const f = fixture(options);
    await assert.rejects(evaluatePull({ ...f, dryRun: false }));
    assert.equal(f.writes.length, 0);
  }
  const f = fixture();
  await assert.rejects(evaluatePull({ ...f, expectedHead: "d".repeat(40), dryRun: false }));
  assert.equal(f.writes.length, 0);
});

test("GitHub merge refusal is reported and never retried", async () => {
  const f = fixture({ mergeResult: { merged: false } });
  await assert.rejects(evaluatePull({ ...f, dryRun: false }), /did not merge/);
  assert.equal(f.writes.length, 1);
});

test("Dependabot groups, cooldown, and privileged workflow remain aligned", () => {
  const yaml = createRequire(import.meta.url)("js-yaml");
  const config = yaml.load(fs.readFileSync(new URL("../../.github/dependabot.yml", import.meta.url), "utf8"));
  const npm = config.updates.find(update => update["package-ecosystem"] === "npm");
  assert.equal(npm.cooldown["default-days"], 7);
  const group = npm.groups["npm-types-patches"];
  assert.deepEqual(new Set(group.patterns), allowedTypes);
  assert.equal(group["applies-to"], "version-updates");
  assert.equal(group["dependency-type"], "development");
  assert.deepEqual(group["update-types"], ["patch"]);
  assert.ok(Object.keys(npm.groups).indexOf("npm-types-patches") < Object.keys(npm.groups).indexOf("npm-development-minor-patch"));
  const workflow = yaml.load(fs.readFileSync(new URL("../../.github/workflows/dependabot-automerge.yml", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(workflow.on).sort(), ["workflow_dispatch", "workflow_run"]);
  assert.deepEqual(workflow.permissions, {});
  const checkout = workflow.jobs.merge.steps[0];
  assert.equal(checkout.with.ref, "${{ github.sha }}");
  assert.equal(checkout.with["persist-credentials"], false);
  assert.match(workflow.jobs.merge.if, /DEPENDABOT_AUTOMERGE_ENABLED == 'true'/);
  for (const file of ["hosted-api-deploy-gate.yml", "security-scan.yml", "desktop-release-validation.yml"]) {
    const source = yaml.load(fs.readFileSync(new URL(`../../.github/workflows/${file}`, import.meta.url), "utf8"));
    assert.ok(workflow.on.workflow_run.workflows.includes(source.name));
  }
});
