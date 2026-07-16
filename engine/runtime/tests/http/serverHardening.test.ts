import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { hardenEngineHttpServer } from "../../src/http/serverHardening";

test("engine HTTP server bounds slow and excessive client connections", () => {
  const server = http.createServer();
  hardenEngineHttpServer(server);

  assert.equal(server.headersTimeout, 15_000);
  assert.equal(server.keepAliveTimeout, 5_000);
  assert.equal(server.maxHeadersCount, 100);
  assert.equal(server.maxRequestsPerSocket, 1_000);
  assert.equal(server.requestTimeout, 120_000);
});
