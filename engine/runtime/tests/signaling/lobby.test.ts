import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createLobbyManager } from "../../src/signaling/lobby";

class FakeSocket extends EventEmitter {
  data: Record<string, unknown> = {};
  outbound: Array<{ event: string; payload: unknown }> = [];
  id: string;
  relays: Array<{ event: string; payload: unknown; room: string }> = [];

  constructor(id: string) {
    super();
    this.id = id;
  }

  emit(event: string, payload?: unknown) {
    this.outbound.push({ event, payload });
    return true;
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
  const host = new FakeSocket("host-1");
  const guest = new FakeSocket("guest-1");

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
