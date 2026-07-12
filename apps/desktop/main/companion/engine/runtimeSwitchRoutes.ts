import type {
  IncomingMessage,
  ServerResponse,
} from "http";
import {
  getCompanionTokenFromRequest,
  readJsonBody,
  sendJson,
  serializeHeaderValue,
  setCompanionCorsHeaders,
} from "../httpUtils";
import { getCompanionAccessTokenScope } from "../invite/inviteState";
import type {
  RuntimeKind,
  RuntimeSwitchHandler,
} from "../types";

const RUNTIME_SWITCH_PATH = "/runtime/switch";
const VALID_RUNTIME_KINDS = new Set(["libretro", "native_linux"]);

export function canUseRuntimeSwitchToken(
  requestToken: string,
  engineToken: string,
) {
  const tokenScope = getCompanionAccessTokenScope(requestToken);
  if (tokenScope === "host") return true;
  if (tokenScope === "guest") return false;
  return Boolean(requestToken && requestToken === engineToken);
}

export async function handleRuntimeSwitchRequest(
  req: IncomingMessage,
  res: ServerResponse,
  engineToken: string,
  allowedOrigins: string[],
  onRuntimeSwitch?: RuntimeSwitchHandler,
) {
  if (!req.url?.startsWith(RUNTIME_SWITCH_PATH)) {
    return false;
  }

  const origin = serializeHeaderValue(req.headers.origin);
  if (origin && !setCompanionCorsHeaders(req, res, allowedOrigins)) {
    sendJson(res, 403, {
      code: "runtime_switch_origin_forbidden",
      error: "Runtime switch origin is not allowed",
    });
    return true;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (req.method !== "POST") return false;

  const requestToken = getCompanionTokenFromRequest(req);
  if (!canUseRuntimeSwitchToken(requestToken, engineToken)) {
    sendJson(res, 401, {
      code: "runtime_switch_token_invalid",
      error: "Runtime switching requires host access",
    });
    return true;
  }

  if (!onRuntimeSwitch) {
    sendJson(res, 503, {
      code: "runtime_switch_unavailable",
      error: "Runtime switching is not available",
    });
    return true;
  }

  try {
    const body = await readJsonBody(req);
    const runtimeKind =
      body &&
      typeof body === "object" &&
      typeof (body as { runtimeKind?: unknown }).runtimeKind === "string"
        ? (body as { runtimeKind: string }).runtimeKind
        : "";

    if (!VALID_RUNTIME_KINDS.has(runtimeKind)) {
      sendJson(res, 400, {
        code: "runtime_switch_invalid_kind",
        error: "Runtime kind must be libretro or native_linux",
      });
      return true;
    }

    const result = await onRuntimeSwitch(runtimeKind as RuntimeKind);
    if ("error" in result) {
      sendJson(res, result.code === "runtime_switch_active_session" ? 409 : 503, {
        ...result,
        status: result.status || "blocked",
      });
      return true;
    }

    sendJson(res, result.status === "restarting" ? 202 : 200, result);
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
  }

  return true;
}
