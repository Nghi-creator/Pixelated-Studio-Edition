import crypto from "crypto";
import {
  backendApiUrl,
  companionPort,
  engineAllowedOrigins,
  hostedWebUrl,
  resolveEngineRuntimeConfig,
  type EngineRuntimeKind,
  type EngineRuntimeConfig,
} from "../runtime/config";
import { getHostUinputGroupId, hasHostUinput } from "../docker/client";
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
  preserveEngineToken?: unknown;
  preserveCompanionSecurity?: unknown;
  runtimeKind?: unknown;
  skipImagePreparation?: unknown;
};

export type EngineLaunchContext = {
  advertisedUrls: string[];
  companionUrls: string[];
  includeUinputDevice: boolean;
  exposureMode: ExposureMode;
  preserveCompanionSecurity: boolean;
  runtimeConfig: EngineRuntimeConfig;
  runtimeKind: EngineRuntimeKind;
  inviteCode?: string;
  inviteExpiresAt?: number;
  publishHost: string;
  uinputGroupId?: number;
};

type DockerRunOptions = Omit<
  EngineLaunchContext,
  "preserveCompanionSecurity" | "runtimeConfig" | "runtimeKind"
> & {
  engineToken: string;
  runtimeConfig?: EngineRuntimeConfig;
  runtimeKind?: EngineRuntimeKind;
};

type WebLaunchUrlOptions = {
  companionLaunchUrl: string;
  createLaunchTicket: () => string;
};

export function createHostedInviteUrl(companionUrl: string) {
  const url = new URL("/engine", hostedWebUrl);
  url.searchParams.set("companionUrl", companionUrl);
  url.searchParams.set("join", "invite");
  return url.toString();
}

export function createHostedWebLaunchUrl({
  companionLaunchUrl,
  createLaunchTicket,
}: WebLaunchUrlOptions) {
  const url = new URL(hostedWebUrl);
  url.searchParams.set("companionUrl", companionLaunchUrl);
  url.searchParams.set("launchTicket", createLaunchTicket());
  return url.toString();
}

export function getDockerRunArgs({
  advertisedUrls,
  companionUrls,
  includeUinputDevice,
  engineToken,
  exposureMode,
  publishHost,
  uinputGroupId,
  runtimeConfig,
  runtimeKind,
}: DockerRunOptions) {
  const resolvedRuntimeConfig =
    runtimeConfig || resolveEngineRuntimeConfig(runtimeKind);
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
    engineImage: resolvedRuntimeConfig.engineImage,
    engineRuntimeKind: resolvedRuntimeConfig.engineRuntimeKind,
    engineToken,
    exposureMode,
    includeUinputDevice,
    publishHost,
    uinputGroupId,
  });
}

export function createEngineLaunchContext(
  options: StartEngineOptions = {},
): EngineLaunchContext {
  const exposureMode = normalizeExposureMode(options.exposureMode);
  const preserveCompanionSecurity = options.preserveCompanionSecurity === true;
  const runtimeConfig = resolveEngineRuntimeConfig(options.runtimeKind);
  const runtimeKind = runtimeConfig.engineRuntimeKind;
  const publishHost = getDockerPublishHost(exposureMode);
  const advertisedUrls = getAdvertisedEngineUrls(exposureMode);
  const companionUrls = getAdvertisedCompanionUrls(exposureMode, companionPort);
  const includeUinputDevice = hasHostUinput();
  const uinputGroupId = includeUinputDevice
    ? getHostUinputGroupId()
    : undefined;
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
    preserveCompanionSecurity,
    runtimeConfig,
    runtimeKind,
    inviteCode,
    inviteExpiresAt,
    publishHost,
    uinputGroupId,
  };
}

export function createLanInvite() {
  return {
    inviteCode: crypto.randomBytes(4).toString("hex").toUpperCase(),
    inviteExpiresAt: Date.now() + INVITE_CODE_TTL_MS,
  };
}
