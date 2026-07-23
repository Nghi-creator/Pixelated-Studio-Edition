import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createCompanionCertificate } from "../../../main/companion/certificate";

test("companion certificate helper generates and reuses a valid certificate pair", (t) => {
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixelated-cert-"));
  t.after(() => fs.rmSync(certDir, { force: true, recursive: true }));
  const certPath = path.join(certDir, "pixelated-companion.crt");
  const keyPath = path.join(certDir, "pixelated-companion.key");

  assert.deepEqual(createCompanionCertificate(certDir, ["192.0.2.10"]), {
    certPath,
    keyPath,
  });
  const originalCertificate = fs.readFileSync(certPath, "utf8");
  const certificate = new crypto.X509Certificate(originalCertificate);
  assert.equal(certificate.checkHost("pixelated.local"), "pixelated.local");
  assert.equal(certificate.checkIP("192.0.2.10"), "192.0.2.10");
  assert.equal(fs.statSync(keyPath).mode & 0o777, 0o600);

  assert.deepEqual(createCompanionCertificate(certDir, ["192.0.2.10"]), {
    certPath,
    keyPath,
  });
  assert.equal(fs.readFileSync(certPath, "utf8"), originalCertificate);
});

test("companion certificate helper renews stale or mismatched certificates", (t) => {
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixelated-cert-"));
  t.after(() => fs.rmSync(certDir, { force: true, recursive: true }));
  const certPath = path.join(certDir, "pixelated-companion.crt");

  createCompanionCertificate(certDir, ["192.0.2.10"]);
  const originalCertificate = fs.readFileSync(certPath, "utf8");
  createCompanionCertificate(certDir, ["192.0.2.11"]);

  const renewedCertificate = fs.readFileSync(certPath, "utf8");
  assert.notEqual(renewedCertificate, originalCertificate);
  assert.equal(
    new crypto.X509Certificate(renewedCertificate).checkIP("192.0.2.11"),
    "192.0.2.11",
  );
});
