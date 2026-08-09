import {
  isResearchRunConfig,
  type ResearchRunConfig,
} from "./researchRunConfig.ts";

export const ACTIVE_RESEARCH_RUN_STORAGE_KEY = "pixelated_active_research_run";

type ResearchRunStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function readActiveResearchRun(
  storage: ResearchRunStorage | null,
  gameId?: string,
): ResearchRunConfig | null {
  if (!storage) return null;
  try {
    const rawValue = storage.getItem(ACTIVE_RESEARCH_RUN_STORAGE_KEY);
    if (!rawValue) return null;
    const parsed: unknown = JSON.parse(rawValue);
    if (!isResearchRunConfig(parsed)) return null;
    if (gameId && parsed.gameId !== gameId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeActiveResearchRun(
  storage: ResearchRunStorage | null,
  config: ResearchRunConfig,
) {
  if (!storage) return false;
  try {
    storage.setItem(ACTIVE_RESEARCH_RUN_STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function clearActiveResearchRun(storage: ResearchRunStorage | null) {
  if (!storage) return;
  try {
    storage.removeItem(ACTIVE_RESEARCH_RUN_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}
