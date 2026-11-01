import fs from "node:fs/promises";
import path from "node:path";

// A layout change must not silently omit nested runtime sources from custody hashes.
export async function researchSourceFiles(runtime) {
  const files = (await fs.readdir(runtime)).filter((name) => name.endsWith(".py"));
  for (const directory of ["research", "scripts/research/n10"]) {
    for (const name of await fs.readdir(path.join(runtime, directory), { recursive: true })) {
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
    [`scripts/n10/${name}.mjs`, `scripts/research/n10/${name}.mjs`])),
});
