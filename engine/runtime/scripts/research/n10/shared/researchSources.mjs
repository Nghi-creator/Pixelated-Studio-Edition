import fs from "node:fs/promises";
import path from "node:path";

const RESEARCH_DIRECTORIES = Object.freeze(["research", "scripts/research/n10", "scripts/research/n11"]);

// Hash and mount the same checkout directories; never fall back to cached image helpers.
export async function nativeResearchMounts(runtime) {
  for (const directory of RESEARCH_DIRECTORIES) {
    if (!(await fs.stat(path.join(runtime, directory))).isDirectory()) throw Error("current research source directory required");
  }
  const names = [...RESEARCH_DIRECTORIES, ...(await fs.readdir(runtime)).filter(name => name.endsWith(".py"))];
  return names.map(name => [name, "/opt/repo/engine/runtime/" + name]);
}

// A layout change must not silently omit nested runtime sources from custody hashes.
export async function researchSourceFiles(runtime) {
  const files = (await fs.readdir(runtime)).filter((name) => name.endsWith(".py"));
  for (const directory of RESEARCH_DIRECTORIES) {
    for (const name of await fs.readdir(path.join(runtime, directory), { recursive: true }).catch(error => { if (error.code === "ENOENT" && directory === "scripts/research/n11") return []; throw error; })) {
      if (/\.(py|mjs|cjs)$/.test(name)) files.push(`${directory}/${name.split(path.sep).join("/")}`);
    }
  }
  return files.sort();
}

// The frozen game-browser v1 wire contract uses logical source identifiers.
// Keep those identifiers stable while binding them to the current physical files.
// This is the isolated worker's dependency closure, not the whole N10 harness.
export const GAME_BROWSER_SOURCES = Object.freeze({
  "private_journal.py": "research/private_journal.py",
  "live_probe_control/__init__.py": "research/live_probe_control/__init__.py",
  "live_probe_control/research_init.py": "research/__init__.py",
  "live_probe_control/control_init.py": "research/live_probe_control/control/__init__.py",
  "live_probe_control/capture_init.py": "research/live_probe_control/capture/__init__.py",
  ...Object.fromEntries(["contracts", "controller", "journal", "watchdog"].map((name) =>
    [`live_probe_control/${name}.py`, `research/live_probe_control/control/${name}.py`])),
  ...Object.fromEntries(["browser_game_worker", "game_scene", "webrtc_worker"].map((name) =>
    [`live_probe_control/${name}.py`, `research/live_probe_control/capture/${name}.py`])),
  ...Object.fromEntries(["gameBrowserTrial", "gameBrowserReceiver", "researchSources"].map((name) =>
    [`scripts/n10/${name}.mjs`, `scripts/research/n10/${name === "researchSources" ? "shared" : "capture"}/${name}.mjs`])),
});
