import crypto from "crypto";
import { normalizeInviteCode } from "./inviteCode";

const LAUNCH_TICKET_TTL_MS = 60 * 1000;
export const MAX_COMPANION_ACCESS_TOKENS = 4_096;
const INVITE_FAILURE_LIMIT = 8;
const INVITE_FAILURE_WINDOW_MS = 60 * 1000;
const INVITE_FAILURE_MAX_ENTRIES = 1024;

type CompanionAccessToken = {
  expiresAt: number;
  scope: "guest" | "host";
};

type CompanionLaunchTicket = {
  accessExpiresAt?: number;
  companionToken?: string;
  expiresAt: number;
};

export type CompanionInviteState = {
  code: string | null;
  expiresAt: number | null;
  revokedAt: number | null;
};

export type CompanionInviteStatus = "active" | "expired" | "revoked";

const companionAccessTokens = new Map<string, CompanionAccessToken>();
const companionLaunchTickets = new Map<string, CompanionLaunchTicket>();
const companionInviteFailures = new Map<
  string,
  { count: number; resetAt: number }
>();
let companionInviteState: CompanionInviteState = {
  code: null,
  expiresAt: null,
  revokedAt: null,
};

function clearGuestAccessTokens() {
  companionAccessTokens.forEach((record, token) => {
    if (record.scope === "guest") companionAccessTokens.delete(token);
  });
}

export function pruneCompanionAccessTokens(now = Date.now()) {
  for (const [token, record] of companionAccessTokens) {
    if (record.expiresAt <= now) companionAccessTokens.delete(token);
  }
  while (companionAccessTokens.size > MAX_COMPANION_ACCESS_TOKENS) {
    const oldestToken = companionAccessTokens.keys().next().value;
    if (typeof oldestToken !== "string") break;
    companionAccessTokens.delete(oldestToken);
  }
  return companionAccessTokens.size;
}

export function getCompanionInviteState() {
  return companionInviteState;
}

export function updateCompanionInvite(inviteCode: string, inviteExpiresAt: number) {
  companionInviteState = {
    code: normalizeInviteCode(inviteCode),
    expiresAt: inviteExpiresAt,
    revokedAt: null,
  };
  clearGuestAccessTokens();
  companionInviteFailures.clear();
}

export function revokeCompanionInvite() {
  companionInviteState = {
    code: null,
    expiresAt: null,
    revokedAt: Date.now(),
  };
  clearGuestAccessTokens();
  companionInviteFailures.clear();
}

export function recordCompanionInviteFailure(key: string, now = Date.now()) {
  const existing = companionInviteFailures.get(key);
  if (!existing || existing.resetAt <= now) {
    if (companionInviteFailures.size >= INVITE_FAILURE_MAX_ENTRIES) {
      for (const [failureKey, failure] of companionInviteFailures) {
        if (failure.resetAt <= now) companionInviteFailures.delete(failureKey);
      }
    }
    while (companionInviteFailures.size >= INVITE_FAILURE_MAX_ENTRIES) {
      const oldestKey = companionInviteFailures.keys().next().value;
      if (typeof oldestKey !== "string") break;
      companionInviteFailures.delete(oldestKey);
    }
    companionInviteFailures.set(key, {
      count: 1,
      resetAt: now + INVITE_FAILURE_WINDOW_MS,
    });
    return { blocked: false, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  return {
    blocked: existing.count > INVITE_FAILURE_LIMIT,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export function clearCompanionInviteFailure(key: string) {
  companionInviteFailures.delete(key);
}

export function createCompanionLaunchTicket(now = Date.now()) {
  const ticket = crypto.randomBytes(24).toString("base64url");
  companionLaunchTickets.clear();
  companionLaunchTickets.set(ticket, {
    expiresAt: now + LAUNCH_TICKET_TTL_MS,
  });
  return ticket;
}

export function hasValidCompanionLaunchTicket(
  ticket: string,
  now = Date.now(),
) {
  const record = companionLaunchTickets.get(ticket);
  if (!record || record.expiresAt <= now) {
    companionLaunchTickets.delete(ticket);
    return false;
  }
  return true;
}

export function redeemCompanionLaunchTicket(
  ticket: string,
  accessExpiresAt: number,
  now = Date.now(),
) {
  const record = companionLaunchTickets.get(ticket);
  if (!record || record.expiresAt <= now) {
    companionLaunchTickets.delete(ticket);
    return null;
  }
  if (!record.companionToken) {
    record.accessExpiresAt = accessExpiresAt;
    record.companionToken = createCompanionAccessToken(
      accessExpiresAt,
      "host",
      now,
    );
  }
  return {
    accessExpiresAt: record.accessExpiresAt || accessExpiresAt,
    companionToken: record.companionToken,
  };
}

export function getCompanionInviteStatus(
  state: CompanionInviteState = companionInviteState,
  now = Date.now(),
): CompanionInviteStatus {
  if (!state.code || !state.expiresAt) return "revoked";
  return now >= state.expiresAt ? "expired" : "active";
}

export function isValidCompanionAccessToken(token: string, now = Date.now()) {
  const record = companionAccessTokens.get(token);
  if (!record) return false;
  if (record.expiresAt <= now) {
    companionAccessTokens.delete(token);
    return false;
  }
  return true;
}

export function getCompanionAccessTokenScope(token: string, now = Date.now()) {
  const record = companionAccessTokens.get(token);
  if (!record) return null;
  if (record.expiresAt <= now) {
    companionAccessTokens.delete(token);
    return null;
  }
  return record.scope;
}

export function createCompanionAccessToken(
  expiresAt: number,
  scope: CompanionAccessToken["scope"],
  now = Date.now(),
) {
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw new Error("Companion access token expiry must be in the future");
  }
  pruneCompanionAccessTokens(now);
  if (companionAccessTokens.size >= MAX_COMPANION_ACCESS_TOKENS) {
    const oldestToken = companionAccessTokens.keys().next().value;
    if (typeof oldestToken === "string") {
      companionAccessTokens.delete(oldestToken);
    }
  }
  const token = crypto.randomBytes(24).toString("base64url");
  companionAccessTokens.set(token, { expiresAt, scope });
  return token;
}

export function resetCompanionSecurityState() {
  companionLaunchTickets.clear();
  companionAccessTokens.clear();
  companionInviteFailures.clear();
  revokeCompanionInvite();
}
