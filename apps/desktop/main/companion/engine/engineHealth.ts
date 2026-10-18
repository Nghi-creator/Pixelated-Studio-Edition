import http, { type ClientRequest, type IncomingMessage } from "http";

const ENGINE_HOST = "127.0.0.1";
const ENGINE_PORT = 8080;
const MAX_HEALTH_BODY_BYTES = 64 * 1024;

export function probeEngineHealth(timeoutMs = 1500) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let req: ClientRequest | undefined;
    let response: IncomingMessage | undefined;
    const settle = (available: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      req?.destroy();
      response?.destroy();
      resolve(available);
    };
    // Socket inactivity alone does not bound a trickling or never-connected peer.
    const deadline = setTimeout(() => settle(false), timeoutMs);

    try {
      req = http.get(
        { hostname: ENGINE_HOST, path: "/health", port: ENGINE_PORT },
        (res) => {
          response = res;
          res.on("error", () => settle(false));
          res.on("aborted", () => settle(false));
          if (settled || res.statusCode !== 200) {
            res.destroy();
            settle(false);
            return;
          }
          const chunks: Buffer[] = [];
          let bodyBytes = 0;
          res.on("data", (chunk: Buffer) => {
            if (settled) return;
            bodyBytes += chunk.length;
            if (bodyBytes > MAX_HEALTH_BODY_BYTES) {
              settle(false);
              return;
            }
            chunks.push(chunk);
          });
          res.on("end", () => {
            if (settled) return;
            try {
              const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { ok?: unknown } | null;
              settle(payload?.ok === true);
            } catch {
              settle(false);
            }
          });
        },
      );
      req.on("error", () => settle(false));
      req.setTimeout(timeoutMs, () => settle(false));
    } catch {
      settle(false);
    }
  });
}
