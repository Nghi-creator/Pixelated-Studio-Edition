import fs from "fs";
import http, {
  type IncomingMessage,
  type ServerResponse,
} from "http";
import https from "https";
import { type Socket } from "net";
import {
  createCompanionCertificate,
  type CertificatePaths,
} from "./certificate";
import { serveCompanionStatus } from "./statusPage";
import {
  proxyHttpRequest,
  proxyWebSocket,
  shouldProxy,
} from "./proxy";
import {
  clearCompanionInviteFailure,
  consumeCompanionLaunchTicket,
  createCompanionAccessToken,
  createCompanionLaunchTicket,
  getCompanionInviteState,
  getCompanionInviteStatus,
  recordCompanionInviteFailure,
  resetCompanionSecurityState,
  revokeCompanionInvite,
  updateCompanionInvite,
} from "./inviteState";

export { getCompanionStatusPage } from "./statusPage";
export { shouldProxy } from "./proxy";

const ENGINE_HOST = "127.0.0.1";
const ENGINE_PORT = 8080;
const INVITE_PATH = "/invite";
const PREFLIGHT_INVITE_PATH = "/invite/preflight";
const REDEEM_INVITE_PATH = "/invite/redeem";
const REDEEM_LAUNCH_PATH = "/launch/redeem";
const HOST_ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export type CompanionServerOptions = {
  certDir: string;
  engineToken: string;
  inviteCode?: string;
  inviteExpiresAt?: number;
  lanAddresses: string[];
  launchAllowedOrigins: string[];
  port: number;
};

export type CompanionServerResult = CertificatePaths & {
  port: number;
};

let companionServer: https.Server | null = null;

export {
  consumeCompanionLaunchTicket,
  createCompanionLaunchTicket,
  getCompanionInviteStatus,
  recordCompanionInviteFailure,
  revokeCompanionInvite,
  updateCompanionInvite,
} from "./inviteState";

function normalizeInviteCode(value: unknown) {
  return typeof value === "string"
    ? value.toUpperCase().replace(/[^A-Z0-9]/g, "")
    : "";
}

function readJsonBody(req: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (body.length > 1024) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
) {
  res.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json",
  });
  res.end(JSON.stringify(payload));
}

function setCompanionCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: string[],
) {
  const origin = serializeHeaderValue(req.headers.origin);
  if (!origin || !allowedOrigins.includes(origin)) return false;

  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-origin", origin);
  if (req.headers["access-control-request-private-network"] === "true") {
    res.setHeader("access-control-allow-private-network", "true");
  }
  res.setHeader("vary", "Origin");
  return true;
}

function probeEngineHealth(timeoutMs = 1500) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (available: boolean) => {
      if (settled) return;
      settled = true;
      resolve(available);
    };

    const req = http.get(
      {
        hostname: ENGINE_HOST,
        path: "/health",
        port: ENGINE_PORT,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            settle(false);
            return;
          }

          try {
            const payload = JSON.parse(body) as { ok?: unknown };
            settle(payload.ok === true);
          } catch {
            settle(false);
          }
        });
      },
    );

    req.on("error", () => settle(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      settle(false);
    });
  });
}

async function handleInviteRequest(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: string[],
) {
  const isInvitePath =
    req.url?.startsWith(PREFLIGHT_INVITE_PATH) ||
    req.url?.startsWith(INVITE_PATH) ||
    req.url?.startsWith(REDEEM_INVITE_PATH);
  if (!isInvitePath) return false;

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

async function handleLaunchRequest(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: string[],
) {
  if (!req.url?.startsWith(REDEEM_LAUNCH_PATH)) {
    return false;
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
      body && typeof body === "object" && typeof (body as { ticket?: unknown }).ticket === "string"
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

function serializeHeaderValue(value: number | string | string[] | undefined) {
  if (Array.isArray(value)) return value.join(", ");
  return value === undefined ? "" : String(value);
}

export function startCompanionServer({
  certDir,
  engineToken,
  inviteCode,
  inviteExpiresAt,
  lanAddresses,
  launchAllowedOrigins,
  port,
}: CompanionServerOptions) {
  stopCompanionServer();
  if (inviteCode && inviteExpiresAt) {
    updateCompanionInvite(inviteCode, inviteExpiresAt);
  } else {
    revokeCompanionInvite();
  }

  const { certPath, keyPath } = createCompanionCertificate(certDir, lanAddresses);
  const server = https.createServer(
    {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    },
    async (req, res) => {
      if (await handleInviteRequest(req, res, launchAllowedOrigins)) {
        return;
      }

      if (await handleLaunchRequest(req, res, launchAllowedOrigins)) {
        return;
      }

      if (shouldProxy(req.url || "")) {
        proxyHttpRequest(req, res, engineToken);
        return;
      }

      serveCompanionStatus(res);
    },
  );

  server.on("upgrade", (req, socket, head) =>
    proxyWebSocket(req, socket as Socket, head, engineToken),
  );

  return new Promise<CompanionServerResult>((resolve, reject) => {
    const handleListenError = (err: Error) => {
      server.close();
      reject(err);
    };

    server.once("error", handleListenError);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", handleListenError);
      companionServer = server;
      resolve({
        certPath,
        keyPath,
        port,
      });
    });
  });
}

export function stopCompanionServer() {
  if (companionServer) {
    companionServer.close();
    companionServer = null;
  }
  resetCompanionSecurityState();
}
