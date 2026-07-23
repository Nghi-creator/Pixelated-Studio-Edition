import crypto from "crypto";
import fs from "fs";
import path from "path";
import { generate } from "selfsigned";

export type CertificatePaths = {
  certPath: string;
  keyPath: string;
};

const CERTIFICATE_VALIDITY_DAYS = 365;
const CERTIFICATE_RENEWAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function certificateMatches(
  certPath: string,
  keyPath: string,
  lanAddresses: string[],
) {
  try {
    const certificate = new crypto.X509Certificate(fs.readFileSync(certPath));
    const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath));
    const certificateKey = certificate.publicKey.export({
      format: "der",
      type: "spki",
    });
    const privateKeyPublic = crypto.createPublicKey(privateKey).export({
      format: "der",
      type: "spki",
    });
    const validUntil = Date.parse(certificate.validTo);

    return (
      certificate.checkHost("localhost") === "localhost" &&
      certificate.checkHost("pixelated.local") === "pixelated.local" &&
      certificate.checkIP("127.0.0.1") === "127.0.0.1" &&
      lanAddresses.every((address) => certificate.checkIP(address) === address) &&
      validUntil > Date.now() + CERTIFICATE_RENEWAL_WINDOW_MS &&
      certificateKey.equals(privateKeyPublic)
    );
  } catch {
    return false;
  }
}

export function createCompanionCertificate(
  certDir: string,
  lanAddresses: string[] = [],
): CertificatePaths {
  fs.mkdirSync(certDir, { recursive: true });
  const certPath = path.join(certDir, "pixelated-companion.crt");
  const keyPath = path.join(certDir, "pixelated-companion.key");

  if (
    fs.existsSync(certPath) &&
    fs.existsSync(keyPath) &&
    certificateMatches(certPath, keyPath, lanAddresses)
  ) {
    fs.chmodSync(keyPath, 0o600);
    return { certPath, keyPath };
  }

  const pems = generate(
    [{ name: "commonName", value: "pixelated.local" }],
    {
      algorithm: "sha256",
      days: CERTIFICATE_VALIDITY_DAYS,
      extensions: [
        {
          name: "basicConstraints",
          cA: false,
        },
        {
          name: "keyUsage",
          digitalSignature: true,
          keyEncipherment: true,
        },
        {
          name: "extKeyUsage",
          serverAuth: true,
        },
        {
          name: "subjectAltName",
          altNames: [
            { type: 2, value: "localhost" },
            { type: 2, value: "pixelated.local" },
            { type: 7, ip: "127.0.0.1" },
            ...lanAddresses.map((address) => ({ type: 7, ip: address })),
          ],
        },
      ],
      keySize: 2048,
    },
  );

  fs.writeFileSync(certPath, pems.cert, { mode: 0o644 });
  fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });

  return { certPath, keyPath };
}
