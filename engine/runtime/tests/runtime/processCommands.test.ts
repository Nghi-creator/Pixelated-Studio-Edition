import assert from "node:assert/strict";
import test from "node:test";
import { pulseAudioArgs, xdotoolArgs } from "../../src/runtime/processes/processCommands";

test("process commands keep values as literal arguments", () => {
  assert.deepEqual(xdotoolArgs("keydown", "semicolon;still-a-key"), [
    "keydown",
    "semicolon;still-a-key",
  ]);
  assert.deepEqual(pulseAudioArgs, [
    "--daemonize=yes",
    "--exit-idle-time=-1",
    "--disable-shm=yes",
    "--load=module-native-protocol-tcp auth-anonymous=1",
  ]);
});
