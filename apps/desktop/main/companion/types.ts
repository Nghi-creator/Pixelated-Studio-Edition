import type { CertificatePaths } from "./certificate";

export type RuntimeKind = "libretro" | "native_linux";

export type RuntimeSwitchResult =
  | {
      runtimeKind: RuntimeKind;
      status: "restarting";
    }
  | {
      runtimeKind: RuntimeKind;
      status: "unchanged";
    }
  | {
      activeClientCount?: number;
      activeSessionCount?: number;
      code: string;
      error: string;
      status?: "blocked";
    };

export type RuntimeSwitchHandler = (
  runtimeKind: RuntimeKind,
) => Promise<RuntimeSwitchResult> | RuntimeSwitchResult;

export type CompanionRequestOptions = {
  engineToken: string;
  launchAllowedOrigins: string[];
  onRuntimeSwitch?: RuntimeSwitchHandler;
};

export type CompanionServerOptions = CompanionRequestOptions & {
  certDir: string;
  inviteCode?: string;
  inviteExpiresAt?: number;
  lanAddresses: string[];
  port: number;
  preserveSecurityState?: boolean;
};

export type CompanionServerResult = CertificatePaths & {
  httpPort: number;
  port: number;
};
