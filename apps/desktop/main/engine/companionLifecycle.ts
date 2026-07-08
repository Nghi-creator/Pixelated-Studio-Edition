import type { IpcMainEvent } from "electron";
import path from "path";
import { companionPort, hostedWebUrl } from "../runtime/config";
import {
  createCompanionLaunchTicket,
  type CompanionServerResult,
} from "../companion/server";
import { getLanIpv4Addresses } from "../network/exposure";
import {
  createHostedInviteUrl,
  createHostedWebLaunchUrl,
  type EngineLaunchContext,
} from "./launch";
import type {
  ActiveCompanion,
  EngineControllerDependencies,
  RuntimeSwitchHandler,
} from "./controllerTypes";

export async function startCompanionForEngine({
  dependencies,
  engineToken,
  event,
  launchContext,
  onRuntimeSwitch,
}: {
  dependencies: EngineControllerDependencies;
  engineToken: string;
  event: IpcMainEvent;
  launchContext: EngineLaunchContext;
  onRuntimeSwitch: RuntimeSwitchHandler;
}) {
  try {
    const companion: CompanionServerResult = await dependencies.startCompanionServer({
      certDir: path.join(dependencies.getUserDataPath(), "certificates"),
      engineToken,
      inviteCode: launchContext.inviteCode,
      inviteExpiresAt: launchContext.inviteExpiresAt,
      lanAddresses: getLanIpv4Addresses(),
      launchAllowedOrigins: [
        new URL(hostedWebUrl).origin,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ],
      onRuntimeSwitch: (runtimeKind) => onRuntimeSwitch(event, runtimeKind),
      port: companionPort,
      preserveSecurityState: launchContext.preserveCompanionSecurity,
    });
    const hostedInviteUrls = launchContext.companionUrls.map(createHostedInviteUrl);
    const localControlUrl = `http://localhost:${companion.httpPort}`;
    const activeCompanion: ActiveCompanion = {
      advertisedUrls: launchContext.advertisedUrls,
      certPath: companion.certPath,
      exposureMode: launchContext.exposureMode,
      launchUrl:
        launchContext.exposureMode === "local"
          ? localControlUrl
          : `https://localhost:${companion.port}`,
      urls: hostedInviteUrls,
    };
    if (launchContext.exposureMode === "lan" && launchContext.inviteExpiresAt) {
      event.reply("engine-companion", {
        certPath: companion.certPath,
        enabled: true,
        inviteCode: launchContext.inviteCode,
        inviteExpiresAt: new Date(launchContext.inviteExpiresAt).toISOString(),
        inviteRevoked: false,
        inviteStatus: "Invite code active.",
        urls: hostedInviteUrls,
      });
    } else {
      event.reply("engine-companion", {
        enabled: false,
        urls: [],
      });
    }
    event.reply(
      "server-log",
      `Desktop companion servers ready on ports ${companion.port} (HTTPS) and ${companion.httpPort} (local HTTP).`,
    );
    return activeCompanion;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    event.reply("engine-companion", {
      enabled: false,
      error: message,
      urls: [],
    });
    event.reply(
      "server-log",
      `<span class="text-synth-secondary">Warning: Desktop HTTPS companion could not start: ${message}</span>`,
    );
    return null;
  }
}

export function createCompanionWebLaunchUrl(activeCompanion: ActiveCompanion) {
  return createHostedWebLaunchUrl({
    companionLaunchUrl: activeCompanion.launchUrl,
    createLaunchTicket: createCompanionLaunchTicket,
  });
}

export function emitCompanionInvite(
  event: IpcMainEvent,
  activeCompanion: ActiveCompanion | null,
  payload: {
    inviteCode?: string;
    inviteExpiresAt?: number;
    inviteRevoked?: boolean;
    inviteStatus: string;
  },
) {
  if (!activeCompanion) {
    event.reply("engine-companion", {
      enabled: false,
      error: "LAN companion is not running.",
      urls: [],
    });
    return;
  }

  event.reply("engine-companion", {
    certPath: activeCompanion.certPath,
    enabled: true,
    inviteCode: payload.inviteCode,
    inviteExpiresAt: payload.inviteExpiresAt
      ? new Date(payload.inviteExpiresAt).toISOString()
      : undefined,
    inviteRevoked: payload.inviteRevoked,
    inviteStatus: payload.inviteStatus,
    urls: activeCompanion.urls,
  });
}
