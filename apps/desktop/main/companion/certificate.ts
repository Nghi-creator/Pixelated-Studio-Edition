import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

export type CertificatePaths = {
  certPath: string;
  keyPath: string;
};

export function createCompanionCertificate(
  certDir: string,
  lanAddresses: string[] = [],
): CertificatePaths {
  fs.mkdirSync(certDir, { recursive: true });
  const certPath = path.join(certDir, "pixelated-companion.crt");
  const keyPath = path.join(certDir, "pixelated-companion.key");

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return { certPath, keyPath };
  }

  const sanEntries = [
    "DNS:localhost",
    "DNS:pixelated.local",
    "IP:127.0.0.1",
    ...lanAddresses.map((address) => `IP:${address}`),
  ].join(",");

  execFileSync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-sha256",
    "-days",
    "365",
    "-subj",
    "/CN=pixelated.local",
    "-addext",
    `subjectAltName=${sanEntries}`,
  ]);

  return { certPath, keyPath };
}

