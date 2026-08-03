import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import {
  DESKTOP_OPEN_URL,
  DESKTOP_RELEASES_URL,
} from "../../../src/features/local-engine/desktopAppLaunch.ts";

describe("desktop launch panel", () => {
  it("uses the allowlisted app protocol without putting credentials in it", () => {
    const launchUrl = new URL(DESKTOP_OPEN_URL);

    assert.equal(launchUrl.protocol, "pixelated-studio:");
    assert.equal(launchUrl.hostname, "open");
    assert.equal(launchUrl.search, "");
    assert.equal(launchUrl.hash, "");
  });

  it("provides a trusted release fallback", () => {
    assert.equal(
      DESKTOP_RELEASES_URL,
      "https://github.com/Nghi-creator/Pixelated-Studio-Edition/releases/latest",
    );
  });

  it("does not infer launch failure from an elapsed-time timeout", () => {
    const panelSource = fs.readFileSync(
      new URL(
        "../../../src/features/local-engine/DesktopLaunchPanel.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    assert.doesNotMatch(panelSource, /setTimeout|setInterval|HELP_DELAY/);
  });
});
