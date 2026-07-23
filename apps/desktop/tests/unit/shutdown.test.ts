import assert from "node:assert/strict";
import test from "node:test";
import { createShutdownCoordinator } from "../../main/shutdown";

test("shutdown waits for engine cleanup before quitting", async () => {
  let finishCleanup: (() => void) | undefined;
  let cleanupCalls = 0;
  let quitCalls = 0;
  let prevented = 0;
  const coordinator = createShutdownCoordinator(
    () => {
      cleanupCalls += 1;
      return new Promise<void>((resolve) => {
        finishCleanup = resolve;
      });
    },
    () => {
      quitCalls += 1;
    },
  );
  const event = {
    preventDefault: () => {
      prevented += 1;
    },
  };

  coordinator.handleBeforeQuit(event);
  coordinator.handleBeforeQuit(event);
  assert.equal(cleanupCalls, 1);
  assert.equal(prevented, 2);
  assert.equal(quitCalls, 0);

  finishCleanup?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(quitCalls, 1);

  coordinator.handleBeforeQuit(event);
  assert.equal(prevented, 2);
});
