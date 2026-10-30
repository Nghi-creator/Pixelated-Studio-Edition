import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { requiredChecks } from "./dependabotMergePolicy.mjs";
const require = createRequire(new URL("../../services/api/package.json", import.meta.url));
const yaml = require("js-yaml");
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const nodeVersion = fs
  .readFileSync(path.join(repositoryRoot, ".nvmrc"), "utf8")
  .trim();
test("CI and production packages share the Node 24 runtime contract", () => {
  assert.match(nodeVersion, /^24\.\d+\.\d+$/);
  for (const packagePath of [
    "services/api/package.json",
    "engine/runtime/package.json",
  ]) {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, packagePath), "utf8"));
    const minimumMajor = packageJson.engines.node.match(/^>=(\d+)/)?.[1];
    assert.equal(nodeVersion.split(".")[0], minimumMajor);
  }
  const workflowDir = path.join(repositoryRoot, ".github/workflows");
  for (const entry of fs.readdirSync(workflowDir)) {
    if (!entry.endsWith(".yml"))
      continue;
    const workflow = fs.readFileSync(path.join(workflowDir, entry), "utf8");
    if (!workflow.includes("actions/setup-node"))
      continue;
    if (entry === "quality.yml") {
      // The default production lane stays pinned; a separate lane checks the
      // other supported major without changing deploy/runtime selection.
      const quality = yaml.load(workflow).jobs.quality;
      assert.equal(quality.name, "${{ matrix.label }} / Linux regression suite");
      assert.deepEqual(quality.strategy.matrix.include, [
        { label: "Node 24", "node-version-file": ".nvmrc" },
        { label: "Node 26", "node-version": 26 },
      ]);
      const setup = quality.steps.find(step => step.uses?.startsWith("actions/setup-node@"));
      assert.equal(setup.with["node-version"], "${{ matrix.node-version }}");
      assert.equal(setup.with["node-version-file"], "${{ matrix.node-version-file }}");
      continue;
    }
    assert.match(workflow, /node-version-file: \.nvmrc/);
    assert.doesNotMatch(workflow, /\bnode-version:\s/);
  }
});

test("safe merge quality check names stay stable across production patch updates", () => {
  assert.ok(requiredChecks.includes("Node 24 / Linux regression suite"));
  assert.ok(requiredChecks.includes("Node 26 / Linux regression suite"));
});

test("legacy required context fails closed unless the complete matrix succeeds", () => {
  const workflow = yaml.load(fs.readFileSync(path.join(repositoryRoot, ".github/workflows/quality.yml"), "utf8"));
  const gate = workflow.jobs["required-quality-compatibility"];
  assert.equal(gate.name, "Node 24.18.0 / Linux regression suite");
  assert.ok(requiredChecks.includes(gate.name));
  assert.equal(gate.needs, "quality");
  assert.equal(gate.if, "always()");
  const step = gate.steps[0];
  assert.equal(step.env.QUALITY_RESULT, "${{ needs.quality.result }}");
  for (const result of ["success", "failure", "cancelled", "skipped", ""]) {
    const execution = spawnSync("sh", ["-c", step.run], {
      env: { ...process.env, QUALITY_RESULT: result },
    });
    assert.equal(execution.status === 0, result === "success", result);
  }
});
