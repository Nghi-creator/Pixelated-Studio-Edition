import assert from "node:assert/strict";
import test from "node:test";
import {
  getNextBrowserSmokePollDelay,
  hasNewTerminalBrowserSmokeResult,
} from "../../../src/features/admin/browserSmokePolling.ts";

test("browser smoke polling stops only for a newly recorded terminal result", () => {
  assert.equal(
    hasNewTerminalBrowserSmokeResult("old", {
      status: "passed",
      testedAt: "old",
    }),
    false,
  );
  assert.equal(
    hasNewTerminalBrowserSmokeResult("old", {
      status: "failed",
      testedAt: "new",
    }),
    true,
  );
  assert.equal(
    hasNewTerminalBrowserSmokeResult(null, {
      status: "passed",
      testedAt: "new",
    }),
    true,
  );
});

test("browser smoke polling backs off to a bounded delay", () => {
  assert.equal(getNextBrowserSmokePollDelay(2_500), 3_750);
  assert.equal(getNextBrowserSmokePollDelay(9_000), 10_000);
  assert.equal(getNextBrowserSmokePollDelay(10_000), 10_000);
});
