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
  consumeCompanionLaunchTicket,
  createCompanionAccessToken,
} from "./inviteState";

const REDEEM_LAUNCH_PATH = "/launch/redeem";
const HOST_ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export async function handleLaunchRequest(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: string[],
) {
  if (!req.url?.startsWith(REDEEM_LAUNCH_PATH)) {
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
    if (!consumeCompanionLaunchTicket(ticket)) {
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
    sendJson(res, 200, {
      companionToken: createCompanionAccessToken(accessExpiresAt, "host"),
      expiresAt: new Date(accessExpiresAt).toISOString(),
      tokenStoredBy: "browser-local-storage",
    });
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
  }

  return true;
}
