import crypto from "node:crypto";
import path from "node:path";
import { getSubmissionRomPlatform } from "../domain/submissionRom.js";
import type { SubmissionRow } from "../domain/submissionTypes.js";

const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const ARTIFACT_TIMEOUT_MS = 15_000;

async function readArtifactResponse(response: Response, maxBytes: number) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) throw new Error(`Submitted ROM is too large. Max size is ${maxBytes} bytes.`);
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error(`Submitted ROM is too large. Max size is ${maxBytes} bytes.`);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error(`Submitted ROM is too large. Max size is ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function fetchSubmissionArtifactBytes(
  fetchArtifact: typeof fetch,
  url: string,
  maxBytes = MAX_ARTIFACT_BYTES,
  timeoutMs = ARTIFACT_TIMEOUT_MS,
) {
  const response = await fetchArtifact(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Failed to fetch submitted ROM: status ${response.status}`);
  return readArtifactResponse(response, maxBytes);
}

type ReviewBody =
  | { action: "reject"; notes: string }
  | {
      action: "create_candidate";
      asset_license_spdx?: string | null;
      attribution_text: string;
      code_license_spdx: string;
      license_url: string;
      noncommercial_hosting_allowed: true;
      notes?: string;
      original_release_url?: string | null;
      permission_evidence_url?: string | null;
      rights_warnings: string[];
      source_repo_url: string;
    };

export function createAdminSubmissionUseCases(dependencies: {
  authorize(userId: string): Promise<boolean>;
  createCandidate(input: { candidate: Record<string, unknown>; notes: string | null; reviewerId: string; submissionId: string }): Promise<{ candidate: unknown; submission: unknown }>;
  fetchArtifact: typeof fetch;
  findOne(submissionId: string): Promise<SubmissionRow | null>;
  findPage(query: { end: number; search?: string; start: number; status: string }): Promise<{ submissions: SubmissionRow[]; total: number }>;
  reject(input: { notes: string; reviewerId: string; submissionId: string }): Promise<unknown>;
  signUrl(url: string | null): Promise<string | null>;
}) {
  async function list(input: { page: number; pageSize: number; search?: string; status: string; userId: string }) {
    if (!(await dependencies.authorize(input.userId))) return { status: "forbidden" } as const;
    const start = (input.page - 1) * input.pageSize;
    const result = await dependencies.findPage({ end: start + input.pageSize - 1, search: input.search, start, status: input.status });
    const submissions = await Promise.all(result.submissions.map(async (submission) => {
      const [romUrl, coverUrl, bannerUrl] = await Promise.all([
        dependencies.signUrl(submission.rom_url),
        dependencies.signUrl(submission.cover_url),
        dependencies.signUrl(submission.banner_url),
      ]);
      return { ...submission, banner_url: bannerUrl, cover_url: coverUrl, rom_url: romUrl || submission.rom_url };
    }));
    return { status: "ok", page: input.page, pageSize: input.pageSize, submissions, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / input.pageSize)) } as const;
  }

  async function review(input: { body: ReviewBody; submissionId: string; userId: string }) {
    if (!(await dependencies.authorize(input.userId))) return { status: "forbidden" } as const;
    if (input.body.action === "reject") {
      return { status: "rejected", submission: await dependencies.reject({ notes: input.body.notes, reviewerId: input.userId, submissionId: input.submissionId }) } as const;
    }
    const submission = await dependencies.findOne(input.submissionId);
    if (!submission) return { status: "not_found" } as const;
    if (submission.status !== "pending") return { status: "already_reviewed" } as const;
    const platform = getSubmissionRomPlatform(new URL(submission.rom_url).pathname);
    if (!platform) return { status: "unsupported" } as const;
    const signedRomUrl = await dependencies.signUrl(submission.rom_url);
    if (!signedRomUrl) return { status: "unavailable" } as const;
    const artifactBytes = await fetchSubmissionArtifactBytes(dependencies.fetchArtifact, signedRomUrl);
    const filename = path.basename(new URL(submission.rom_url).pathname) || "submission.rom";
    const sourceCommit = crypto.createHash("sha1").update(["user_submission", submission.id, submission.rom_url].join("\0")).digest("hex");
    const candidate = {
      artifact_filename: filename,
      artifact_sha256: crypto.createHash("sha256").update(artifactBytes).digest("hex"),
      artifact_size: artifactBytes.length,
      artifact_url: submission.rom_url,
      asset_license_spdx: input.body.asset_license_spdx || null,
      attribution_text: input.body.attribution_text,
      code_license_spdx: input.body.code_license_spdx,
      cover_license_spdx: null,
      developer_name: submission.author_name,
      developer_url: input.body.original_release_url || input.body.source_repo_url,
      import_status: "needs_review",
      last_seen_at: new Date().toISOString(),
      license_url: input.body.license_url,
      noncommercial_hosting_allowed: input.body.noncommercial_hosting_allowed,
      original_release_url: input.body.original_release_url || input.body.source_repo_url,
      permission_evidence_url: input.body.permission_evidence_url || null,
      platform_id: platform.platformId,
      rights_warnings: input.body.rights_warnings,
      runtime_id: platform.runtimeId,
      runtime_kind: "libretro",
      source_commit: sourceCommit,
      source_entry_path: `game_submissions/${submission.id}#${filename}`,
      source_kind: "user_submission",
      source_metadata: { bannerUrl: submission.banner_url, coverUrl: submission.cover_url, description: submission.description, email: submission.email, submitterId: submission.submitter_id },
      source_repo_url: input.body.source_repo_url,
      title: submission.game_title,
    };
    const result = await dependencies.createCandidate({ candidate, notes: input.body.notes || null, reviewerId: input.userId, submissionId: submission.id });
    return { status: "candidate_created", ...result } as const;
  }
  return { list, review };
}
