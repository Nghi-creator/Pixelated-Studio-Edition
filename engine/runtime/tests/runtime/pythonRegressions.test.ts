import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("all Python research regressions are discovered, including qualification", () => {
  const result = spawnSync(
    "python3",
    ["-m", "unittest", "discover", "-s", "tests/python", "-v"],
    { cwd: process.cwd(), encoding: "utf8", timeout: 120000 },
  );
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran [1-9]\d* tests/);
});
