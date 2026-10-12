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
  uinputGroupId?: number;
  researchCampaign?: boolean;
  researchWorkloadId?: string;
  researchWorkloadSeed?: number;
};

const ENGINE_CONTAINER_USER = "10001:10001";

export const removeEngineContainerArgs = ["rm", "-f", "pixelated-node"];

export function buildPrepareEngineVolumeArgs(engineImage: string) {
  return [
    "run",
    "--rm",
    "--network",
    "none",
    "--user",
    "0:0",
    "--cap-drop",
    "ALL",
    "--cap-add",
    "CHOWN",
    "--cap-add",
    "DAC_READ_SEARCH",
    "--security-opt",
    "no-new-privileges:true",
    "-v",
    "pixelated-roms:/roms",
    engineImage,
    "chown",
    "-R",
    ENGINE_CONTAINER_USER,
    "/roms",
  ];
}

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
  uinputGroupId,
  researchCampaign = false,
  researchWorkloadId,
  researchWorkloadSeed,
}: DockerRunArgsOptions) {
  if (researchCampaign && (!/^workload-[1-9][0-9]{0,8}$/.test(researchWorkloadId || "") || !Number.isSafeInteger(researchWorkloadSeed) || researchWorkloadSeed! < 0 || researchWorkloadSeed! > 4294967295)) {
    throw new Error("N5 research requires an explicit workload and seed declaration.");
  }
  return [
    "run",
    "-d",
    "--name",
    "pixelated-node",
    "--user",
    ENGINE_CONTAINER_USER,
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--pids-limit",
    "256",
    "--read-only",
    "--tmpfs",
    "/run/pixelated:rw,nosuid,nodev,noexec,size=8m,uid=10001,gid=10001,mode=0700",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=256m,mode=1777",
    "--tmpfs",
    "/home/pixelated:rw,nosuid,nodev,size=64m,uid=10001,gid=10001,mode=0700",
    "-p",
    `${publishHost}:8080:8080`,
    ...(includeUinputDevice
      ? [
          "--device",
          "/dev/uinput",
          ...(typeof uinputGroupId === "number" &&
          Number.isSafeInteger(uinputGroupId) &&
          uinputGroupId >= 0
            ? ["--group-add", String(uinputGroupId)]
            : []),
        ]
      : []),
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
    ...(researchCampaign ? [
      "-v", "pixelated-n5:/n5",
      "-e", "PIXELATED_STAGE_TRACE=1",
      "-e", "PIXELATED_STAGE_TRACE_BUDGET_NS=50000000",
      "-e", "PIXELATED_N5_CAMPAIGN_DIRECTORY=/n5/control",
      "-e", `PIXELATED_N5_WORKLOAD_ID=${researchWorkloadId}`,
      "-e", `PIXELATED_N5_WORKLOAD_SEED=${researchWorkloadSeed}`,
    ] : []),
    engineImage,
  ];
}
