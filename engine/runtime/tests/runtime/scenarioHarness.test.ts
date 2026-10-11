import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import fs from "node:fs";

test("N5 bounded lifecycle, ownership journal and recovery regressions pass", () => {
  const result = spawnSync(
    "python3",
    ["-m", "unittest", "discover", "-s", "tests/python", "-p", "test_scenario_*.py", "-v"],
    { cwd: process.cwd(), encoding: "utf8", timeout: 30000 },
  );
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran \d+ tests/);
});


test("both runtime images ship the opted-in scenario harness and recording control", () => {
  for (const name of ["Dockerfile", "Dockerfile.native"]) {
    const source = fs.readFileSync(name, "utf8");
    assert.match(source, /COPY scenario_harness \/app\/scenario_harness/);
    assert.match(source, /COPY camera\.py[^\n]*camera_trace_control\.py[^\n]* \/app\//);
  }
});
