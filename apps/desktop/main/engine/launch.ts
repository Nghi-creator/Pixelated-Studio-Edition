import crypto from "crypto";
import {
  backendApiUrl,
  companionPort,
  engineAllowedOrigins,
  engineImage,
  engineRuntimeKind,
  hostedWebUrl,
} from "../runtime/config";
import { hasHostUinput } from "../docker/client";
import { buildDockerRunArgs } from "../docker/commands";
import {
  getAdvertisedCompanionUrls,
  getAdvertisedEngineUrls,
  getDockerPublishHost,
  normalizeExposureMode,
  type ExposureMode,
} from "../network/exposure";

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

type WebLaunchUrlOptions = {
  advertisedUrls: string[];
  companionLaunchUrl: string;
  createLaunchTicket: () => string;
  engineToken: string;
  exposureMode: ExposureMode;
};

export function createHostedInviteUrl(companionUrl: string) {
  const url = new URL("/engine", hostedWebUrl);
  url.searchParams.set("companionUrl", companionUrl);
  url.searchParams.set("join", "invite");
  return url.toString();
}

export function createHostedWebLaunchUrl({
  advertisedUrls,
  companionLaunchUrl,
  createLaunchTicket,
  engineToken,
  exposureMode,
}: WebLaunchUrlOptions) {
  const url = new URL(hostedWebUrl);
  if (exposureMode === "local") {
    url.searchParams.set("engineUrl", advertisedUrls[0] || "http://localhost:8080");
    url.searchParams.set("engineToken", engineToken);
  } else {
    url.searchParams.set("companionUrl", companionLaunchUrl);
    url.searchParams.set("launchTicket", createLaunchTicket());
  }
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
    engineRuntimeKind,
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
