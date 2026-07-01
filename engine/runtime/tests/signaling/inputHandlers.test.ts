import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createLobbyManager } from "../../src/signaling/lobby";
import { registerInputHandlers } from "../../src/signaling/inputHandlers";

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
  const inputs: Array<{ action: string; key: unknown; playerIndex: number }> = [];

  lobby.joinLobby(host as never, { sessionId: "session-1" });
  registerInputHandlers(host as never, runtime, {
    canSendInput: lobby.canSendInput,
    sendInput: (action, key, playerIndex) => {
      inputs.push({ action, key, playerIndex });
      return true;
    },
  });

  host.emit("keydown", {
    key: "ArrowRight",
    playerIndex: 1,
    sessionId: "session-1",
  });

  assert.deepEqual(inputs, [
    { action: "keydown", key: "ArrowRight", playerIndex: 1 },
  ]);
  assert.deepEqual(host.outbound, []);
});

test("guest input for assigned player slot 2 is routed to slot 2", () => {
  const lobby = createLobbyManager();
  const host = new FakeSocket("host-1");
  const guest = new FakeSocket("guest-1");
  const inputs: Array<{ action: string; key: unknown; playerIndex: number }> = [];

  lobby.joinLobby(host as never, { sessionId: "session-1" });
  lobby.joinLobby(guest as never, { sessionId: "session-1" });
  lobby.requestPlayerSlot(guest as never, {
    playerIndex: 2,
    sessionId: "session-1",
  });
  registerInputHandlers(guest as never, runtime, {
    canSendInput: lobby.canSendInput,
    sendInput: (action, key, playerIndex) => {
      inputs.push({ action, key, playerIndex });
      return true;
    },
  });

  guest.emit("keyup", {
    key: "ArrowRight",
    playerIndex: 2,
    sessionId: "session-1",
  });

  assert.deepEqual(inputs, [
    { action: "keyup", key: "ArrowRight", playerIndex: 2 },
  ]);
  assert.deepEqual(guest.outbound, []);
});

test("normalized game actions are routed instead of browser key names", () => {
  const lobby = createLobbyManager();
  const host = new FakeSocket("host-1");
  const inputs: Array<{ action: string; key: unknown; playerIndex: number }> = [];

  lobby.joinLobby(host as never, { sessionId: "session-1" });
  registerInputHandlers(host as never, runtime, {
    canSendInput: lobby.canSendInput,
    sendInput: (action, key, playerIndex) => {
      inputs.push({ action, key, playerIndex });
      return true;
    },
  });

  host.emit("keydown", {
    gameAction: "shoulder_left",
    key: "ArrowRight",
    playerIndex: 1,
    sessionId: "session-1",
  });

  assert.deepEqual(inputs, [
    { action: "keydown", key: "shoulder_left", playerIndex: 1 },
  ]);
});

test("guest input for assigned player slot 4 is routed when virtual gamepads accept it", () => {
  const lobby = createLobbyManager();
  const host = new FakeSocket("host-1");
  const guest = new FakeSocket("guest-1");
  const inputs: Array<{ action: string; key: unknown; playerIndex: number }> = [];

  lobby.joinLobby(host as never, { sessionId: "session-1" });
  lobby.joinLobby(guest as never, { sessionId: "session-1" });
  lobby.requestPlayerSlot(guest as never, {
    playerIndex: 4,
    sessionId: "session-1",
  });
  registerInputHandlers(guest as never, runtime, {
    canSendInput: lobby.canSendInput,
    sendInput: (action, key, playerIndex) => {
      inputs.push({ action, key, playerIndex });
      return true;
    },
  });

  guest.emit("keydown", {
    key: "ArrowRight",
    playerIndex: 4,
    sessionId: "session-1",
  });

  assert.deepEqual(inputs, [
    { action: "keydown", key: "ArrowRight", playerIndex: 4 },
  ]);
  assert.deepEqual(guest.outbound, []);
});

test("spectator input is rejected", () => {
  const lobby = createLobbyManager();
  const host = new FakeSocket("host-1");
  const spectator = new FakeSocket("spectator-1");
  const inputs: Array<{ action: string; key: unknown; playerIndex: number }> = [];

  lobby.joinLobby(host as never, { sessionId: "session-1" });
  lobby.joinLobby(spectator as never, { sessionId: "session-1" });
  registerInputHandlers(spectator as never, runtime, {
    canSendInput: lobby.canSendInput,
    sendInput: (action, key, playerIndex) => {
      inputs.push({ action, key, playerIndex });
      return true;
    },
  });

  spectator.emit("keydown", {
    key: "ArrowRight",
    playerIndex: 2,
    sessionId: "session-1",
  });

  assert.deepEqual(inputs, []);
  assert.equal(
    (spectator.outbound[0].payload as { message: string }).message,
    "Input is not allowed for this player slot.",
  );
});

test("assigned player cannot send input for another slot", () => {
  const lobby = createLobbyManager();
  const host = new FakeSocket("host-1");
  const guest = new FakeSocket("guest-1");
  const inputs: Array<{ action: string; key: unknown; playerIndex: number }> = [];

  lobby.joinLobby(host as never, { sessionId: "session-1" });
  lobby.joinLobby(guest as never, { sessionId: "session-1" });
  lobby.requestPlayerSlot(guest as never, {
    playerIndex: 2,
    sessionId: "session-1",
  });
  registerInputHandlers(guest as never, runtime, {
    canSendInput: lobby.canSendInput,
    sendInput: (action, key, playerIndex) => {
      inputs.push({ action, key, playerIndex });
      return true;
    },
  });

  guest.emit("keydown", {
    key: "ArrowRight",
    playerIndex: 1,
    sessionId: "session-1",
  });

  assert.deepEqual(inputs, []);
  assert.equal(
    (guest.outbound[0].payload as { message: string }).message,
    "Input is not allowed for this player slot.",
  );
});

test("player slot 3 receives a clear error when virtual gamepads are unavailable", () => {
  const lobby = createLobbyManager();
  const host = new FakeSocket("host-1");
  const guest = new FakeSocket("guest-1");

  lobby.joinLobby(host as never, { sessionId: "session-1" });
  lobby.joinLobby(guest as never, { sessionId: "session-1" });
  lobby.requestPlayerSlot(guest as never, {
    playerIndex: 3,
    sessionId: "session-1",
  });
  registerInputHandlers(guest as never, runtime, {
    canSendInput: lobby.canSendInput,
    sendInput: () => false,
  });

  guest.emit("keydown", {
    key: "ArrowRight",
    playerIndex: 3,
    sessionId: "session-1",
  });

  assert.equal(
    (guest.outbound[0].payload as { message: string }).message,
    "Player slots 3 and 4 need virtual gamepad support. Start the engine with /dev/uinput available.",
  );
});
