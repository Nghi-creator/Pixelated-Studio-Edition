import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import fs from "node:fs";

test("N5 bounded lifecycle, ownership journal and recovery regressions pass", () => {
  const result = spawnSync(
    "python3",
    ["-m", "unittest", "discover", "-s", "tests/python/scenarios", "-t", "tests/python", "-p", "test_scenario_*.py", "-v"],
    { cwd: process.cwd(), encoding: "utf8", timeout: 30000 },
  );
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran \d+ tests/);
});


test("both runtime images ship the opted-in scenario harness and recording control", () => {
  for (const name of ["Dockerfile", "Dockerfile.native"]) {
    const source = fs.readFileSync(name, "utf8");
    assert.match(source, /COPY research \/app\/research/);
    assert.ok(fs.existsSync("research/scenario_harness/camera_runtime.py"));
    assert.ok(fs.existsSync("research/tracing/camera_trace_control.py"));
  }
});
