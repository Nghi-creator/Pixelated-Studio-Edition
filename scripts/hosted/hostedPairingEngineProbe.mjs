import http from "node:http";

export function createHostedEngineProbe({ engineToken, webUrl }) {
  let server = null;
  let runtimeKind = "libretro";
  const runtimeSwitches = [];

  const start = () => {
    runtimeKind = "libretro";
    runtimeSwitches.length = 0;
    server = http.createServer((request, response) => {
      const origin = request.headers.origin;
      if (origin === new URL(webUrl).origin) {
        response.setHeader("access-control-allow-origin", origin);
        response.setHeader(
          "access-control-allow-headers",
          "content-type,x-engine-token,x-pixelated-client-id,x-user-id",
        );
        response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
        if (request.headers["access-control-request-private-network"] === "true") {
          response.setHeader("access-control-allow-private-network", "true");
        }
        response.setHeader("vary", "Origin");
      }

      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      if (request.url?.startsWith("/health")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            engineTokenRequired: true,
            exposureMode: "local",
            ok: true,
            runtimeKind,
          }),
        );
        return;
      }

      if (request.url?.startsWith("/session/stop-active")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ stopped: false }));
        return;
      }

      if (request.url?.startsWith("/local-games")) {
        const authorized = request.headers["x-engine-token"] === engineToken;
        response.writeHead(authorized ? 200 : 401, {
          "content-type": "application/json",
        });
        response.end(
          JSON.stringify(authorized ? { games: [] } : { error: "unauthorized" }),
        );
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });

    return new Promise((resolve, reject) => {
      server?.once("error", reject);
      server?.listen(8080, "127.0.0.1", resolve);
    });
  };

  const stop = async () => {
    if (!server) return;
    await new Promise((resolve) => server?.close(resolve));
    server = null;
  };

  const requestRuntimeSwitch = async (nextRuntimeKind) => {
    runtimeSwitches.push({
      runtimeKind: nextRuntimeKind,
      timestamp: new Date().toISOString(),
    });
    if (runtimeKind === nextRuntimeKind) {
      return { runtimeKind: nextRuntimeKind, status: "unchanged" };
    }
    runtimeKind = nextRuntimeKind;
    return { runtimeKind: nextRuntimeKind, status: "restarting" };
  };

  return {
    getRuntimeSwitches: () => [...runtimeSwitches],
    requestRuntimeSwitch,
    start,
    stop,
  };
}
