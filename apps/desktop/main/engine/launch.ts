import crypto from "crypto";
import {
  backendApiUrl,
  companionPort,
  engineAllowedOrigins,
  engineImage,
  hostedWebUrl,
} from "../config";
import { hasHostUinput } from "../docker";
import { buildDockerRunArgs } from "../dockerCommands";
import {
  getAdvertisedCompanionUrls,
  getAdvertisedEngineUrls,
  getDockerPublishHost,
  normalizeExposureMode,
  type ExposureMode,
} from "../exposure";

const INVITE_CODE_TTL_MS = 10 * 60 * 1000;

export type StartEngineOptions = {
  exposureMode?: unknown;
};

export type EngineLaunchContext = {
  advertisedUrls: string[];
  companionUrls: string[];
  includeUinputDevice: boolean;
  exposureMode: ExposureMode;
  inviteCode?: string;
  inviteExpiresAt?: number;
  publishHost: string;
};

type DockerRunOptions = EngineLaunchContext & {
  engineToken: string;
};

export function createHostedInviteUrl(companionUrl: string) {
  const url = new URL("/engine", hostedWebUrl);
  url.searchParams.set("companionUrl", companionUrl);
  url.searchParams.set("join", "invite");
  return url.toString();
}

export function getDockerRunArgs({
  advertisedUrls,
  companionUrls,
  includeUinputDevice,
  engineToken,
  exposureMode,
  publishHost,
}: DockerRunOptions) {
  const allowedOrigins = [
    engineAllowedOrigins,
    `https://localhost:${companionPort}`,
    ...companionUrls,
  ]
    .filter(Boolean)
    .join(",");

  return buildDockerRunArgs({
    advertisedUrls,
    allowedOrigins,
    apiUrl: backendApiUrl,
    companionUrls,
    engineImage,
    engineToken,
    exposureMode,
    includeUinputDevice,
    publishHost,
  });
}

export function createEngineLaunchContext(
  options: StartEngineOptions = {},
): EngineLaunchContext {
  const exposureMode = normalizeExposureMode(options.exposureMode);
  const publishHost = getDockerPublishHost(exposureMode);
  const advertisedUrls = getAdvertisedEngineUrls(exposureMode);
  const companionUrls = getAdvertisedCompanionUrls(exposureMode, companionPort);
  const includeUinputDevice = hasHostUinput();
  const inviteCode =
    exposureMode === "lan"
      ? crypto.randomBytes(4).toString("hex").toUpperCase()
      : undefined;
  const inviteExpiresAt =
    exposureMode === "lan" ? Date.now() + INVITE_CODE_TTL_MS : undefined;

  return {
    advertisedUrls,
    companionUrls,
    includeUinputDevice,
    exposureMode,
    inviteCode,
    inviteExpiresAt,
    publishHost,
  };
}

export function createLanInvite() {
  return {
    inviteCode: crypto.randomBytes(4).toString("hex").toUpperCase(),
    inviteExpiresAt: Date.now() + INVITE_CODE_TTL_MS,
  };
}

