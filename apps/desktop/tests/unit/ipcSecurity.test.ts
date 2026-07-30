import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  getTrustedRendererUrl,
  isTrustedIpcSenderUrl,
} from "../../main/ipcSecurity";

test("desktop IPC accepts only the packaged renderer document", () => {
  const compiledMainDirectory = path.join(
    path.sep,
    "Applications",
    "Pixelated Studio",
    "resources",
    "app.asar",
    "dist",
    "main",
  );
  const trustedUrl = getTrustedRendererUrl(compiledMainDirectory);

  assert.equal(
    trustedUrl,
    pathToFileURL(
      path.join(compiledMainDirectory, "../../index.html"),
    ).href,
  );
  assert.equal(isTrustedIpcSenderUrl(trustedUrl, trustedUrl), true);
  assert.equal(
    isTrustedIpcSenderUrl(`${trustedUrl}#section`, trustedUrl),
    true,
  );
  assert.equal(
    isTrustedIpcSenderUrl("https://attacker.example/index.html", trustedUrl),
    false,
  );
  assert.equal(isTrustedIpcSenderUrl(undefined, trustedUrl), false);
});
