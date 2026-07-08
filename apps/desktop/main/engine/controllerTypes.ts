import type { IpcMainEvent } from "electron";
import type { EngineRuntimeKind } from "../runtime/config";
import type { diagnoseDocker } from "../docker/diagnostics";
import type {
  execFileCommand,
  getSafeEnv,
  prepareEngineImage,
} from "../docker/client";
import type {
  RuntimeSwitchResult,
  startCompanionServer,
  stopCompanionServer,
} from "../companion/server";
import type { waitForEngineHealth } from "../runtime/health";
import type { EngineLaunchContext } from "./launch";

export type ActiveCompanion = {
  advertisedUrls: string[];
  certPath: string;
  exposureMode: EngineLaunchContext["exposureMode"];
  launchUrl: string;
  urls: string[];
};

export type EngineClientPayload = {
  accessScope: "companion-guest" | "companion-host" | "raw";
  connectedAt: string;
  id: string;
  lastSeenAt: string;
  remoteAddress: string;
  role: string;
  sessionId: string | null;
  socketCount: number;
  userAgent: string;
};

export type EngineHealthPayload = {
  checks?: {
    runtime?: {
      activeSessionId?: string | null;
    };
  };
  runtimeKind?: EngineRuntimeKind;
};

export type ImageRecoveryPayload = {
  detail: string;
  engineImage: string;
  guidance: string;
  runtimeDir: string;
  runtimeKind: EngineRuntimeKind;
  summary: string;
  title: string;
};

export type EngineControllerDependencies = {
  diagnoseDocker: typeof diagnoseDocker;
  execFileCommand: typeof execFileCommand;
  getSafeEnv: typeof getSafeEnv;
  getUserDataPath: () => string;
  prepareEngineImage: typeof prepareEngineImage;
  startCompanionServer: typeof startCompanionServer;
  stopCompanionServer: typeof stopCompanionServer;
  waitForEngineHealth: typeof waitForEngineHealth;
};

export type RuntimeSwitchHandler = (
  event: IpcMainEvent,
  runtimeKind: EngineRuntimeKind,
) => Promise<RuntimeSwitchResult> | RuntimeSwitchResult;
