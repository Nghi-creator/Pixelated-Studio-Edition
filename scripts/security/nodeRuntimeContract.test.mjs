import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { requiredChecks } from "./dependabotMergePolicy.mjs";
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
      assert.match(workflow, /node-version: \$\{\{ matrix\.node \}\}/);
      const matrix = workflow.match(/node:\s*\[([^\]]+)\]/)?.[1]
        .split(",").map(value => value.trim().replaceAll('"', ""));
      assert.deepEqual(matrix, [nodeVersion, "26"]);
      continue;
    }
    assert.match(workflow, /node-version-file: \.nvmrc/);
    assert.doesNotMatch(workflow, /\bnode-version:\s/);
  }
});

test("safe merge quality checks track the production Node pin", () => {
  assert.ok(requiredChecks.includes(`Node ${nodeVersion} / Linux regression suite`));
  assert.ok(requiredChecks.includes("Node 26 / Linux regression suite"));
});
