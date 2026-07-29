import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createLobbyManager } from "../../src/signaling/lobby/lobby";

type FakeNamespace = {
  sockets: Map<string, FakeSocket>;
};

class FakeSocket extends EventEmitter {
  data: Record<string, unknown> = {};
  disconnected = false;
  outbound: Array<{ event: string; payload: unknown }> = [];
  id: string;
  nsp: FakeNamespace;
  relays: Array<{ event: string; payload: unknown; room: string }> = [];
  rooms: Set<string>;

  constructor(
    id: string,
    nsp: FakeNamespace = { sockets: new Map<string, FakeSocket>() },
  ) {
    super();
    this.id = id;
    this.nsp = nsp;
    this.rooms = new Set([id]);
    nsp.sockets.set(id, this);
  }

  disconnect() {
    this.disconnected = true;
    this.rooms.clear();
    this.nsp.sockets.delete(this.id);
    return this;
  }

  emit(event: string, payload?: unknown) {
    this.outbound.push({ event, payload });
    return true;
  }

  join(room: string) {
    this.rooms.add(room);
  }

  leave(room: string) {
    this.rooms.delete(room);
  }

  to(room: string) {
    return {
      emit: (event: string, payload: unknown) => {
        this.relays.push({ event, payload, room });
      },
    };
  }
}

test("first lobby participant becomes host and owns player slot 1", () => {
  const lobby = createLobbyManager();
  const host = new FakeSocket("host-1");

  const participant = lobby.joinLobby(host as never, {
    displayName: "Host",
    requestedRole: "player",
    sessionId: "session-1",
  });

  assert.equal(participant?.role, "host");
  assert.equal(participant?.playerIndex, 1);
  assert.equal(lobby.canControlSession(host as never, "session-1"), true);
});

test("second host request is downgraded to spectator", () => {
  const lobby = createLobbyManager();
  const host = new FakeSocket("host-1");
  const guest = new FakeSocket("guest-1");

  lobby.joinLobby(host as never, {
    displayName: "Host",
    requestedRole: "host",
    sessionId: "session-1",
  });
  const participant = lobby.joinLobby(guest as never, {
    displayName: "Guest",
    requestedRole: "host",
    sessionId: "session-1",
  });

  assert.equal(participant?.role, "spectator");
  assert.equal(participant?.playerIndex, null);
  assert.equal(lobby.canControlSession(guest as never, "session-1"), false);
});

test("companion guests cannot acquire host control in an empty lobby", () => {
  const lobby = createLobbyManager();
  const guest = new FakeSocket("guest-1");
  guest.data.hostEligible = false;

  const participant = lobby.joinLobby(guest as never, {
    requestedRole: "host",
    sessionId: "session-1",
  });

  assert.equal(participant?.role, "spectator");
  assert.equal(participant?.playerIndex, null);
  assert.equal(lobby.canControlSession(guest as never, "session-1"), false);
});

test("sockets without lobby membership cannot control or send input", () => {
  const lobby = createLobbyManager();
  const socket = new FakeSocket("unjoined-1");

  assert.equal(lobby.canControlSession(socket as never, "session-1"), false);
  assert.equal(
    lobby.canSendInput(socket as never, "session-1", 1),
    false,
  );
});

test("host departure does not promote an ineligible companion guest", () => {
  const lobby = createLobbyManager();
  const host = new FakeSocket("host-1");
  const guest = new FakeSocket("guest-1");
  guest.data.hostEligible = false;

  lobby.joinLobby(host as never, { sessionId: "session-1" });
  lobby.joinLobby(guest as never, {
    requestedRole: "player",
    sessionId: "session-1",
  });
  lobby.leaveLobby(host as never, "session-1");

  assert.equal(lobby.getLobbyState("session-1").hostSocketId, null);
  assert.equal(lobby.canControlSession(guest as never, "session-1"), false);
});

test("switching sessions removes the socket from its previous lobby and rooms", () => {
  const lobby = createLobbyManager();
  const nsp: FakeNamespace = { sockets: new Map() };
  const host = new FakeSocket("host-1", nsp);
  const guest = new FakeSocket("guest-1", nsp);

  lobby.joinLobby(host as never, { sessionId: "session-1" });
  lobby.joinLobby(guest as never, {
    requestedRole: "player",
    sessionId: "session-1",
  });
  host.join("session:session-1:peer:old-peer");

  lobby.joinLobby(host as never, { sessionId: "session-2" });

  assert.deepEqual(
    lobby
      .getLobbyState("session-1")
      .participants.map((participant) => participant.socketId),
    ["guest-1"],
  );
  assert.equal(lobby.getLobbyState("session-1").hostSocketId, "guest-1");
  assert.equal(lobby.getLobbyState("session-2").hostSocketId, "host-1");
  assert.equal(host.rooms.has("session:session-1"), false);
  assert.equal(host.rooms.has("session:session-1:peer:old-peer"), false);
  assert.equal(host.rooms.has("session:session-2"), true);
});

test("guest can request an open player slot", () => {
  const lobby = createLobbyManager();
  const host = new FakeSocket("host-1");
  const guest = new FakeSocket("guest-1");

  lobby.joinLobby(host as never, { sessionId: "session-1" });
  lobby.joinLobby(guest as never, { sessionId: "session-1" });
  const participant = lobby.requestPlayerSlot(guest as never, {
    playerIndex: 2,
    sessionId: "session-1",
  });

  assert.equal(participant?.role, "player");
  assert.equal(participant?.playerIndex, 2);
});

test("host can kick a non-host participant", () => {
  const lobby = createLobbyManager();
  const nsp: FakeNamespace = { sockets: new Map() };
  const host = new FakeSocket("host-1", nsp);
  const guest = new FakeSocket("guest-1", nsp);

  lobby.joinLobby(host as never, { sessionId: "session-1" });
  lobby.joinLobby(guest as never, { sessionId: "session-1" });

  assert.equal(
    lobby.kickParticipant(host as never, {
      sessionId: "session-1",
      socketId: "guest-1",
    }),
    true,
  );
  assert.equal(lobby.getLobbyState("session-1").participants.length, 1);
  assert.equal(guest.disconnected, true);
  assert.deepEqual(guest.outbound.at(-1), {
    event: "lobby-kicked",
    payload: { sessionId: "session-1" },
  });
  assert.equal(nsp.sockets.has("guest-1"), false);
});

test("guest cannot kick another participant", () => {
  const lobby = createLobbyManager();
  const host = new FakeSocket("host-1");
  const guest = new FakeSocket("guest-1");

  lobby.joinLobby(host as never, { sessionId: "session-1" });
  lobby.joinLobby(guest as never, { sessionId: "session-1" });

  assert.equal(
    lobby.kickParticipant(guest as never, {
      sessionId: "session-1",
      socketId: "host-1",
    }),
    false,
  );
  assert.equal(lobby.getLobbyState("session-1").participants.length, 2);
});
