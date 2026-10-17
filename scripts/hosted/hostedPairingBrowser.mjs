import { createHash, X509Certificate } from "node:crypto";

export async function createHostedPairingBrowser(chromium, certificatePem) {
  const certificate = new X509Certificate(certificatePem);
  if (certificate.checkHost("localhost") !== "localhost")
    throw new Error("Hosted smoke companion certificate must identify localhost.");
  const key = certificate.publicKey.export({ type: "spki", format: "der" });
  const fingerprint = createHash("sha256").update(key).digest("base64");
  // Chromium applies this exception only to chains containing our temporary key.
  // Its normal certificate checks remain active for hosted services/other keys.
  const browser = await chromium.launch({
    headless: true,
    args: [`--ignore-certificate-errors-spki-list=${fingerprint}`],
  });
  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: false,
      viewport: { height: 900, width: 1440 },
    });
    return { browser, context };
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }
}
