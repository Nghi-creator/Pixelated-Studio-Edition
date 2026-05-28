import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createLobbyManager } from "./lobby";
import { registerInputHandlers } from "./inputHandlers";

class FakeSocket extends EventEmitter {
  data: Record<string, unknown> = {};
  outbound: Array<{ event: string; payload: unknown }> = [];
  id: string;

  constructor(id: string) {
    super();
    this.id = id;
  }

  emit(event: string, payload?: unknown) {
    if (event === "engine-error") {
      this.outbound.push({ event, payload });
      return true;
    }

    return super.emit(event, payload);
  }

  to() {
    return {
      emit: () => undefined,
    };
  }
}

const runtime = {
  getActiveSessionId: () => "session-1",
};

test("host input for player slot 1 is injected", () => {
  const lobby = createLobbyManager();
  const host = new FakeSocket("host-1");
  const injected: Array<{ action: string; linuxKey: string }> = [];

  lobby.joinLobby(host as never, { sessionId: "session-1" });
  registerInputHandlers(host as never, runtime, {
    canSendInput: lobby.canSendInput,
    injectKey: (action, linuxKey) => injected.push({ action, linuxKey }),
  });

  host.emit("keydown", {
    key: "ArrowRight",
    playerIndex: 1,
    sessionId: "session-1",
  });

  assert.deepEqual(injected, [{ action: "keydown", linuxKey: "Right" }]);
  assert.deepEqual(host.outbound, []);
});

test("guest input for assigned player slot 2 uses player 2 key mapping", () => {
  const lobby = createLobbyManager();
  const host = new FakeSocket("host-1");
  const guest = new FakeSocket("guest-1");
  const injected: Array<{ action: string; linuxKey: string }> = [];

  lobby.joinLobby(host as never, { sessionId: "session-1" });
  lobby.joinLobby(guest as never, { sessionId: "session-1" });
  lobby.requestPlayerSlot(guest as never, {
    playerIndex: 2,
    sessionId: "session-1",
  });
  registerInputHandlers(guest as never, runtime, {
    canSendInput: lobby.canSendInput,
    injectKey: (action, linuxKey) => injected.push({ action, linuxKey }),
  });

  guest.emit("keyup", {
    key: "ArrowRight",
    playerIndex: 2,
    sessionId: "session-1",
  });

  assert.deepEqual(injected, [{ action: "keyup", linuxKey: "d" }]);
  assert.deepEqual(guest.outbound, []);
});

test("spectator input is rejected", () => {
  const lobby = createLobbyManager();
  const host = new FakeSocket("host-1");
  const spectator = new FakeSocket("spectator-1");
  const injected: Array<{ action: string; linuxKey: string }> = [];

  lobby.joinLobby(host as never, { sessionId: "session-1" });
  lobby.joinLobby(spectator as never, { sessionId: "session-1" });
  registerInputHandlers(spectator as never, runtime, {
    canSendInput: lobby.canSendInput,
    injectKey: (action, linuxKey) => injected.push({ action, linuxKey }),
  });

  spectator.emit("keydown", {
    key: "ArrowRight",
    playerIndex: 2,
    sessionId: "session-1",
  });

  assert.deepEqual(injected, []);
  assert.equal(
    (spectator.outbound[0].payload as { message: string }).message,
    "Input is not allowed for this player slot.",
  );
});

test("assigned player cannot send input for another slot", () => {
  const lobby = createLobbyManager();
  const host = new FakeSocket("host-1");
  const guest = new FakeSocket("guest-1");
  const injected: Array<{ action: string; linuxKey: string }> = [];

  lobby.joinLobby(host as never, { sessionId: "session-1" });
  lobby.joinLobby(guest as never, { sessionId: "session-1" });
  lobby.requestPlayerSlot(guest as never, {
    playerIndex: 2,
    sessionId: "session-1",
  });
  registerInputHandlers(guest as never, runtime, {
    canSendInput: lobby.canSendInput,
    injectKey: (action, linuxKey) => injected.push({ action, linuxKey }),
  });

  guest.emit("keydown", {
    key: "ArrowRight",
    playerIndex: 1,
    sessionId: "session-1",
  });

  assert.deepEqual(injected, []);
  assert.equal(
    (guest.outbound[0].payload as { message: string }).message,
    "Input is not allowed for this player slot.",
  );
});
