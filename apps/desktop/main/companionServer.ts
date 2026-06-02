import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import http, {
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from "http";
import https from "https";
import net, { type Socket } from "net";
import path from "path";

const ENGINE_HOST = "127.0.0.1";
const ENGINE_PORT = 8080;
const INVITE_PATH = "/invite";
const REDEEM_INVITE_PATH = "/invite/redeem";
const PROXY_PREFIXES = ["/health", "/local-games", "/socket.io", "/upload"];

type CertificatePaths = {
  certPath: string;
  keyPath: string;
};

export type CompanionServerOptions = {
  certDir: string;
  engineToken: string;
  inviteCode: string;
  inviteExpiresAt: number;
  lanAddresses: string[];
  port: number;
  webDistDir: string;
};

export type CompanionServerResult = CertificatePaths & {
  port: number;
};

let companionServer: https.Server | null = null;

type CompanionAccessToken = {
  expiresAt: number;
};

type CompanionInviteState = {
  code: string | null;
  expiresAt: number | null;
  revokedAt: number | null;
};

const companionAccessTokens = new Map<string, CompanionAccessToken>();
let companionInviteState: CompanionInviteState = {
  code: null,
  expiresAt: null,
  revokedAt: null,
};

export function updateCompanionInvite(inviteCode: string, inviteExpiresAt: number) {
  companionInviteState = {
    code: normalizeInviteCode(inviteCode),
    expiresAt: inviteExpiresAt,
    revokedAt: null,
  };
  companionAccessTokens.clear();
}

export function revokeCompanionInvite() {
  companionInviteState = {
    code: null,
    expiresAt: null,
    revokedAt: Date.now(),
  };
  companionAccessTokens.clear();
}

function createCertificate(
  certDir: string,
  lanAddresses: string[] = [],
): CertificatePaths {
  fs.mkdirSync(certDir, { recursive: true });
  const certPath = path.join(certDir, "pixelated-companion.crt");
  const keyPath = path.join(certDir, "pixelated-companion.key");

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return { certPath, keyPath };
  }

  const sanEntries = [
    "DNS:localhost",
    "DNS:pixelated.local",
    "IP:127.0.0.1",
    ...lanAddresses.map((address) => `IP:${address}`),
  ].join(",");

  execFileSync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-sha256",
    "-days",
    "365",
    "-subj",
    "/CN=pixelated.local",
    "-addext",
    `subjectAltName=${sanEntries}`,
  ]);

  return { certPath, keyPath };
}

function shouldProxy(url = "") {
  return PROXY_PREFIXES.some((prefix) => {
    return url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`);
  });
}

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
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function isValidCompanionAccessToken(token: string, now = Date.now()) {
  const record = companionAccessTokens.get(token);
  if (!record) return false;
  if (record.expiresAt <= now) {
    companionAccessTokens.delete(token);
    return false;
  }
  return true;
}

function createCompanionAccessToken(expiresAt: number) {
  const token = crypto.randomBytes(24).toString("base64url");
  companionAccessTokens.set(token, { expiresAt });
  return token;
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

function getProxiedHeaders(
  req: IncomingMessage,
  engineToken: string,
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {
    ...req.headers,
    host: `${ENGINE_HOST}:${ENGINE_PORT}`,
  };
  const companionToken = getCompanionTokenFromRequest(req);

  if (companionToken && isValidCompanionAccessToken(companionToken)) {
    headers["x-engine-token"] = engineToken;
  }

  return headers;
}

async function handleInviteRequest(
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (req.method === "GET" && req.url?.startsWith(INVITE_PATH)) {
    sendJson(res, 200, {
      codeLength: companionInviteState.code?.length || 8,
      expiresAt: companionInviteState.expiresAt
        ? new Date(companionInviteState.expiresAt).toISOString()
        : null,
      revoked: !companionInviteState.code,
      revokedAt: companionInviteState.revokedAt
        ? new Date(companionInviteState.revokedAt).toISOString()
        : null,
    });
    return true;
  }

  if (req.method !== "POST" || !req.url?.startsWith(REDEEM_INVITE_PATH)) {
    return false;
  }

  if (!companionInviteState.code || !companionInviteState.expiresAt) {
    sendJson(res, 410, { error: "Invite code revoked" });
    return true;
  }

  if (Date.now() >= companionInviteState.expiresAt) {
    sendJson(res, 410, { error: "Invite code expired" });
    return true;
  }

  try {
    const body = await readJsonBody(req);
    const submittedCode = normalizeInviteCode(
      body && typeof body === "object"
        ? (body as { code?: unknown }).code
        : undefined,
    );

    if (submittedCode !== companionInviteState.code) {
      sendJson(res, 401, { error: "Invalid invite code" });
      return true;
    }

    sendJson(res, 200, {
      companionToken: createCompanionAccessToken(companionInviteState.expiresAt),
      engineUrl: "",
      expiresAt: new Date(companionInviteState.expiresAt).toISOString(),
      tokenStoredBy: "browser-local-storage",
    });
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
  }

  return true;
}

function proxyHttpRequest(
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

function serializeHeaderValue(value: number | string | string[] | undefined) {
  if (Array.isArray(value)) return value.join(", ");
  return value === undefined ? "" : String(value);
}

function proxyWebSocket(
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

function getContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

function injectCompanionBootstrap(html: string) {
  const bootstrap = `
    <script>
      window.localStorage.setItem("pixelated_engine_url", window.location.origin);
    </script>
  `;

  return html.replace("</head>", `${bootstrap}</head>`);
}

function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  webDistDir: string,
) {
  const indexPath = path.join(webDistDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    res.writeHead(503, { "content-type": "text/html; charset=utf-8" });
    res.end(
      `Pixelated web build is missing at ${webDistDir}. Build apps/web before packaging the desktop app.`,
    );
    return;
  }

  let requestedPath = "/";
  try {
    const url = new URL(req.url || "/", "https://pixelated.local");
    requestedPath = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Invalid request path");
    return;
  }

  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.slice(1);
  const absolutePath = path.resolve(webDistDir, relativePath);
  const safeRoot = path.resolve(webDistDir);
  const isSafePath =
    absolutePath === safeRoot || absolutePath.startsWith(`${safeRoot}${path.sep}`);
  const isReadableFile =
    isSafePath &&
    fs.existsSync(absolutePath) &&
    fs.statSync(absolutePath).isFile();
  const filePath =
    isReadableFile
      ? absolutePath
      : indexPath;

  if (path.basename(filePath) === "index.html") {
    const html = fs.readFileSync(filePath, "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(injectCompanionBootstrap(html));
    return;
  }

  res.writeHead(200, { "content-type": getContentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
}

export function startCompanionServer({
  certDir,
  engineToken,
  inviteCode,
  inviteExpiresAt,
  lanAddresses,
  port,
  webDistDir,
}: CompanionServerOptions) {
  stopCompanionServer();
  updateCompanionInvite(inviteCode, inviteExpiresAt);

  const { certPath, keyPath } = createCertificate(certDir, lanAddresses);
  const server = https.createServer(
    {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    },
    async (req, res) => {
      if (await handleInviteRequest(req, res)) {
        return;
      }

      if (shouldProxy(req.url || "")) {
        proxyHttpRequest(req, res, engineToken);
        return;
      }

      serveStatic(req, res, webDistDir);
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
  if (!companionServer) return;

  companionServer.close();
  companionServer = null;
  revokeCompanionInvite();
}
