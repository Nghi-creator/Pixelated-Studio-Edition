import assert from "node:assert/strict";
import test from "node:test";
import { attachEngineInput, __testing } from "../../../src/lib/webrtc/webrtcInput.ts";

function keyboardEventFor(target: EventTarget) {
  return {
    defaultPrevented: false,
    target,
  } as unknown as KeyboardEvent;
}

test("game input ignores text-entry and editable targets", () => {
  const input = { tagName: "INPUT" } as unknown as EventTarget;
  const textarea = { tagName: "TEXTAREA" } as unknown as EventTarget;
  const select = { tagName: "SELECT" } as unknown as EventTarget;
  const editable = {
    isContentEditable: true,
    tagName: "DIV",
  } as unknown as EventTarget;

  assert.equal(__testing.shouldIgnoreGameInput(keyboardEventFor(input)), true);
  assert.equal(__testing.shouldIgnoreGameInput(keyboardEventFor(textarea)), true);
  assert.equal(__testing.shouldIgnoreGameInput(keyboardEventFor(select)), true);
  assert.equal(__testing.shouldIgnoreGameInput(keyboardEventFor(editable)), true);
});

test("game input accepts ordinary gameplay targets", () => {
  const stage = { tagName: "DIV" } as unknown as EventTarget;

  assert.equal(__testing.shouldIgnoreGameInput(keyboardEventFor(stage)), false);
});

test("game input respects explicit ignore containers and prevented events", () => {
  const button = {
    closest: (selector: string) =>
      selector === "[data-ignore-game-input]" ? ({} as Element) : null,
    tagName: "BUTTON",
  } as unknown as EventTarget;

  assert.equal(__testing.shouldIgnoreGameInput(keyboardEventFor(button)), true);
  assert.equal(
    __testing.shouldIgnoreGameInput({
      defaultPrevented: true,
      target: { tagName: "DIV" },
    } as unknown as KeyboardEvent),
    true,
  );
  assert.equal(
    __testing.shouldIgnoreGameInput(
      {
        defaultPrevented: true,
        target: { tagName: "DIV" },
      } as unknown as KeyboardEvent,
      { respectDefaultPrevented: false },
    ),
    false,
  );
});

test("game input maps browser keys to normalized game actions", () => {
  assert.equal(__testing.getGameActionForKey("ArrowUp"), "dpad_up");
  assert.equal(__testing.getGameActionForKey("", "ArrowUp"), "dpad_up");
  assert.equal(__testing.getGameActionForKey("z"), "face_south");
  assert.equal(__testing.getGameActionForKey("", "KeyZ"), "face_south");
  assert.equal(__testing.getGameActionForKey("x"), "face_east");
  assert.equal(__testing.getGameActionForKey("", "KeyX"), "face_east");
  assert.equal(__testing.getGameActionForKey("a"), "shoulder_left");
  assert.equal(__testing.getGameActionForKey("s"), "shoulder_right");
  assert.equal(__testing.getGameActionForKey("Enter"), "start");
  assert.equal(__testing.getGameActionForKey("Shift"), "select");
  assert.equal(__testing.getGameActionForKey("q"), "");
});

test("attached engine input still emits when gameplay keys already prevented page scroll", () => {
  const originalWindow = globalThis.window;
  const listeners = new Map<string, (event: KeyboardEvent) => void>();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload });
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: (event: string, handler: (event: KeyboardEvent) => void) => {
        listeners.set(event, handler);
      },
      removeEventListener: (event: string) => {
        listeners.delete(event);
      },
    },
  });

  try {
    const detach = attachEngineInput(socket as never, "session-1", 1);
    listeners.get("keydown")?.({
      code: "ArrowUp",
      defaultPrevented: true,
      key: "ArrowUp",
      preventDefault: () => undefined,
      repeat: false,
      target: { tagName: "DIV" },
    } as unknown as KeyboardEvent);

    assert.deepEqual(emitted, [
      {
        event: "keydown",
        payload: {
          gameAction: "dpad_up",
          playerIndex: 1,
          sessionId: "session-1",
        },
      },
    ]);
    detach();
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

test("attached engine input emits normalized actions", () => {
  const originalWindow = globalThis.window;
  const listeners = new Map<string, (event: KeyboardEvent) => void>();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload });
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: (event: string, handler: (event: KeyboardEvent) => void) => {
        listeners.set(event, handler);
      },
      removeEventListener: (event: string) => {
        listeners.delete(event);
      },
    },
  });

  try {
    const detach = attachEngineInput(socket as never, "session-1", 2);
    listeners.get("keydown")?.({
      defaultPrevented: false,
      key: "a",
      preventDefault: () => undefined,
      repeat: false,
      target: { tagName: "DIV" },
    } as unknown as KeyboardEvent);
    listeners.get("keyup")?.({
      defaultPrevented: false,
      key: "a",
      preventDefault: () => undefined,
      target: { tagName: "DIV" },
    } as unknown as KeyboardEvent);

    assert.deepEqual(emitted, [
      {
        event: "keydown",
        payload: {
          gameAction: "shoulder_left",
          playerIndex: 2,
          sessionId: "session-1",
        },
      },
      {
        event: "keyup",
        payload: {
          gameAction: "shoulder_left",
          playerIndex: 2,
          sessionId: "session-1",
        },
      },
    ]);
    detach();
    assert.equal(listeners.size, 0);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});
