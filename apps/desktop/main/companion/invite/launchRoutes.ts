import type {
  IncomingMessage,
  ServerResponse,
} from "http";
import { probeEngineHealth } from "../engine/engineHealth";
import {
  matchesCompanionRequestPath,
  readJsonBody,
  rejectCompanionRateLimitedRequest,
  sendJson,
  serializeHeaderValue,
  setCompanionCorsHeaders,
} from "../httpUtils";
import {
  hasValidCompanionLaunchTicket,
  redeemCompanionLaunchTicket,
} from "./inviteState";

const REDEEM_LAUNCH_PATH = "/launch/redeem";
const HOST_ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export async function handleLaunchRequest(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: string[],
) {
  if (!matchesCompanionRequestPath(req.url, REDEEM_LAUNCH_PATH)) {
    return false;
  }

  if (rejectCompanionRateLimitedRequest(req, res, "launch")) {
    return true;
  }

  const origin = serializeHeaderValue(req.headers.origin);
  if (origin && !setCompanionCorsHeaders(req, res, allowedOrigins)) {
    sendJson(res, 403, {
      code: "launch_origin_forbidden",
      error: "Launch origin is not allowed",
    });
    return true;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (req.method !== "POST") return false;

  try {
    const body = await readJsonBody(req);
    const ticket =
      body &&
      typeof body === "object" &&
      typeof (body as { ticket?: unknown }).ticket === "string"
        ? (body as { ticket: string }).ticket
        : "";
    if (!hasValidCompanionLaunchTicket(ticket)) {
      sendJson(res, 401, {
        code: "launch_ticket_invalid",
        error: "Desktop launch ticket is invalid or expired",
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

    const accessExpiresAt = Date.now() + HOST_ACCESS_TOKEN_TTL_MS;
    const redemption = redeemCompanionLaunchTicket(
      ticket,
      accessExpiresAt,
    );
    if (!redemption) {
      sendJson(res, 401, {
        code: "launch_ticket_invalid",
        error: "Desktop launch ticket is invalid or expired",
      });
      return true;
    }
    sendJson(res, 200, {
      companionToken: redemption.companionToken,
      expiresAt: new Date(redemption.accessExpiresAt).toISOString(),
      tokenStoredBy: "browser-local-storage",
    });
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
  }

  return true;
}
