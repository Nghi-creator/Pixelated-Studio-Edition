import type http from "http";

export function hardenEngineHttpServer(server: http.Server) {
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.maxRequestsPerSocket = 1_000;
  server.requestTimeout = 120_000;
}
