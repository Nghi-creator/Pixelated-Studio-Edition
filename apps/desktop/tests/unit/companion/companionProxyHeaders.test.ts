import assert from "node:assert/strict";
import http, { type ClientRequest, type IncomingMessage, type ServerResponse } from "node:http";
import net, { type Socket } from "node:net";
import { PassThrough } from "node:stream";
import test from "node:test";
import { proxyHttpRequest, proxyWebSocket } from "../../../main/companion/engine/proxy";

function request(clientId: string) {
  return Object.assign(new PassThrough(), {
    headers: {}, method: "GET", httpVersion: "1.1",
    url: `/socket.io/?pixelatedClientId=${encodeURIComponent(clientId)}`,
  }) as unknown as IncomingMessage;
}

class Response extends PassThrough {
  statusCode = 200;
  writeHead(status: number) { this.statusCode = status; return this; }
}

for (const [label, value] of [
  ["CRLF", "client-id\r\nx-audit-injected: yes"],
  ["NUL", "client-id\0"],
  ["non-header Unicode", "client-id\u0100"],
]) {
  test(`HTTP proxy rejects decoded ${label} before opening upstream`, (context) => {
    let requested = false;
    context.mock.method(http, "request", ((options: http.RequestOptions) => {
      for (const [name, entry] of Object.entries(options.headers || {})) {
        http.validateHeaderValue(name, String(entry));
      }
      requested = true;
      return new PassThrough() as unknown as ClientRequest;
    }) as typeof http.request);
    const res = new Response();
    assert.doesNotThrow(() => proxyHttpRequest(request(value!), res as unknown as ServerResponse, "engine-token"));
    assert.equal(res.statusCode, 400);
    assert.equal(requested, false);
    assert.equal(res.read().toString().includes(value!), false);
  });

  test(`WebSocket proxy rejects decoded ${label} before constructing a handshake`, (context) => {
    let connected = false;
    context.mock.method(net, "connect", (() => {
      connected = true;
      return new PassThrough();
    }) as unknown as typeof net.connect);
    const socket = new PassThrough();
    proxyWebSocket(request(value!), socket as unknown as Socket, Buffer.alloc(0), "engine-token");
    assert.equal(connected, false);
    assert.equal(socket.destroyed, true);
  });
}

test("WebSocket query metadata cannot insert a second upstream header", (context) => {
  const upstream = new PassThrough();
  let handshake = "";
  context.mock.method(upstream, "write", ((chunk: unknown) => {
    handshake += String(chunk);
    return true;
  }) as typeof upstream.write);
  let connect: (() => void) | undefined;
  context.mock.method(net, "connect", ((_port: number, _host: string, callback: () => void) => {
    connect = callback;
    return upstream;
  }) as unknown as typeof net.connect);
  const socket = new PassThrough();
  proxyWebSocket(request("client-id\r\nx-audit-injected: yes"), socket as unknown as Socket, Buffer.alloc(0), "engine-token");
  connect?.();
  assert.equal(handshake.includes("\r\nx-audit-injected:"), false);
  upstream.destroy();
  socket.destroy();
});

for (const source of ["query", "header"]) {
  test(`valid client IDs from the ${source} are forwarded unchanged`, (context) => {
    const id = "client_0123456789";
    const req = request(source === "query" ? id : "");
    if (source === "header") req.headers["x-pixelated-client-id"] = id;
    let headers: http.OutgoingHttpHeaders | undefined;
    context.mock.method(http, "request", ((options: http.RequestOptions) => {
      headers = options.headers as http.OutgoingHttpHeaders;
      return new PassThrough() as unknown as ClientRequest;
    }) as typeof http.request);
    proxyHttpRequest(req, new Response() as unknown as ServerResponse, "engine-token");
    assert.equal(headers?.["x-pixelated-client-id"], id);
    req.destroy();
  });
}
