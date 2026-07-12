import http from "http";

const ENGINE_HOST = "127.0.0.1";
const ENGINE_PORT = 8080;

export function probeEngineHealth(timeoutMs = 1500) {
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
