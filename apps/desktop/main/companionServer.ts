import { execFileSync } from "child_process";
import fs from "fs";
import http, { type IncomingMessage, type ServerResponse } from "http";
import https from "https";
import net, { type Socket } from "net";
import path from "path";

const ENGINE_HOST = "127.0.0.1";
const ENGINE_PORT = 8080;
const PROXY_PREFIXES = ["/health", "/local-games", "/socket.io", "/upload"];

type CertificatePaths = {
  certPath: string;
  keyPath: string;
};

export type CompanionServerOptions = {
  certDir: string;
  lanAddresses: string[];
  port: number;
  webDistDir: string;
};

export type CompanionServerResult = CertificatePaths & {
  port: number;
};

let companionServer: https.Server | null = null;

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

function proxyHttpRequest(req: IncomingMessage, res: ServerResponse) {
  const upstream = http.request(
    {
      headers: {
        ...req.headers,
        host: `${ENGINE_HOST}:${ENGINE_PORT}`,
      },
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

function serializeHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.join(", ");
  return value ?? "";
}

function proxyWebSocket(req: IncomingMessage, socket: Socket, head: Buffer) {
  if (!shouldProxy(req.url || "")) {
    socket.destroy();
    return;
  }

  const upstream = net.connect(ENGINE_PORT, ENGINE_HOST, () => {
    const headers = {
      ...req.headers,
      host: `${ENGINE_HOST}:${ENGINE_PORT}`,
    };
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
  lanAddresses,
  port,
  webDistDir,
}: CompanionServerOptions) {
  stopCompanionServer();

  const { certPath, keyPath } = createCertificate(certDir, lanAddresses);
  const server = https.createServer(
    {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    },
    (req, res) => {
      if (shouldProxy(req.url || "")) {
        proxyHttpRequest(req, res);
        return;
      }

      serveStatic(req, res, webDistDir);
    },
  );

  server.on("upgrade", proxyWebSocket);

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
}
