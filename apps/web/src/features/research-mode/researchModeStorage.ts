export const RESEARCH_MODE_STORAGE_KEY = "pixelated_research_mode";

type ResearchModeStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function isResearchRoute(pathname: string) {
  return pathname === "/research" || pathname.startsWith("/research/");
}

export function readResearchMode(
  storage: ResearchModeStorage | null,
  pathname = "",
) {
  if (isResearchRoute(pathname)) return true;
  if (!storage) return false;

  try {
    return storage.getItem(RESEARCH_MODE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeResearchMode(
  storage: ResearchModeStorage | null,
  enabled: boolean,
) {
  if (!storage) return;

  try {
    if (enabled) {
      storage.setItem(RESEARCH_MODE_STORAGE_KEY, "1");
    } else {
      storage.removeItem(RESEARCH_MODE_STORAGE_KEY);
    }
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}

