import path from "node:path";

export const BROWSER_CORE_IDS = ["fceumm", "gambatte"] as const;
export const BROWSER_SYSTEM_IDS = ["nes", "gb", "gbc"] as const;

export type BrowserCoreId = (typeof BROWSER_CORE_IDS)[number];
export type BrowserSystemId = (typeof BROWSER_SYSTEM_IDS)[number];

export type BrowserCoreTarget = {
  coreId: BrowserCoreId;
  systemId: BrowserSystemId;
};

export function getBrowserCoreTarget(
  platformId: string,
  artifactFilename: string | null | undefined,
): BrowserCoreTarget | null {
  const extension = path.extname(artifactFilename || "").toLowerCase();
  if (platformId === "nes" && extension === ".nes") {
    return { coreId: "fceumm", systemId: "nes" };
  }
  if (platformId === "gb" && extension === ".gb") {
    return { coreId: "gambatte", systemId: "gb" };
  }
  if (platformId === "gbc" && extension === ".gbc") {
    return { coreId: "gambatte", systemId: "gbc" };
  }
  return null;
}

