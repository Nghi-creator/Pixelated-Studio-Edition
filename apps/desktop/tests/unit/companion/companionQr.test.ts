import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCompanionQrDataUrl } from "../../../main/companion/qr";

describe("desktop companion QR", () => {
  it("renders the advertised companion join URL as a PNG data URL", async () => {
    const qrDataUrl = await createCompanionQrDataUrl(
      "https://192.168.1.25:8090",
    );

    assert.match(qrDataUrl, /^data:image\/png;base64,/);
    assert.ok(qrDataUrl.length > 500);
  });

  it("rejects an empty companion join URL", async () => {
    await assert.rejects(
      createCompanionQrDataUrl("  "),
      /companion join URL is required/,
    );
  });
});
