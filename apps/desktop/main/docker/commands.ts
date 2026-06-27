type DockerRunArgsOptions = {
  advertisedUrls: string[];
  allowedOrigins: string;
  apiUrl: string;
  companionUrls: string[];
  engineImage: string;
  engineRuntimeKind?: "libretro" | "native_linux";
  engineToken: string;
  exposureMode: "lan" | "local";
  includeUinputDevice: boolean;
  publishHost: string;
};

export const removeEngineContainerArgs = ["rm", "-f", "pixelated-node"];

export function buildDockerRunArgs({
  advertisedUrls,
  allowedOrigins,
  apiUrl,
  companionUrls,
  engineImage,
  engineRuntimeKind = "libretro",
  engineToken,
  exposureMode,
  includeUinputDevice,
  publishHost,
}: DockerRunArgsOptions) {
  return [
    "run",
    "-d",
    "--name",
    "pixelated-node",
    "-p",
    `${publishHost}:8080:8080`,
    ...(includeUinputDevice ? ["--device", "/dev/uinput"] : []),
    "-v",
    "pixelated-roms:/roms",
    "-e",
    `PIXELATED_ALLOWED_ORIGINS=${allowedOrigins}`,
    "-e",
    "PIXELATED_ALLOWED_ROM_HOSTS=pxksbsloksyfwiqyfkrz.supabase.co",
    "-e",
    `PIXELATED_API_URL=${apiUrl}`,
    "-e",
    `PIXELATED_ENGINE_TOKEN=${engineToken}`,
    "-e",
    `PIXELATED_ENGINE_RUNTIME_KIND=${engineRuntimeKind}`,
    "-e",
    `PIXELATED_ENGINE_EXPOSURE_MODE=${exposureMode}`,
    "-e",
    `PIXELATED_ADVERTISED_URLS=${advertisedUrls.join(",")}`,
    "-e",
    `PIXELATED_COMPANION_URLS=${companionUrls.join(",")}`,
    engineImage,
  ];
}
