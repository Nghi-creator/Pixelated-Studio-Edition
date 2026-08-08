import type {
  IncomingMessage,
  ServerResponse,
} from "http";
import { probeEngineHealth } from "../engine/engineHealth";
import {
  companionSecretsEqual,
  matchesCompanionRequestPath,
  readJsonBody,
  rejectCompanionRateLimitedRequest,
  sendJson,
  serializeHeaderValue,
  setCompanionCorsHeaders,
} from "../httpUtils";
import {
  clearCompanionInviteFailure,
  createCompanionAccessToken,
  getCompanionInviteState,
  getCompanionInviteStatus,
  recordCompanionInviteFailure,
} from "./inviteState";
import { createRedeemCompanionInvite } from "./redeemInvite";

const INVITE_PATH = "/invite";
const PREFLIGHT_INVITE_PATH = "/invite/preflight";
const REDEEM_INVITE_PATH = "/invite/redeem";

const redeemInvite = createRedeemCompanionInvite({
  clearFailure: clearCompanionInviteFailure,
  createAccessToken: (expiresAt) =>
    createCompanionAccessToken(expiresAt, "guest"),
  getInviteState: getCompanionInviteState,
  getInviteStatus: getCompanionInviteStatus,
  probeEngineHealth,
  recordFailure: recordCompanionInviteFailure,
  secretsEqual: companionSecretsEqual,
});

export async function handleInviteRequest(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: string[],
) {
  const isInvitePath =
    matchesCompanionRequestPath(req.url, PREFLIGHT_INVITE_PATH) ||
    matchesCompanionRequestPath(req.url, INVITE_PATH) ||
    matchesCompanionRequestPath(req.url, REDEEM_INVITE_PATH);
  if (!isInvitePath) return false;

  if (rejectCompanionRateLimitedRequest(req, res, "invite")) {
    return true;
  }

  const origin = serializeHeaderValue(req.headers.origin);
  if (origin && !setCompanionCorsHeaders(req, res, allowedOrigins)) {
    sendJson(res, 403, {
      code: "invite_origin_forbidden",
      error: "Invite origin is not allowed",
    });
    return true;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (
    req.method === "GET" &&
    matchesCompanionRequestPath(req.url, PREFLIGHT_INVITE_PATH)
  ) {
    const engineAvailable = await probeEngineHealth();
    const inviteStatus = getCompanionInviteStatus();
    const inviteState = getCompanionInviteState();
    sendJson(res, 200, {
      certificate: {
        status: "accepted",
      },
      engine: {
        status: engineAvailable ? "available" : "unavailable",
      },
      invite: {
        expiresAt: inviteState.expiresAt
          ? new Date(inviteState.expiresAt).toISOString()
          : null,
        status: inviteStatus,
      },
      ready: inviteStatus === "active" && engineAvailable,
    });
    return true;
  }

  if (
    req.method === "GET" &&
    matchesCompanionRequestPath(req.url, INVITE_PATH)
  ) {
    const inviteStatus = getCompanionInviteStatus();
    const inviteState = getCompanionInviteState();
    sendJson(res, 200, {
      codeLength: inviteState.code?.length || 8,
      expiresAt: inviteState.expiresAt
        ? new Date(inviteState.expiresAt).toISOString()
        : null,
      expired: inviteStatus === "expired",
      revoked: inviteStatus === "revoked",
      revokedAt: inviteState.revokedAt
        ? new Date(inviteState.revokedAt).toISOString()
        : null,
    });
    return true;
  }

  if (
    req.method !== "POST" ||
    !matchesCompanionRequestPath(req.url, REDEEM_INVITE_PATH)
  ) {
    return false;
  }

  try {
    const body = await readJsonBody(req);
    const result = await redeemInvite({
      remoteAddress: req.socket.remoteAddress || "unknown",
      submittedCode:
        body && typeof body === "object"
          ? (body as { code?: unknown }).code
          : undefined,
    });
    if (result.status === "revoked") {
      sendJson(res, 410, { code: "invite_revoked", error: "Invite code revoked" });
      return true;
    }
    if (result.status === "expired") {
      sendJson(res, 410, { code: "invite_expired", error: "Invite code expired" });
      return true;
    }
    if (result.status === "rate_limited") {
      res.setHeader("retry-after", result.retryAfterSeconds);
      sendJson(res, 429, { code: "invite_rate_limited", error: "Too many invalid invite attempts" });
      return true;
    }
    if (result.status === "invalid") {
      sendJson(res, 401, { code: "invite_invalid", error: "Invalid invite code" });
      return true;
    }
    if (result.status === "engine_unavailable") {
      sendJson(res, 503, { code: "host_engine_unavailable", error: "Host engine unavailable" });
      return true;
    }
    if (result.status === "replaced") {
      sendJson(res, 410, { code: "invite_replaced", error: "Invite code is no longer active" });
      return true;
    }
    sendJson(res, 200, {
      companionToken: result.companionToken,
      engineUrl: "",
      expiresAt: new Date(result.expiresAt).toISOString(),
      tokenStoredBy: "browser-local-storage",
    });
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
  }

  return true;
}
