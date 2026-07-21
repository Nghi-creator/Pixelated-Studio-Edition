import { env } from "../../../config/env.js";
import type { SupabaseServiceLike } from "../ingestion/catalogCandidateTypes.js";

export const SUBMISSION_REVIEW_URL_TTL_SECONDS = 60 * 60;

export function getSubmissionObjectPath(
  value: string,
  supabaseUrl = env.SUPABASE_URL,
) {
  const rawPath = value.split(/[?#]/, 1)[0] || "";
  if (/(?:^|\/)(?:\.{1,2}|%2e(?:%2e)?)(?:\/|$)/i.test(rawPath)) {
    return null;
  }

  let objectUrl: URL;
  try {
    objectUrl = new URL(value);
  } catch {
    return null;
  }

  if (supabaseUrl) {
    const projectUrl = new URL(supabaseUrl);
    if (objectUrl.origin !== projectUrl.origin) return null;
  }

  const match = objectUrl.pathname.match(
    /^\/storage\/v1\/object\/(?:public|sign)\/submissions\/(.+)$/,
  );
  if (!match?.[1]) return null;

  try {
    const objectPath = match[1]
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
    return objectPath && !objectPath.split("/").includes("..")
      ? objectPath
      : null;
  } catch {
    return null;
  }
}

export async function createSignedSubmissionUrl(
  service: SupabaseServiceLike,
  value: string | null | undefined,
  expiresIn = SUBMISSION_REVIEW_URL_TTL_SECONDS,
) {
  if (!value) return null;

  const objectPath = getSubmissionObjectPath(value);
  if (!objectPath) {
    throw new Error("Submission URL is not a trusted storage object.");
  }

  const { data, error } = await service.storage
    .from("submissions")
    .createSignedUrl(objectPath, expiresIn);
  if (error || !data?.signedUrl) {
    throw error || new Error("Supabase did not return a signed submission URL.");
  }
  return data.signedUrl;
}
