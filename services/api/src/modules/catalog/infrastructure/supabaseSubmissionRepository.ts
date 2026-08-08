import type { SupabaseService } from "../../auth/infrastructure/supabaseClients.js";
import type { CandidateRow } from "../ingestion/domain/catalogCandidateTypes.js";
import type { SubmissionRow } from "../domain/submissionTypes.js";
export type { SubmissionRow } from "../domain/submissionTypes.js";

export class SubmissionTransitionError extends Error {}

export async function findSubmitterRole(service: SupabaseService, userId: string) {
  const { data, error } = await service
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<{ role: string | null }>();
  if (error) throw error;
  return data?.role || "user";
}

export async function countRecentSubmissions(
  service: SupabaseService,
  userId: string,
  createdAfter: string,
) {
  const { count, error } = await service
    .from("game_submissions")
    .select("id", { count: "exact" })
    .eq("submitter_id", userId)
    .gte("created_at", createdAfter);
  if (error) throw error;
  return count || 0;
}

export async function insertGameSubmission(
  service: SupabaseService,
  values: Record<string, unknown>,
) {
  const { data, error } = await service
    .from("game_submissions")
    .insert(values)
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw error || new Error("Supabase returned no submission");
  return data.id;
}

export async function findSubmissions(
  service: SupabaseService,
  input: { end: number; search?: string; start: number; status: string },
) {
  let query = service
    .from("game_submissions")
    .select("*", { count: "exact" })
    .eq("status", input.status)
    .order("created_at", { ascending: false })
    .range(input.start, input.end);
  if (input.search) query = query.ilike("game_title", `%${input.search}%`);
  const { count, data, error } = await query;
  if (error) throw error;
  return { submissions: (data || []) as SubmissionRow[], total: count || 0 };
}

export async function findSubmission(service: SupabaseService, submissionId: string) {
  const { data, error } = await service
    .from("game_submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle<SubmissionRow>();
  if (error) throw error;
  return data;
}

function throwTransition(error: { message?: string } | null) {
  if (error?.message === "submission_not_found") {
    throw new SubmissionTransitionError("submission_not_found");
  }
  if (error?.message === "submission_already_reviewed") {
    throw new SubmissionTransitionError("submission_already_reviewed");
  }
  if (error) throw error;
}

export async function rejectSubmission(
  service: SupabaseService,
  input: { notes: string; reviewerId: string; submissionId: string },
) {
  const { data, error } = await service.rpc("reject_game_submission", {
    p_review_notes: input.notes,
    p_reviewer_id: input.reviewerId,
    p_submission_id: input.submissionId,
  });
  throwTransition(error);
  if (!data) throw new Error("Submission rejection returned no submission");
  return data as unknown as SubmissionRow;
}

export async function createSubmissionCandidate(
  service: SupabaseService,
  input: {
    candidate: Record<string, unknown>;
    notes: string | null;
    reviewerId: string;
    submissionId: string;
  },
) {
  const { data, error } = await service.rpc("create_submission_candidate", {
    p_candidate: input.candidate,
    p_review_notes: input.notes,
    p_reviewer_id: input.reviewerId,
    p_submission_id: input.submissionId,
  });
  throwTransition(error);
  return data as unknown as { candidate: CandidateRow; submission: SubmissionRow };
}
