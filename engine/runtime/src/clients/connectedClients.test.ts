import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isEngineAccessRevoked,
  listConnectedClients,
  revokeConnectedClient,
  trackHttpClient,
} from "./connectedClients";

function requestFor(clientId: string) {
  return {
    get(name: string) {
      const headers: Record<string, string> = {
        "user-agent": `Test Browser ${clientId}`,
        "x-pixelated-access-id": `access-${clientId}`,
        "x-pixelated-access-scope": "companion-host",
        "x-pixelated-client-id": clientId,
      };
      return headers[name.toLowerCase()] || "";
    },
    ip: `127.0.0.${clientId === "client-one" ? "1" : "2"}`,
    socket: {},
  };
}

function controlRequestWithoutClientId() {
  return {
    get(name: string) {
      return name.toLowerCase() === "user-agent" ? "Desktop control" : "";
    },
    ip: "127.0.0.1",
    socket: {},
  };
}

function requestWithAccessOnly(accessId: string) {
  return {
    get(name: string) {
      const headers: Record<string, string> = {
        "user-agent": "Older hosted bundle",
        "x-pixelated-access-id": accessId,
        "x-pixelated-access-scope": "companion-host",
      };
      return headers[name.toLowerCase()] || "";
    },
    ip: "127.0.0.3",
    socket: {},
  };
}

function socketFor(clientId: string) {
  const emitted: unknown[] = [];
  return {
    data: { engineClientId: clientId },
    disconnectCalled: false,
    emit(_event: string, payload: unknown) {
      emitted.push(payload);
    },
    disconnect() {
      this.disconnectCalled = true;
    },
    emitted,
  };
}

test("connected client revocation targets one browser client", () => {
  trackHttpClient(requestFor("client-one") as never);
  trackHttpClient(requestFor("client-two") as never);

  const firstSocket = socketFor("client-one");
  const secondSocket = socketFor("client-two");
  const io = {
    sockets: {
      sockets: new Map([
        ["first", firstSocket],
        ["second", secondSocket],
      ]),
    },
  };

  const disconnected = revokeConnectedClient(io as never, "client-one");

  assert.equal(disconnected, 1);
  assert.equal(isEngineAccessRevoked("access-client-one"), true);
  assert.equal(isEngineAccessRevoked("access-client-two"), false);
  assert.equal(firstSocket.disconnectCalled, true);
  assert.equal(secondSocket.disconnectCalled, false);
  assert.deepEqual(firstSocket.emitted, [
    {
      code: "engine_access_revoked",
      message:
        "Host revoked this browser's engine access. Pair the local engine again to continue.",
    },
  ]);
  assert.deepEqual(
    listConnectedClients().map((client) => client.id),
    ["client-two"],
  );

  trackHttpClient(controlRequestWithoutClientId() as never);
  assert.deepEqual(
    listConnectedClients().map((client) => client.id),
    ["client-two"],
  );

  trackHttpClient(requestWithAccessOnly("access-legacy") as never);
  assert.deepEqual(
    listConnectedClients().map((client) => client.id),
    ["client-two", "access_access-legacy"],
  );
});
