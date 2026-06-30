import type { spawn } from "child_process";
import { getNativeLaunchManifest } from "./nativeLaunchManifests";
import type { RuntimeDefinition } from "./runtimeRegistry";

type LaunchNativeOptions = {
  fileExists: (path: string) => boolean;
  launchManifestId: string;
  runtime: RuntimeDefinition;
  sessionId: string;
  spawnProcess: typeof spawn;
};

export function launchNativeGame(options: LaunchNativeOptions) {
  const {
    fileExists,
    launchManifestId,
    runtime,
    sessionId,
    spawnProcess,
  } = options;
  const manifest = getNativeLaunchManifest(launchManifestId);
  if (!manifest || !runtime.launchManifestIds?.includes(manifest.id)) {
    throw new Error(`Unsupported native launch manifest: ${launchManifestId}`);
  }
  if (!fileExists(manifest.executable)) {
    throw new Error(`Native launch executable is missing: ${manifest.executable}`);
  }

  console.log(
    `[Engine] Launching native manifest ${manifest.id} for session ${sessionId}`,
  );

  const child = spawnProcess(manifest.executable, manifest.args, {
    env: {
      ...process.env,
      DISPLAY: ":99",
      PULSE_SERVER: "127.0.0.1",
      SDL_AUDIODRIVER: process.env.SDL_AUDIODRIVER || "dummy",
    },
  });

  return {
    activeCloudRomPath: null,
    child,
    label: `Native game ${manifest.id}`,
  };
}
