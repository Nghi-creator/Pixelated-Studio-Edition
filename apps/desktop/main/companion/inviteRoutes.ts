import type {
  IncomingMessage,
  ServerResponse,
} from "http";
import { probeEngineHealth } from "./engineHealth";
import {
  readJsonBody,
  rejectCompanionRateLimitedRequest,
  sendJson,
  serializeHeaderValue,
  setCompanionCorsHeaders,
} from "./httpUtils";
import {
  clearCompanionInviteFailure,
  createCompanionAccessToken,
  getCompanionInviteState,
  getCompanionInviteStatus,
  recordCompanionInviteFailure,
} from "./inviteState";

const INVITE_PATH = "/invite";
const PREFLIGHT_INVITE_PATH = "/invite/preflight";
const REDEEM_INVITE_PATH = "/invite/redeem";

function normalizeInviteCode(value: unknown) {
  return typeof value === "string"
    ? value.toUpperCase().replace(/[^A-Z0-9]/g, "")
    : "";
}

export async function handleInviteRequest(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: string[],
) {
  const isInvitePath =
    req.url?.startsWith(PREFLIGHT_INVITE_PATH) ||
    req.url?.startsWith(INVITE_PATH) ||
    req.url?.startsWith(REDEEM_INVITE_PATH);
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

  if (req.method === "GET" && req.url?.startsWith(PREFLIGHT_INVITE_PATH)) {
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

  if (req.method === "GET" && req.url?.startsWith(INVITE_PATH)) {
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

  if (req.method !== "POST" || !req.url?.startsWith(REDEEM_INVITE_PATH)) {
    return false;
  }

  const inviteStatus = getCompanionInviteStatus();
  if (inviteStatus === "revoked") {
    sendJson(res, 410, {
      code: "invite_revoked",
      error: "Invite code revoked",
    });
    return true;
  }

  if (inviteStatus === "expired") {
    sendJson(res, 410, {
      code: "invite_expired",
      error: "Invite code expired",
    });
    return true;
  }

  const activeInviteState = getCompanionInviteState();
  const activeInviteCode = activeInviteState.code as string;
  const activeInviteExpiresAt = activeInviteState.expiresAt as number;

  try {
    const body = await readJsonBody(req);
    const submittedCode = normalizeInviteCode(
      body && typeof body === "object"
        ? (body as { code?: unknown }).code
        : undefined,
    );

    if (submittedCode !== activeInviteCode) {
      const failure = recordCompanionInviteFailure(
        req.socket.remoteAddress || "unknown",
      );
      if (failure.blocked) {
        res.setHeader("retry-after", failure.retryAfterSeconds);
        sendJson(res, 429, {
          code: "invite_rate_limited",
          error: "Too many invalid invite attempts",
        });
        return true;
      }
      sendJson(res, 401, {
        code: "invite_invalid",
        error: "Invalid invite code",
      });
      return true;
    }

    if (!(await probeEngineHealth())) {
      sendJson(res, 503, {
        code: "host_engine_unavailable",
        error: "Host engine unavailable",
      });
      return true;
    }

    if (
      getCompanionInviteState().code !== activeInviteCode ||
      getCompanionInviteStatus() !== "active"
    ) {
      sendJson(res, 410, {
        code: "invite_replaced",
        error: "Invite code is no longer active",
      });
      return true;
    }

    clearCompanionInviteFailure(req.socket.remoteAddress || "unknown");
    sendJson(res, 200, {
      companionToken: createCompanionAccessToken(activeInviteExpiresAt, "guest"),
      engineUrl: "",
      expiresAt: new Date(activeInviteExpiresAt).toISOString(),
      tokenStoredBy: "browser-local-storage",
    });
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
  }

  return true;
}
