import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import Fastify from "fastify";
import { buildServer } from "../../../src/app.js";
import { installGracefulShutdown } from "../../../src/server.js";

test("building the production API does not bind a network port", async () => {
  const app = await buildServer();
  assert.equal(app.server.listening, false);

  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  await app.close();
});

test("SIGTERM closes the API exactly once", async () => {
  class FakeProcess extends EventEmitter {
    exitCode: number | undefined;
  }

  const app = Fastify({ logger: false });
  let closeCalls = 0;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  app.addHook("onClose", async () => {
    closeCalls += 1;
    resolveClosed();
  });
  await app.ready();

  const fakeProcess = new FakeProcess();
  installGracefulShutdown(app, fakeProcess as never);
  fakeProcess.emit("SIGTERM");
  fakeProcess.emit("SIGINT");
  await closed;

  assert.equal(closeCalls, 1);
  assert.equal(fakeProcess.exitCode, undefined);
});
