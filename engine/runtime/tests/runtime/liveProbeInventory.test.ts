import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

test("N10 inventory and isolated experiment boundaries pass without Gst or a camera", () => {
  const result = spawnSync(
    "python3",
    ["-m", "unittest", "discover", "-s", "tests/python/live_probes", "-t", "tests/python", "-p", "test_live_probe_*.py", "-v"],
    { cwd: process.cwd(), encoding: "utf8", timeout: 30000 },
  );
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran \d+ tests/);
});

test("both runtime images ship the explicit N10 tools", () => {
  for (const name of ["Dockerfile", "Dockerfile.native"]) {
    const recipe = fs.readFileSync(name, "utf8");
    assert.match(recipe, /COPY research \/app\/research/);
    for (const relative of ["research/private_journal.py", "research/live_probe_control/control/controller.py", "research/trials/live_probe_inventory.py", "research/trials/live_probe_trial.py", "research/trials/live_probe_cadence_trial.py"]) {
      assert.ok(fs.existsSync(relative), relative);
    }
  }
});


test("N10 isolated browser driver arguments and resource counters fail closed", () => {
  const result = spawnSync(process.execPath, ["--test", "scripts/research/n10/gameBrowserTrial.test.mjs"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 10000,
  });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
