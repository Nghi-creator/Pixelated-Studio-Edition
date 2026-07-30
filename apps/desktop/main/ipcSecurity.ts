import path from "node:path";
import { pathToFileURL } from "node:url";

export function getTrustedRendererUrl(compiledMainDirectory: string) {
  return pathToFileURL(
    path.join(compiledMainDirectory, "../../index.html"),
  ).href;
}

export function isTrustedIpcSenderUrl(
  senderUrl: string | undefined,
  trustedRendererUrl: string,
) {
  if (!senderUrl) return false;
  try {
    const sender = new URL(senderUrl);
    const trusted = new URL(trustedRendererUrl);
    sender.hash = "";
    sender.search = "";
    return sender.href === trusted.href;
  } catch {
    return false;
  }
}
