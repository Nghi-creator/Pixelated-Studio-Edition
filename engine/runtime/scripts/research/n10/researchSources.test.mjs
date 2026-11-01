import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { researchSourceFiles } from "./researchSources.mjs";

test("custody inventory includes nested runtime and harness sources but excludes bytecode", async () => {
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), "research-sources-"));
  try {
    const expected = ["camera.py", "research/live_probe_control/control/controller.py",
      "research/scenario_harness/lease.py", "scripts/research/n10/trial.mjs"].sort();
    for (const relative of [...expected, "research/__pycache__/controller.pyc", "scripts/research/n10/receipt.json"]) {
      const file = path.join(runtime, relative);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, "fixture");
    }
    assert.deepEqual(await researchSourceFiles(runtime), expected);
  } finally {
    await fs.rm(runtime, { recursive: true, force: true });
  }
});

test("frozen game-browser source bindings resolve to unique current files", async () => {
  const { GAME_BROWSER_SOURCES } = await import("./researchSources.mjs");
  const runtime = new URL("../../../", import.meta.url);
  assert.ok(Object.keys(GAME_BROWSER_SOURCES).length <= 32);
  assert.equal(new Set(Object.values(GAME_BROWSER_SOURCES)).size, Object.keys(GAME_BROWSER_SOURCES).length);
  for (const [name, relative] of Object.entries(GAME_BROWSER_SOURCES)) {
    assert.match(name, /^(?:private_journal\.py|live_probe_control\/[a-z_]+\.py|scripts\/n10\/[A-Za-z]+\.mjs)$/);
    assert.ok((await fs.stat(new URL(relative, runtime))).isFile(), relative);
  }
});
