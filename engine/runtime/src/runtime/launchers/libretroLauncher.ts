import type { spawn } from "child_process";
import type { RuntimeDefinition } from "../runtimeRegistry";
import { validateGameArtifact } from "../../roms/artifactValidation";
import { RETROARCH_CONFIG_PATH } from "../runtimePaths";

type LaunchLibretroOptions = {
  absoluteRomPath: string;
  isCloudRom?: boolean;
  runtime: RuntimeDefinition;
  runtimeId: string;
  sessionId: string;
  spawnProcess: typeof spawn;
};

export function launchLibretroGame(options: LaunchLibretroOptions) {
  const {
    absoluteRomPath,
    isCloudRom,
    runtime,
    runtimeId,
    sessionId,
    spawnProcess,
  } = options;

  if (!runtime.corePath) {
    throw new Error(`Unsupported runtime: ${runtimeId}`);
  }

  validateGameArtifact(absoluteRomPath, {
    fileLabel: "Game artifact",
    runtimeId,
  });

  console.log(
    `[Engine] Mounting ${runtime.id} content for session ${sessionId}: ${absoluteRomPath}`,
  );

  const child = spawnProcess(
    "retroarch",
    [
      "-f",
      "-L",
      runtime.corePath,
      "--appendconfig",
      RETROARCH_CONFIG_PATH,
      absoluteRomPath,
    ],
    { env: { ...process.env, DISPLAY: ":99", PULSE_SERVER: "127.0.0.1" } },
  );

  return {
    activeCloudRomPath: isCloudRom ? absoluteRomPath : null,
    child,
    label: "RetroArch",
  };
}
