import type { ApiCatalogCandidateBrowserSmokeStatus } from "../../lib/api/apiTypes";

export type BrowserSmokePollResult = {
  status: ApiCatalogCandidateBrowserSmokeStatus;
  testedAt: string | null;
};

export function hasNewTerminalBrowserSmokeResult(
  baselineTestedAt: string | null,
  result: BrowserSmokePollResult | null,
) {
  return Boolean(
    result?.testedAt &&
      result.testedAt !== baselineTestedAt &&
      (result.status === "passed" || result.status === "failed"),
  );
}

export function getNextBrowserSmokePollDelay(currentDelayMs: number) {
  return Math.min(Math.round(currentDelayMs * 1.5), 10_000);
}
