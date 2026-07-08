import { engineRuntimeDir } from "../runtime/config";
import type { EngineLaunchContext } from "./launch";
import type { ImageRecoveryPayload } from "./controllerTypes";

export function createImageRecoveryPayload(
  launchContext: EngineLaunchContext,
  detail: string,
): ImageRecoveryPayload {
  const runtimeLabel =
    launchContext.runtimeConfig.engineRuntimeKind === "native_linux"
      ? "native Linux"
      : "libretro";
  const title = "Engine image is not ready";
  const guidance =
    `Build the local ${runtimeLabel} Docker image, then retry engine initialization.`;
  return {
    detail,
    engineImage: launchContext.runtimeConfig.engineImage,
    guidance,
    runtimeDir: engineRuntimeDir,
    runtimeKind: launchContext.runtimeConfig.engineRuntimeKind,
    summary: [
      "Pixelated Studio engine image recovery",
      `Status: ${title}`,
      `Image: ${launchContext.runtimeConfig.engineImage}`,
      `Runtime: ${launchContext.runtimeConfig.engineRuntimeKind}`,
      `Runtime dir: ${engineRuntimeDir}`,
      `Next step: ${guidance}`,
      detail ? `Detail: ${detail}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    title,
  };
}
