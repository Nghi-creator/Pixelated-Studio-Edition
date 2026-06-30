import http, {
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from "http";
import crypto from "crypto";
import net, { type Socket } from "net";
import { getCompanionAccessTokenScope } from "./inviteState";

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

export function shouldProxy(url = "") {
  return PROXY_PREFIXES.some((prefix) => {
    return url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`);
  });
}

function serializeHeaderValue(value: number | string | string[] | undefined) {
  if (Array.isArray(value)) return value.join(", ");
  return value === undefined ? "" : String(value);
}

function getCompanionTokenFromRequest(req: IncomingMessage) {
  const headerToken = serializeHeaderValue(req.headers["x-engine-token"]);
  if (headerToken) return headerToken;

  try {
    const url = new URL(req.url || "/", "https://pixelated.local");
    return url.searchParams.get("companionToken") || "";
  } catch {
    return "";
  }
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
    headers["x-pixelated-client-id"] = clientId;
  }

  return headers;
}

export function proxyHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  engineToken: string,
) {
  const upstream = http.request(
    {
      headers: getProxiedHeaders(req, engineToken),
      hostname: ENGINE_HOST,
      method: req.method,
      path: req.url,
      port: ENGINE_PORT,
    },
    (upstreamResponse) => {
      res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(res);
    },
  );

  upstream.on("error", () => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Local engine is not reachable" }));
  });

  req.pipe(upstream);
}

export function proxyWebSocket(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  engineToken: string,
) {
  if (!shouldProxy(req.url || "")) {
    socket.destroy();
    return;
  }

  const upstream = net.connect(ENGINE_PORT, ENGINE_HOST, () => {
    const headers = getProxiedHeaders(req, engineToken);
    const headerLines = Object.entries(headers)
      .map(([name, value]) => `${name}: ${serializeHeaderValue(value)}`)
      .join("\r\n");

    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
    upstream.write(`${headerLines}\r\n\r\n`);
    upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });

  upstream.on("error", () => socket.destroy());
}
