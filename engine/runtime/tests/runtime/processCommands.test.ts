import assert from "node:assert/strict";
import test from "node:test";
import { pulseAudioArgs, xdotoolArgs } from "../../src/runtime/processCommands";

test("process commands keep values as literal arguments", () => {
  assert.deepEqual(xdotoolArgs("keydown", "semicolon;still-a-key"), [
    "keydown",
    "semicolon;still-a-key",
  ]);
  assert.deepEqual(pulseAudioArgs, [
    "-D",
    "--system",
    "--disallow-exit",
    "--disable-shm=yes",
    "--load=module-native-protocol-tcp auth-anonymous=1",
  ]);
});
