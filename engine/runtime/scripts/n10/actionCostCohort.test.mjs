import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ACTION_COST_ORDER, ACTION_COST_ORDER_V2, runActionCostCohort } from "./actionCostCohort.mjs";

const image = `sha256:${"a".repeat(64)}`;

test("action cohort requires an immutable image and absolute exclusive output", async () => {
  await assert.rejects(runActionCostCohort("latest", "/tmp/unused-n10-output.json"), /cached image/);
  await assert.rejects(runActionCostCohort(image, "relative.json"), /absolute exclusive output/);
  await assert.rejects(runActionCostCohort(image, "/tmp/unused-n10-output.json", "latest"), /closed action-cost protocol/);
  assert.equal(Object.isFrozen(ACTION_COST_ORDER), true);
  assert.equal(Object.isFrozen(ACTION_COST_ORDER_V2), true);
  assert.deepEqual(ACTION_COST_ORDER_V2, ACTION_COST_ORDER.map((mode) => mode + "-v2"));
  assert.deepEqual(ACTION_COST_ORDER, ["unchanged", "action", "action", "unchanged", "unchanged", "action"].map((s) => `engineering-game-${s}-cost`));
});

test("action cohort cannot overwrite an earlier acquisition", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "n10-action-cohort-test-"));
  const file = path.join(directory, "retained.json");
  try {
    await fs.writeFile(file, "original failed acquisition");
    await assert.rejects(runActionCostCohort(image, file), { code: "EEXIST" });
    assert.equal(await fs.readFile(file, "utf8"), "original failed acquisition");
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
