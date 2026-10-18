import http, {
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from "http";
import crypto from "crypto";
import net, { type Socket } from "net";
import { getCompanionAccessTokenScope } from "../invite/inviteState";
import {
  getCompanionTokenFromRequest,
  matchesCompanionRequestPath as matchesPath,
  serializeHeaderValue,
} from "../httpUtils";

const ENGINE_HOST = "127.0.0.1";
const ENGINE_PORT = 8080;
const PROXY_PREFIXES = [
  "/health",
  "/clients",
  "/display/frame",
  "/local-games",
  "/session/stop-active",
  "/smoke/telemetry",
  "/socket.io",
  "/upload",
];
const GUEST_PROXY_PREFIXES = ["/health", "/socket.io"];

type CompanionTokenScope = "guest" | "host" | null;

export function shouldProxy(url = "") {
  if (url === "/research/telemetry" || url.startsWith("/research/telemetry?")) return true;
  return PROXY_PREFIXES.some((prefix) => {
    return url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`);
  });
}

function matchesPrefix(url: string, prefix: string) {
  return url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`);
}

export function canProxyCompanionRequest(
  url = "",
  companionScope: CompanionTokenScope,
  method = "GET",
) {
  if (!shouldProxy(url)) return false;
  if (companionScope !== "guest") return true;
  if (method === "POST" && matchesPath(url, "/smoke/telemetry")) {
    return true;
  }
  return GUEST_PROXY_PREFIXES.some((prefix) => matchesPrefix(url, prefix));
}

function getCompanionScopeFromRequest(req: IncomingMessage): CompanionTokenScope {
  const companionToken = getCompanionTokenFromRequest(req);
  return companionToken ? getCompanionAccessTokenScope(companionToken) : null;
}

function getClientIdFromRequest(req: IncomingMessage) {
  const headerClientId = serializeHeaderValue(
    req.headers["x-pixelated-client-id"],
  );
  if (headerClientId) return headerClientId;

  try {
    const url = new URL(req.url || "/", "https://pixelated.local");
    return url.searchParams.get("pixelatedClientId") || "";
  } catch {
    return "";
  }
}

function getAccessIdForToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

function getProxiedHeaders(
  req: IncomingMessage,
  engineToken: string,
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {
    ...req.headers,
    host: `${ENGINE_HOST}:${ENGINE_PORT}`,
  };
  const companionToken = getCompanionTokenFromRequest(req);
  const companionScope = companionToken
    ? getCompanionAccessTokenScope(companionToken)
    : null;
  const clientId = getClientIdFromRequest(req);

  if (companionScope) {
    headers["x-engine-token"] = engineToken;
    headers["x-pixelated-access-id"] = getAccessIdForToken(companionToken);
    headers["x-pixelated-access-scope"] = `companion-${companionScope}`;
  }
  if (clientId) {
    // Query parameters are decoded text, not validated incoming HTTP headers.
    // The raw WebSocket handshake needs the same check as http.request.
    http.validateHeaderValue("x-pixelated-client-id", clientId);
    headers["x-pixelated-client-id"] = clientId;
  }

  return headers;
}

export function proxyHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  engineToken: string,
) {
  const companionScope = getCompanionScopeFromRequest(req);
  if (!canProxyCompanionRequest(req.url || "", companionScope, req.method)) {
    res.writeHead(403, {
      "cache-control": "no-store",
      "content-type": "application/json",
    });
    res.end(JSON.stringify({
      code: "companion_proxy_forbidden",
      error: "This companion token cannot access that engine route",
    }));
    return;
  }

  let headers: OutgoingHttpHeaders;
  try {
    headers = getProxiedHeaders(req, engineToken);
  } catch {
    res.writeHead(400, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ error: "Invalid companion request metadata" }));
    return;
  }

  let response: IncomingMessage | undefined;
  const upstream = http.request(
    {
      headers,
      hostname: ENGINE_HOST,
      method: req.method,
      path: req.url,
      port: ENGINE_PORT,
    },
    (upstreamResponse) => {
      response = upstreamResponse;
      upstreamResponse.on("error", fail);
      upstreamResponse.on("aborted", fail);
      if (res.destroyed) {
        upstreamResponse.destroy();
        return;
      }
      res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(res);
    },
  );

  function cancel() {
    upstream.destroy();
    response?.destroy();
  }

  function fail() {
    cancel();
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Local engine is not reachable" }));
  }

  upstream.on("error", fail);
  req.on("aborted", cancel);
  req.on("error", cancel);
  res.on("close", cancel);
  res.on("error", cancel);

  req.pipe(upstream);
}

export function proxyWebSocket(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  engineToken: string,
) {
  const companionScope = getCompanionScopeFromRequest(req);
  if (!canProxyCompanionRequest(req.url || "", companionScope, req.method)) {
    socket.destroy();
    return;
  }

  let headers: OutgoingHttpHeaders;
  try {
    headers = getProxiedHeaders(req, engineToken);
  } catch {
    socket.destroy();
    return;
  }

  const upstream = net.connect(ENGINE_PORT, ENGINE_HOST, () => {
    const headerLines = Object.entries(headers)
      .map(([name, value]) => `${name}: ${serializeHeaderValue(value)}`)
      .join("\r\n");

    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
    upstream.write(`${headerLines}\r\n\r\n`);
    upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });

  const close = () => {
    upstream.destroy();
    socket.destroy();
  };
  upstream.on("error", close);
  upstream.on("close", () => {
    // A clean FIN must flush any buffered browser writes before closing.
    if (upstream.readableEnded) socket.end();
    else socket.destroy();
  });
  socket.on("error", close);
  socket.on("close", close);
}
