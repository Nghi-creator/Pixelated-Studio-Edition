import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createKeyboardBridge } from "../../src/input/keyboardBridge";

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = {
    writable: true,
    writes: [] as string[],
    write: (chunk: string) => {
      this.stdin.writes.push(chunk);
      return true;
    },
  };

  kill() {
    return true;
  }
}

test("keyboard input reuses one persistent bridge process", () => {
  const child = new FakeChildProcess();
  const spawned: Array<{ args: string[]; command: string }> = [];
  const keyboard = createKeyboardBridge({
    keyboardBridgePath: "/app/input_keyboard.py",
    spawnProcess: ((command: string, args: string[]) => {
      spawned.push({ args, command });
      return child;
    }) as never,
  });

  keyboard.start();
  child.stdout.emit("data", Buffer.from("[Keyboard] ready\n"));

  assert.equal(keyboard.sendInput("keydown", "z"), true);
  assert.equal(keyboard.sendInput("keyup", "z"), true);
  assert.deepEqual(spawned, [
    {
      args: ["-u", "/app/input_keyboard.py"],
      command: "python3",
    },
  ]);
  assert.deepEqual(
    child.stdin.writes.map((line) => JSON.parse(line)),
    [
      { action: "keydown", key: "z" },
      { action: "keyup", key: "z" },
    ],
  );
  assert.deepEqual(keyboard.getState(), {
    enabled: true,
    failed: false,
    ready: true,
  });
});

test("keyboard input is rejected when the persistent bridge is unavailable", () => {
  const keyboard = createKeyboardBridge({
    keyboardBridgePath: "/app/input_keyboard.py",
  });

  assert.equal(keyboard.sendInput("keydown", "z"), false);
});
