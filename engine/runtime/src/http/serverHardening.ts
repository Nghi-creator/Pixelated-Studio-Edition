import type http from "http";

export const ENGINE_SERVER_LIMITS = Object.freeze({
  maxConnections: 256,
  maxConnectionsPerAddress: 32,
});

export function hardenEngineHttpServer(server: http.Server) {
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.maxConnections = ENGINE_SERVER_LIMITS.maxConnections;
  server.maxRequestsPerSocket = 1_000;
  server.requestTimeout = 120_000;

  const connectionsByAddress = new Map<string, number>();
  server.on("connection", (socket) => {
    const address = socket.remoteAddress || "unknown";
    const connectionCount = (connectionsByAddress.get(address) || 0) + 1;
    connectionsByAddress.set(address, connectionCount);

    socket.once("close", () => {
      const remaining = (connectionsByAddress.get(address) || 1) - 1;
      if (remaining > 0) connectionsByAddress.set(address, remaining);
      else connectionsByAddress.delete(address);
    });

    if (connectionCount > ENGINE_SERVER_LIMITS.maxConnectionsPerAddress) {
      socket.destroy();
    }
  });
}
