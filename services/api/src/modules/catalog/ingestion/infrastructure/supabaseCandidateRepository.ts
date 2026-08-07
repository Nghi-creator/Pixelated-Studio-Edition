import type { SupabaseService } from "../../../auth/infrastructure/supabaseClients.js";
import type { CandidateRow } from "../domain/catalogCandidateTypes.js";
import { CANDIDATE_COLUMNS } from "../domain/catalogCandidateTypes.js";

type SupabaseServiceLike = SupabaseService;

export async function findCandidates(
  service: SupabaseServiceLike,
  input: {
    end: number;
    platformId?: string;
    search?: string;
    sourceKind?: string;
    start: number;
    status: string;
  },
) {
  let query = service
    .from("catalog_ingestion_candidates")
    .select(CANDIDATE_COLUMNS, { count: "exact" })
    .eq("import_status", input.status)
    .order("last_seen_at", { ascending: false })
    .range(input.start, input.end);
  if (input.platformId) query = query.eq("platform_id", input.platformId);
  if (input.sourceKind) query = query.eq("source_kind", input.sourceKind);
  if (input.search) query = query.ilike("title", `%${input.search}%`);
  const { count, data, error } = await query;
  if (error) throw error;
  return { candidates: (data || []) as unknown as CandidateRow[], total: count || 0 };
}

export async function findCandidate(service: SupabaseServiceLike, candidateId: string) {
  const { data, error } = await service
    .from("catalog_ingestion_candidates")
    .select(CANDIDATE_COLUMNS)
    .eq("id", candidateId)
    .maybeSingle<CandidateRow>();
  if (error) throw error;
  return data;
}

async function updateReviewStatus(
  service: SupabaseServiceLike,
  input: {
    candidateId: string;
    expectedStatus: string;
    values: Record<string, unknown>;
  },
) {
  const { data, error } = await service
    .from("catalog_ingestion_candidates")
    .update(input.values)
    .eq("id", input.candidateId)
    .eq("import_status", input.expectedStatus)
    .select(CANDIDATE_COLUMNS)
    .maybeSingle<CandidateRow>();
  if (error) throw error;
  return data;
}

export function rejectCandidate(
  service: SupabaseServiceLike,
  candidateId: string,
  reviewerId: string,
  notes: string,
  now: string,
) {
  return updateReviewStatus(service, {
    candidateId,
    expectedStatus: "needs_review",
    values: {
      import_status: "rejected",
      review_notes: notes,
      reviewed_at: now,
      reviewed_by: reviewerId,
      updated_at: now,
    },
  });
}

export function claimCandidateReview(
  service: SupabaseServiceLike,
  candidateId: string,
  reviewerId: string,
  now: string,
) {
  return updateReviewStatus(service, {
    candidateId,
    expectedStatus: "needs_review",
    values: {
      import_status: "approved",
      reviewed_at: now,
      reviewed_by: reviewerId,
      updated_at: now,
    },
  });
}

export async function releaseCandidateReview(
  service: SupabaseServiceLike,
  candidateId: string,
  reviewerId: string,
  claimedAt: string,
) {
  const { error } = await service
    .from("catalog_ingestion_candidates")
    .update({
      import_status: "needs_review",
      reviewed_at: null,
      reviewed_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId)
    .eq("import_status", "approved")
    .eq("reviewed_by", reviewerId)
    .eq("updated_at", claimedAt);
  if (error) throw error;
}

export async function claimBrowserSmokeArtifact(
  service: SupabaseServiceLike,
  input: { candidateId: string; expiresAt: string; nonce: string },
) {
  const { data, error } = await service.rpc("claim_browser_smoke_artifact", {
    p_candidate_id: input.candidateId,
    p_expires_at: input.expiresAt,
    p_nonce: input.nonce,
  });
  if (error) throw error;
  return data === true;
}

export async function recordBrowserSmokeResult(
  service: SupabaseServiceLike,
  input: {
    artifactSha256: string;
    candidateId: string;
    coreId: string;
    error: string | null;
    issuedAt: string;
    reviewerId: string;
    status: string;
  },
) {
  const { data, error } = await service.rpc("record_browser_smoke_result", {
    p_artifact_sha256: input.artifactSha256,
    p_candidate_id: input.candidateId,
    p_core_id: input.coreId,
    p_error: input.error,
    p_issued_at: input.issuedAt,
    p_reviewer_id: input.reviewerId,
    p_status: input.status,
  });
  if (error) throw error;
  return data === true;
}
