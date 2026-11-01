import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("both runtime images ship the explicit N10 tools", () => {
  for (const name of ["Dockerfile", "Dockerfile.native"]) {
    const recipe = fs.readFileSync(name, "utf8");
    assert.match(recipe, /COPY research \/app\/research/);
    for (const relative of ["research/private_journal.py", "research/live_probe_control/control/controller.py", "research/trials/live_probe_inventory.py", "research/trials/live_probe_trial.py", "research/trials/live_probe_cadence_trial.py"]) {
      assert.ok(fs.existsSync(relative), relative);
    }
  }
});
