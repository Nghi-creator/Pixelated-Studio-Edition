import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
type PackageJson = {
  scripts?: Record<string, string>;
};
const packageJson = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as PackageJson;
const hostedPredeploy = readFileSync(new URL("../../../scripts/hostedPredeploy.mjs", import.meta.url), "utf8");
test("hosted predeploy includes schema/policy checks and reports all failures", () => {
  const scripts = packageJson.scripts || {};
  assert.match(scripts["check:submission-cleanup-policy"] || "", /--submission-cleanup-policy-only/);
  assert.match(scripts["check:catalog-rpc"] || "", /--catalog-rpc-only/);
  assert.equal(scripts["predeploy:hosted"], "node scripts/hostedPredeploy.mjs");
  for (const check of [
    "check:access-log-schema",
    "check:submission-cleanup-policy",
    "check:catalog-rpc",
    "check:catalog-candidate-imports",
    "typecheck",
    "typecheck:tooling",
    "lint",
    "build",
  ]) {
    assert.match(hostedPredeploy, new RegExp(`"${check}"`));
  }
  assert.match(hostedPredeploy, /Hosted predeploy failed checks:/);
});
