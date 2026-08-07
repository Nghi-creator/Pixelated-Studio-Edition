import { enrichCandidateCompatibility } from "../../domain/candidateCompatibility.js";
import type { CatalogGenre } from "../../domain/catalogGenres.js";
import type { CandidateRow } from "../domain/catalogCandidateTypes.js";

export function createCandidateReviewUseCases(dependencies: {
  authorize(userId: string): Promise<boolean>;
  claim(candidateId: string, reviewerId: string, now: string): Promise<CandidateRow | null>;
  find(candidateId: string): Promise<CandidateRow | null>;
  findPage(query: Record<string, unknown>): Promise<{ candidates: CandidateRow[]; total: number }>;
  now(): string;
  onReleaseError(error: unknown): void;
  promote(candidate: CandidateRow, reviewerId: string, notes: string | null, genre: CatalogGenre): Promise<unknown>;
  reject(candidateId: string, reviewerId: string, notes: string, now: string): Promise<unknown | null>;
  release(candidateId: string, reviewerId: string, now: string): Promise<void>;
}) {
  async function list(input: {
    page: number; pageSize: number; platformId?: string; search?: string;
    sourceKind?: string; status: string; userId: string;
  }) {
    if (!(await dependencies.authorize(input.userId))) return { status: "forbidden" } as const;
    const start = (input.page - 1) * input.pageSize;
    const result = await dependencies.findPage({
      end: start + input.pageSize - 1,
      platformId: input.platformId,
      search: input.search,
      sourceKind: input.sourceKind,
      start,
      status: input.status,
    });
    return {
      status: "ok",
      candidates: result.candidates.map(enrichCandidateCompatibility),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / input.pageSize)),
    } as const;
  }

  async function review(input: {
    action: "promote" | "reject"; candidateId: string; genre?: CatalogGenre;
    notes: string | null; userId: string;
  }) {
    if (!(await dependencies.authorize(input.userId))) return { status: "forbidden" } as const;
    const candidate = await dependencies.find(input.candidateId);
    if (!candidate) return { status: "not_found" } as const;
    if (candidate.import_status !== "needs_review") return { status: "already_reviewed" } as const;
    const now = dependencies.now();
    if (input.action === "reject") {
      const rejected = await dependencies.reject(candidate.id, input.userId, input.notes!, now);
      return rejected ? { status: "rejected", candidate: rejected } as const : { status: "already_reviewed" } as const;
    }
    const claimed = await dependencies.claim(candidate.id, input.userId, now);
    if (!claimed) return { status: "already_reviewed" } as const;
    try {
      return { status: "promoted", result: await dependencies.promote(claimed, input.userId, input.notes, input.genre!) } as const;
    } catch (error) {
      try { await dependencies.release(candidate.id, input.userId, now); }
      catch (releaseError) { dependencies.onReleaseError(releaseError); }
      throw error;
    }
  }
  return { list, review };
}
