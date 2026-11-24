import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { researchSourceFiles, nativeResearchMounts, nativeSoftwareIdentity } from "./researchSources.mjs";

test("custody inventory includes nested runtime and harness sources but excludes bytecode", async () => {
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), "research-sources-"));
  try {
    const expected = ["camera.py", "research/live_probe_control/control/controller.py",
      "research/scenario_harness/lease.py", "scripts/research/n10/trial.mjs",
      "scripts/research/n11/native/condition_observation.py",
      "scripts/research/n11/acquisition/conditionObservation.mjs"].sort();
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
  const runtime = new URL("../../../../", import.meta.url);
  assert.ok(Object.keys(GAME_BROWSER_SOURCES).length <= 32);
  assert.equal(new Set(Object.values(GAME_BROWSER_SOURCES)).size, Object.keys(GAME_BROWSER_SOURCES).length);
  for (const [name, relative] of Object.entries(GAME_BROWSER_SOURCES)) {
    assert.match(name, /^(?:private_journal\.py|live_probe_control\/[a-z_]+\.py|scripts\/n10\/[A-Za-z]+\.mjs)$/);
    assert.ok((await fs.stat(new URL(relative, runtime))).isFile(), relative);
  }
});

test("every hashed Python source is covered by the current checkout mounts", async () => {
  const runtime = fileURLToPath(new URL("../../../../", import.meta.url));
  const mounts = await nativeResearchMounts(runtime);
  assert.ok(mounts.some(([source, target]) => source === "scripts/research/n11" &&
    target === "/opt/repo/engine/runtime/scripts/research/n11"));
  assert.equal(new Set(mounts.map(([, target]) => target)).size, mounts.length);
  for (const relative of (await researchSourceFiles(runtime)).filter(name => name.endsWith(".py"))) {
    assert.ok(mounts.some(([source]) => relative === source || relative.startsWith(source + "/")), relative);
  }
  const driver = await fs.readFile(new URL("../browser/nativeBrowserAcceptance.mjs", import.meta.url), "utf8");
  assert.match(driver, /await nativeResearchMounts\(runtime\)/);
});

test("native software identity binds current helpers, compiled relay and raw browser modules", async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"native-identity-")),runtime=path.join(root,"engine/runtime");
  try {
    const inputs=["engine/runtime/research/unit.py","engine/runtime/scripts/research/n10/unit.mjs","engine/runtime/scripts/research/n11/unit.py","engine/runtime/dist/src/unit.js",...[
      "telemetry/receiverObservation.ts","transport/webrtcEngineErrors.ts","transport/localIceQueue.ts"
    ].map(name=>"apps/web/src/lib/webrtc/"+name)];
    for(const name of inputs){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),"fixture");}
    const original=await nativeSoftwareIdentity(runtime);assert.match(original,/^[a-f0-9]{64}$/);
    await fs.writeFile(path.join(root,"README.md"),"unrelated");assert.equal(await nativeSoftwareIdentity(runtime),original);
    await fs.writeFile(path.join(runtime,"scripts/research/n11/unit.py"),"changed");assert.notEqual(await nativeSoftwareIdentity(runtime),original);
    const changed=await nativeSoftwareIdentity(runtime);await fs.writeFile(path.join(root,inputs.at(-1)),"browser changed");assert.notEqual(await nativeSoftwareIdentity(runtime),changed);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
