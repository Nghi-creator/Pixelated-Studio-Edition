import type {
  CompanionInviteState,
  CompanionInviteStatus,
} from "./inviteState";
import { normalizeInviteCode } from "./inviteCode";

type InviteFailure = {
  blocked: boolean;
  retryAfterSeconds: number;
};

type RedeemInviteDependencies = {
  clearFailure(remoteAddress: string): void;
  createAccessToken(expiresAt: number): string;
  getInviteState(): CompanionInviteState;
  getInviteStatus(): CompanionInviteStatus;
  probeEngineHealth(): Promise<boolean>;
  recordFailure(remoteAddress: string): InviteFailure;
  secretsEqual(left: string, right: string): boolean;
};

export function createRedeemCompanionInvite(
  dependencies: RedeemInviteDependencies,
) {
  return async function redeemCompanionInvite(input: {
    remoteAddress: string;
    submittedCode: unknown;
  }) {
    const initialStatus = dependencies.getInviteStatus();
    if (initialStatus === "revoked") return { status: "revoked" } as const;
    if (initialStatus === "expired") return { status: "expired" } as const;

    const activeInvite = dependencies.getInviteState();
    if (!activeInvite.code || !activeInvite.expiresAt) {
      return { status: "revoked" } as const;
    }

    const submittedCode = normalizeInviteCode(input.submittedCode);
    if (!dependencies.secretsEqual(submittedCode, activeInvite.code)) {
      const failure = dependencies.recordFailure(input.remoteAddress);
      return failure.blocked
        ? {
            retryAfterSeconds: failure.retryAfterSeconds,
            status: "rate_limited",
          } as const
        : { status: "invalid" } as const;
    }

    if (!(await dependencies.probeEngineHealth())) {
      return { status: "engine_unavailable" } as const;
    }

    const currentInvite = dependencies.getInviteState();
    if (
      currentInvite.code !== activeInvite.code ||
      dependencies.getInviteStatus() !== "active"
    ) {
      return { status: "replaced" } as const;
    }

    dependencies.clearFailure(input.remoteAddress);
    return {
      companionToken: dependencies.createAccessToken(activeInvite.expiresAt),
      expiresAt: activeInvite.expiresAt,
      status: "redeemed",
    } as const;
  };
}
