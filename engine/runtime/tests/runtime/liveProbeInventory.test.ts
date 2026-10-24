import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

test("N10 read-only inventory boundaries pass without Gst or a running camera", () => {
  const result = spawnSync(
    "python3",
    ["-m", "unittest", "discover", "-s", "tests/python", "-p", "test_live_probe_*.py", "-v"],
    { cwd: process.cwd(), encoding: "utf8", timeout: 30000 },
  );
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran \d+ tests/);
});

test("both runtime images ship the standalone inspector", () => {
  for (const name of ["Dockerfile", "Dockerfile.native"]) {
    assert.match(fs.readFileSync(name, "utf8"), /COPY live_probe_inventory\.py \/app\//);
  }
});
