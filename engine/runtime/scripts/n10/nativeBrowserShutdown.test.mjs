import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import net from "node:net";
import { createRequire } from "node:module";
import test from "node:test";
import { Server } from "socket.io";

const require = createRequire(import.meta.url);
const { ownRelayShutdown } = require("./nativeBrowserShutdown.cjs");

async function within(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("owned relay shutdown stalled")), 500);
    })]);
  } finally { clearTimeout(timer); }
}

test("relay close releases an accepted socket that never sent an HTTP request", { timeout: 2000 }, async () => {
  const server = http.createServer();
  const io = new Server(server);
  const close = ownRelayShutdown(server, io);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const client = net.connect(server.address().port, "127.0.0.1");
  try {
    await once(client, "connect");
    // Exercise an unused connection separately from upgraded connections.
    const clientClosed = once(client, "close");
    const closing = close();
    assert.equal(close(), closing, "shutdown retains its original completion");
    await within(closing);
    await clientClosed;
    assert.equal(server.listening, false);
    assert.equal(client.destroyed, true);
  } finally {
    client.destroy();
    server.closeAllConnections();
    await io.close();
  }
});

test("relay close releases an upgraded owned connection too", { timeout: 2000 }, async () => {
  const server = http.createServer();
  const io = new Server(server);
  const close = ownRelayShutdown(server, io);
  let upgraded;
  server.on("upgrade", (request, socket) => {
    if (request.url !== "/held") return;
    upgraded = socket;
    socket.write("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: held\r\n\r\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const client = net.connect(server.address().port, "127.0.0.1");
  try {
    await once(client, "connect");
    client.write("GET /held HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: held\r\n\r\n");
    await once(client, "data");
    assert.ok(upgraded);
    const clientClosed = once(client, "close");
    await within(close());
    await clientClosed;
    assert.equal(upgraded.destroyed, true);
  } finally {
    client.destroy();
    upgraded?.destroy();
    server.closeAllConnections();
    await io.close();
  }
});
