import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http, { type ClientRequest, type IncomingMessage } from "node:http";
import { PassThrough } from "node:stream";
import test, { type TestContext } from "node:test";
import { probeEngineHealth } from "../../../main/companion/engine/engineHealth";

function transport(context: TestContext) {
  const req = Object.assign(new EventEmitter(), {
    destroyed: false,
    destroy() { this.destroyed = true; return this; },
    setTimeout() { return this; },
  });
  let respond!: (res: IncomingMessage) => void;
  context.mock.method(http, "get", ((_options: unknown, callback: typeof respond) => {
    respond = callback;
    return req as unknown as ClientRequest;
  }) as typeof http.get);
  const pending = probeEngineHealth(25);
  const response = Object.assign(new PassThrough(), { statusCode: 200 });
  return { req, response, pending, respond: () => respond(response as unknown as IncomingMessage) };
}

test("companion engine health requires an actual successful payload", { timeout: 500 }, async (context) => {
  const { respond, response, pending } = transport(context);
  respond();
  response.end('{"ok":true}');
  assert.equal(await pending, true);
});

test("companion health resolves unavailable on a response stream error", { timeout: 500 }, async (context) => {
  const { respond, response, pending } = transport(context);
  respond();
  assert.doesNotThrow(() => response.emit("error", new Error("engine restarted")));
  assert.equal(await pending, false);
});

test("companion health bounds the complete response body", { timeout: 500 }, async (context) => {
  const { req, respond, response, pending } = transport(context);
  respond();
  response.write(Buffer.alloc(64 * 1024 + 1));
  assert.equal(await pending, false);
  assert.equal(req.destroyed, true);
});

test("companion health has a total deadline independent of socket inactivity", { timeout: 500 }, async (context) => {
  const { req, pending } = transport(context);
  assert.equal(await pending, false);
  assert.equal(req.destroyed, true);
});
