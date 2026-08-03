import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DESKTOP_LAUNCH_HELP_DELAY_MS,
  DESKTOP_OPEN_URL,
  DESKTOP_RELEASES_URL,
} from "../../../src/features/local-engine/desktopAppLaunch.ts";

describe("desktop launch step", () => {
  it("uses the allowlisted app protocol without putting credentials in it", () => {
    const launchUrl = new URL(DESKTOP_OPEN_URL);

    assert.equal(launchUrl.protocol, "pixelated-studio:");
    assert.equal(launchUrl.hostname, "open");
    assert.equal(launchUrl.search, "");
    assert.equal(launchUrl.hash, "");
  });

  it("provides a bounded recovery delay and a trusted release fallback", () => {
    assert.ok(DESKTOP_LAUNCH_HELP_DELAY_MS >= 3_000);
    assert.ok(DESKTOP_LAUNCH_HELP_DELAY_MS <= 10_000);
    assert.equal(
      DESKTOP_RELEASES_URL,
      "https://github.com/Nghi-creator/Pixelated-Studio-Edition/releases/latest",
    );
  });
});
