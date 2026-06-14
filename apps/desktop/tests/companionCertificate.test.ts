import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createCompanionCertificate } from "../main/companion/certificate";

test("companion certificate helper reuses an existing certificate pair", (t) => {
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixelated-cert-"));
  t.after(() => fs.rmSync(certDir, { force: true, recursive: true }));
  const certPath = path.join(certDir, "pixelated-companion.crt");
  const keyPath = path.join(certDir, "pixelated-companion.key");
  fs.writeFileSync(certPath, "certificate");
  fs.writeFileSync(keyPath, "key");

  assert.deepEqual(createCompanionCertificate(certDir), { certPath, keyPath });
});
