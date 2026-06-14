import assert from "node:assert/strict";
import test from "node:test";
import { __testing } from "../src/lib/webrtc/webrtcInput.ts";

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
});
