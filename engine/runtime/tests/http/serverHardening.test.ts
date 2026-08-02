import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
  ENGINE_SERVER_LIMITS,
  hardenEngineHttpServer,
} from "../../src/http/serverHardening";

test("engine HTTP server bounds slow and excessive client connections", () => {
  const server = http.createServer();
  const initialConnectionListeners = server.listenerCount("connection");
  hardenEngineHttpServer(server);

  assert.equal(server.headersTimeout, 15_000);
  assert.equal(server.keepAliveTimeout, 5_000);
  assert.equal(server.maxHeadersCount, 100);
  assert.equal(server.maxConnections, ENGINE_SERVER_LIMITS.maxConnections);
  assert.equal(server.maxRequestsPerSocket, 1_000);
  assert.equal(server.requestTimeout, 120_000);
  assert.equal(
    server.listenerCount("connection"),
    initialConnectionListeners + 1,
  );
});
