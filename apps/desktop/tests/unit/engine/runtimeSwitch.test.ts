import assert from "node:assert/strict";
import test from "node:test";
import { getRuntimeSwitchBlocker } from "../../../main/engine/runtimeSwitch";

test("runtime switches are allowed when no session clients are active", () => {
  assert.equal(getRuntimeSwitchBlocker([]), null);
  assert.equal(
    getRuntimeSwitchBlocker([
      { role: "paired", sessionId: null, socketCount: 0 },
      { role: "camera", sessionId: "session-1", socketCount: 1 },
    ]),
    null,
  );
});

test("runtime switches are blocked while active session clients are connected", () => {
  const blocker = getRuntimeSwitchBlocker([
    { role: "host", sessionId: "session-1", socketCount: 1 },
    { role: "player", sessionId: "session-1", socketCount: 1 },
    { role: "spectator", sessionId: "session-2", socketCount: 1 },
  ]);

  assert.equal(blocker?.code, "runtime_switch_active_session");
  assert.equal(blocker?.activeClientCount, 3);
  assert.equal(blocker?.activeSessionCount, 2);
});

test("runtime switches ignore stale clients after the active session stops", () => {
  assert.equal(
    getRuntimeSwitchBlocker(
      [
        { role: "host", sessionId: "session-1", socketCount: 1 },
        { role: "spectator", sessionId: "session-1", socketCount: 1 },
      ],
      null,
    ),
    null,
  );

  const blocker = getRuntimeSwitchBlocker(
    [
      { role: "host", sessionId: "session-1", socketCount: 1 },
      { role: "spectator", sessionId: "session-2", socketCount: 1 },
    ],
    "session-2",
  );

  assert.equal(blocker?.activeClientCount, 1);
  assert.equal(blocker?.activeSessionCount, 1);
});
