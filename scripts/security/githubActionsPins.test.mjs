import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const workflowDirectory = path.join(repositoryRoot, ".github/workflows");
const externalActionPattern = /^\s*uses:\s*([^./\s][^@\s]*)@([^\s#]+)/gm;
const commitShaPattern = /^[0-9a-f]{40}$/;

test("external GitHub Actions are pinned to immutable commit SHAs", () => {
  const failures = [];

  for (const filename of fs.readdirSync(workflowDirectory).sort()) {
    if (!/\.ya?ml$/.test(filename)) continue;
    const workflow = fs.readFileSync(
      path.join(workflowDirectory, filename),
      "utf8",
    );

    for (const match of workflow.matchAll(externalActionPattern)) {
      const [, action, ref] = match;
      if (!commitShaPattern.test(ref)) {
        failures.push(`${filename}: ${action}@${ref}`);
      }
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Mutable GitHub Action references found:\n${failures.join("\n")}`,
  );
});
