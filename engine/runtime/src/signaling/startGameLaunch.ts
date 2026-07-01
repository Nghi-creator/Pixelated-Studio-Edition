import crypto from "crypto";
import path from "path";
import { removeFileIfExists } from "../roms/cloudRomDownloader";
import {
  findRuntimeByExtension,
  getRuntimeDefinition,
  getRuntimeExtensionForTarget,
} from "../runtime/runtimeRegistry";
import type { IceServer, StreamProfile } from "./startGameRequest";

type RuntimeBootOptions = {
  iceServers?: IceServer[];
  isCloudRom?: boolean;
  runtimeId: string;
  streamProfile: StreamProfile;
};

export type Runtime = {
  bootGame(romPath: string, sessionId: string, options: RuntimeBootOptions): void;
};

export type DownloadCloudRom = (
  romUrl: string,
  destinationPath: string,
  validation: {
    expectedSha256?: string | null;
    expectedSizeBytes?: number | null;
    runtimeId: string;
  },
) => Promise<void>;

function withIceServers(iceServers: IceServer[]) {
  return iceServers.length > 0 ? { iceServers } : {};
}

export function launchNativeSession(options: {
  iceServers: IceServer[];
  launchManifestId: string | null | undefined;
  runtime: Runtime;
  runtimeId: string;
  sessionId: string;
  streamProfile: StreamProfile;
}) {
  const {
    iceServers,
    launchManifestId,
    runtime,
    runtimeId,
    sessionId,
    streamProfile,
  } = options;
  runtime.bootGame(launchManifestId || "", sessionId, {
    ...withIceServers(iceServers),
    isCloudRom: false,
    runtimeId,
    streamProfile,
  });
}

export async function launchCloudRomSession(options: {
  downloadCloudRom: DownloadCloudRom;
  expectedSha256?: string | null;
  expectedSizeBytes?: number | null;
  iceServers: IceServer[];
  romFileOrUrl: string;
  runtime: Runtime;
  runtimeId: string;
  sessionId: string;
  streamProfile: StreamProfile;
}) {
  const {
    downloadCloudRom,
    expectedSha256,
    expectedSizeBytes,
    iceServers,
    romFileOrUrl,
    runtime,
    runtimeId,
    sessionId,
    streamProfile,
  } = options;
  const registryRuntime = getRuntimeDefinition(runtimeId);
  if (!registryRuntime) {
    throw new Error("Cloud session selected an unsupported runtime.");
  }

  const extension = getRuntimeExtensionForTarget(romFileOrUrl, registryRuntime);
  const tmpPath = `/tmp/cloud_game_${crypto.randomUUID()}${extension}`;
  console.log("[Engine] Cloud URL detected. Downloading ROM to temporary storage...");

  try {
    await downloadCloudRom(romFileOrUrl, tmpPath, {
      expectedSha256,
      expectedSizeBytes,
      runtimeId,
    });
    console.log("[Engine] Download complete. Booting Cloud Game.");
    runtime.bootGame(tmpPath, sessionId, {
      ...withIceServers(iceServers),
      isCloudRom: true,
      runtimeId,
      streamProfile,
    });
  } catch (err) {
    removeFileIfExists(tmpPath);
    throw err;
  }
}

export function launchLocalVaultSession(options: {
  iceServers: IceServer[];
  romFileOrUrl: string;
  runtime: Runtime;
  safeUserId: string;
  sessionId: string;
  streamProfile: StreamProfile;
}) {
  const { iceServers, romFileOrUrl, runtime, safeUserId, sessionId, streamProfile } =
    options;
  const safeRomFile = path.basename(romFileOrUrl);
  const registryRuntime = findRuntimeByExtension(safeRomFile);
  if (!registryRuntime) {
    throw new Error("Unsupported local game file type.");
  }

  runtime.bootGame(path.join("/roms", safeUserId, safeRomFile), sessionId, {
    ...withIceServers(iceServers),
    runtimeId: registryRuntime.id,
    streamProfile,
  });
}
