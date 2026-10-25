import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

test("N10 inventory and isolated experiment boundaries pass without Gst or a camera", () => {
  const result = spawnSync(
    "python3",
    ["-m", "unittest", "discover", "-s", "tests/python", "-p", "test_live_probe_*.py", "-v"],
    { cwd: process.cwd(), encoding: "utf8", timeout: 30000 },
  );
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran \d+ tests/);
});

test("both runtime images ship the explicit N10 tools", () => {
  for (const name of ["Dockerfile", "Dockerfile.native"]) {
    const recipe = fs.readFileSync(name, "utf8");
    assert.match(recipe, /COPY private_journal\.py \/app\//);
    assert.match(recipe, /COPY live_probe_control \/app\/live_probe_control/);
    assert.match(recipe, /COPY live_probe_inventory\.py live_probe_trial\.py live_probe_cadence_trial\.py \/app\//);
  }
});
