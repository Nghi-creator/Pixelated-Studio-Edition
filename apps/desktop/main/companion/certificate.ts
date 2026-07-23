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

function writeFileAtomic(filePath: string, contents: string, mode: number) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`,
  );

  try {
    fs.writeFileSync(temporaryPath, contents, {
      flag: "wx",
      mode,
    });
    fs.renameSync(temporaryPath, filePath);
    fs.chmodSync(filePath, mode);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function readMatchingCertificate(
  certPath: string,
  keyPath: string,
  lanAddresses: string[],
) {
  try {
    const cert = fs.readFileSync(certPath, "utf8");
    const key = fs.readFileSync(keyPath, "utf8");
    const certificate = new crypto.X509Certificate(cert);
    const privateKey = crypto.createPrivateKey(key);
    const certificateKey = certificate.publicKey.export({
      format: "der",
      type: "spki",
    });
    const privateKeyPublic = crypto.createPublicKey(privateKey).export({
      format: "der",
      type: "spki",
    });
    const validUntil = Date.parse(certificate.validTo);

    const matches =
      certificate.checkHost("localhost") === "localhost" &&
      certificate.checkHost("pixelated.local") === "pixelated.local" &&
      certificate.checkIP("127.0.0.1") === "127.0.0.1" &&
      lanAddresses.every((address) => certificate.checkIP(address) === address) &&
      validUntil > Date.now() + CERTIFICATE_RENEWAL_WINDOW_MS &&
      certificateKey.equals(privateKeyPublic);

    return matches ? { cert, key } : null;
  } catch {
    return null;
  }
}

export function createCompanionCertificate(
  certDir: string,
  lanAddresses: string[] = [],
): CertificatePaths {
  fs.mkdirSync(certDir, { mode: 0o700, recursive: true });
  fs.chmodSync(certDir, 0o700);
  const certPath = path.join(certDir, "pixelated-companion.crt");
  const keyPath = path.join(certDir, "pixelated-companion.key");

  const existingCertificate = readMatchingCertificate(
    certPath,
    keyPath,
    lanAddresses,
  );
  if (existingCertificate) {
    writeFileAtomic(certPath, existingCertificate.cert, 0o644);
    writeFileAtomic(keyPath, existingCertificate.key, 0o600);
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

  writeFileAtomic(certPath, pems.cert, 0o644);
  writeFileAtomic(keyPath, pems.private, 0o600);

  return { certPath, keyPath };
}
