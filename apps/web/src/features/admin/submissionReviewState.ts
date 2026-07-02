import type { ApiGameSubmission } from "../../lib/api/apiTypes";

export function getSubmissionArtifactName(url: string) {
  try {
    const parsed = new URL(url);
    const filename = parsed.pathname.split("/").filter(Boolean).pop();
    return filename ? decodeURIComponent(filename) : url;
  } catch {
    return url;
  }
}

export function getDefaultSubmissionAttribution(
  submission: Pick<ApiGameSubmission, "author_name" | "game_title">,
) {
  return `${submission.game_title} by ${submission.author_name}. Submitted to Pixelated for non-commercial cloud library review.`;
}

export function parseRightsWarnings(value: string) {
  return value
    .split("\n")
    .map((warning) => warning.trim())
    .filter(Boolean);
}
