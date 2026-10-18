import assert from "node:assert/strict";
import http, { type ClientRequest, type IncomingMessage, type ServerResponse } from "node:http";
import net, { type Socket } from "node:net";
import { PassThrough } from "node:stream";
import test, { type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import { proxyHttpRequest, proxyWebSocket } from "../../../main/companion/engine/proxy";

class Response extends PassThrough {
  headersSent = false;
  statusCode = 200;
  writeHead(status: number) {
    if (this.headersSent) throw new Error("headers already sent");
    this.headersSent = true;
    this.statusCode = status;
    return this;
  }
}

function request() {
  return Object.assign(new PassThrough(), {
    headers: {}, method: "GET", url: "/health", httpVersion: "1.1",
  }) as unknown as IncomingMessage;
}

function httpProxy(context: TestContext) {
  const upstream = new PassThrough();
  let respond!: (response: IncomingMessage) => void;
  context.mock.method(http, "request", ((_options: unknown, callback: typeof respond) => {
    respond = callback;
    return upstream as unknown as ClientRequest;
  }) as typeof http.request);
  const req = request();
  const res = new Response();
  proxyHttpRequest(req, res as unknown as ServerResponse, "engine-token");
  return { req, res, upstream, respond };
}

test("HTTP proxy returns one safe 502 before upstream headers", (context) => {
  const { upstream, res } = httpProxy(context);
  upstream.emit("error", new Error("private upstream diagnostic"));
  assert.equal(res.statusCode, 502);
  assert.equal(res.writableEnded, true);
});

test("HTTP proxy closes a partial response instead of writing headers twice", (context) => {
  const { respond, upstream, res } = httpProxy(context);
  const response = Object.assign(new PassThrough(), { statusCode: 200, headers: {} });
  respond(response as unknown as IncomingMessage);
  assert.doesNotThrow(() => upstream.emit("error", new Error("reset after headers")));
  assert.equal(res.destroyed, true);
});

test("HTTP proxy handles aborted engine response streams", (context) => {
  const { respond, res } = httpProxy(context);
  const response = Object.assign(new PassThrough(), { statusCode: 200, headers: {} });
  respond(response as unknown as IncomingMessage);
  assert.doesNotThrow(() => response.emit("error", new Error("engine disconnected")));
  assert.equal(res.destroyed, true);
});

test("aborted uploads cancel the upstream engine request", async (context) => {
  const { req, upstream } = httpProxy(context);
  req.emit("aborted");
  await setImmediate();
  assert.equal(upstream.destroyed, true);
});

test("closing the browser response cancels the upstream engine request", async (context) => {
  const { res, upstream } = httpProxy(context);
  res.destroy();
  await setImmediate();
  assert.equal(upstream.destroyed, true);
});

function websocketProxy(context: TestContext) {
  const upstream = new PassThrough();
  context.mock.method(net, "connect", (() => upstream) as unknown as typeof net.connect);
  const socket = new PassThrough();
  proxyWebSocket(request(), socket as unknown as Socket, Buffer.alloc(0), "engine-token");
  return { upstream, socket };
}

test("WebSocket client disconnect closes a pending upstream connection", async (context) => {
  const { upstream, socket } = websocketProxy(context);
  socket.destroy();
  await setImmediate();
  assert.equal(upstream.destroyed, true);
});

test("WebSocket client errors are handled and close upstream", (context) => {
  const { upstream, socket } = websocketProxy(context);
  assert.doesNotThrow(() => socket.emit("error", new Error("client reset")));
  assert.equal(upstream.destroyed, true);
});

test("WebSocket engine disconnect closes the browser connection", async (context) => {
  const { upstream, socket } = websocketProxy(context);
  upstream.destroy();
  await setImmediate();
  assert.equal(socket.destroyed, true);
});

test("a graceful WebSocket engine close preserves buffered browser output", async (context) => {
  const { upstream, socket } = websocketProxy(context);
  socket.write("pending output");
  upstream.resume();
  upstream.end();
  await setImmediate();
  assert.equal(socket.writableEnded, true);
  assert.equal(socket.destroyed, false);
  assert.equal(socket.read().toString(), "pending output");
  socket.destroy();
});

test("HTTP proxy preserves complete streamed uploads and downloads", async (context) => {
  const payload = Buffer.alloc(128 * 1024, 0x61);
  const originalRequest = http.request.bind(http);
  const engine = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(Buffer.concat(chunks));
    });
  });
  const companion = http.createServer((req, res) => proxyHttpRequest(req, res, "engine-token"));
  context.after(() => {
    companion.closeAllConnections();
    companion.close();
    engine.closeAllConnections();
    engine.close();
  });
  await new Promise<void>((resolve, reject) => {
    engine.once("error", reject);
    engine.listen(0, "127.0.0.1", resolve);
  });
  const engineAddress = engine.address();
  assert.ok(engineAddress && typeof engineAddress !== "string");
  context.mock.method(http, "request", ((options: http.RequestOptions, callback: (res: IncomingMessage) => void) => {
    return originalRequest({ ...options, port: engineAddress.port }, callback);
  }) as typeof http.request);
  await new Promise<void>((resolve, reject) => {
    companion.once("error", reject);
    companion.listen(0, "127.0.0.1", resolve);
  });
  const companionAddress = companion.address();
  assert.ok(companionAddress && typeof companionAddress !== "string");
  const received = await new Promise<Buffer>((resolve, reject) => {
    const req = originalRequest({
      hostname: "127.0.0.1", port: companionAddress.port, path: "/upload", method: "POST",
    }, (res) => {
      assert.equal(res.statusCode, 200);
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.end(payload);
  });
  assert.deepEqual(received, payload);
});
