import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DESKTOP_OPEN_URL,
  findSupportedDesktopDeepLink,
  isSupportedDesktopDeepLink,
} from "../../main/deepLink";

describe("desktop deep links", () => {
  it("accepts only the allowlisted open action", () => {
    assert.equal(isSupportedDesktopDeepLink(DESKTOP_OPEN_URL), true);
    assert.equal(isSupportedDesktopDeepLink(`${DESKTOP_OPEN_URL}/`), true);
    assert.equal(isSupportedDesktopDeepLink("pixelated-studio://start-engine"), false);
    assert.equal(isSupportedDesktopDeepLink("pixelated-studio://open?token=secret"), false);
    assert.equal(isSupportedDesktopDeepLink("https://open"), false);
    assert.equal(isSupportedDesktopDeepLink("not a url"), false);
  });

  it("finds a supported link without trusting unrelated arguments", () => {
    assert.equal(
      findSupportedDesktopDeepLink(["Pixelated Studio", "--flag", DESKTOP_OPEN_URL]),
      DESKTOP_OPEN_URL,
    );
    assert.equal(
      findSupportedDesktopDeepLink(["Pixelated Studio", "pixelated-studio://unknown"]),
      null,
    );
  });
});
