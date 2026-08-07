import { enrichCandidateCompatibility, getCandidateBrowserCompatibility } from "../../domain/candidateCompatibility.js";
import type { BrowserCoreId } from "../../../auth/domain/browserCoreContract.js";
import type { CandidateRow } from "../domain/catalogCandidateTypes.js";
import {
  createBrowserSmokeTicket,
  readBrowserSmokeTicketAuthorization,
  verifyBrowserSmokeTicket,
} from "../../domain/browserSmokeTicket.js";

export class BrowserSmokeClaimError extends Error {}

function wasUsed(candidate: CandidateRow, issuedAt: number) {
  return Boolean(candidate.browser_smoke_tested_at && new Date(candidate.browser_smoke_tested_at).getTime() >= issuedAt);
}

function evidenceMatches(candidate: CandidateRow, ticket: ReturnType<typeof verifyBrowserSmokeTicket>, coreId = ticket.coreId) {
  const compatibility = getCandidateBrowserCompatibility(candidate);
  return compatibility.eligible && compatibility.coreId === coreId && compatibility.coreId === ticket.coreId && candidate.artifact_sha256?.toLowerCase() === ticket.artifactSha256;
}

export function createBrowserSmokeUseCases(dependencies: {
  authorize(userId: string): Promise<boolean>;
  claim(input: { candidateId: string; expiresAt: string; nonce: string }): Promise<boolean>;
  fetchArtifact(candidate: CandidateRow): Promise<Buffer>;
  find(candidateId: string): Promise<CandidateRow | null>;
  record(input: Record<string, unknown>): Promise<boolean>;
  ticketSecret: string;
  ticketTtlSeconds: number;
}) {
  const readTicket = (authorization: string | undefined) => verifyBrowserSmokeTicket(readBrowserSmokeTicketAuthorization(authorization), dependencies.ticketSecret);

  async function issue(input: { candidateId: string; userId: string }) {
    if (!(await dependencies.authorize(input.userId))) return { status: "forbidden" } as const;
    const candidate = await dependencies.find(input.candidateId);
    if (!candidate) return { status: "not_found" } as const;
    const compatibility = getCandidateBrowserCompatibility(candidate);
    if (!compatibility.eligible) return { status: "ineligible", error: compatibility.reason || "Candidate is not browser-compatible." } as const;
    const artifactSha256 = candidate.artifact_sha256?.toLowerCase();
    if (!artifactSha256 || !compatibility.coreId) return { status: "incomplete" } as const;
    return { status: "ok", ticket: createBrowserSmokeTicket({ artifactSha256, candidateId: candidate.id, coreId: compatibility.coreId, reviewerId: input.userId }, dependencies.ticketSecret, dependencies.ticketTtlSeconds) } as const;
  }

  async function session(authorization: string | undefined) {
    const ticket = readTicket(authorization);
    const candidate = await dependencies.find(ticket.candidateId);
    if (!candidate) return { status: "not_found" } as const;
    if (wasUsed(candidate, ticket.issuedAt)) return { status: "used" } as const;
    if (!evidenceMatches(candidate, ticket)) return { status: "changed" } as const;
    const compatibility = getCandidateBrowserCompatibility(candidate);
    return { status: "ok", session: { artifactFilename: candidate.artifact_filename, artifactSha256: candidate.artifact_sha256, artifactSize: candidate.artifact_size, candidateId: candidate.id, coreId: ticket.coreId, expiresAt: new Date(ticket.expiresAt).toISOString(), systemId: compatibility.systemId, title: candidate.title } } as const;
  }

  async function artifact(authorization: string | undefined) {
    const ticket = readTicket(authorization);
    let claimed: boolean;
    try {
      claimed = await dependencies.claim({ candidateId: ticket.candidateId, expiresAt: new Date(ticket.expiresAt).toISOString(), nonce: ticket.nonce });
    } catch (error) {
      throw new BrowserSmokeClaimError("Failed to claim browser smoke artifact", { cause: error });
    }
    if (!claimed) return { status: "artifact_used" } as const;
    const candidate = await dependencies.find(ticket.candidateId);
    if (!candidate) return { status: "not_found" } as const;
    if (wasUsed(candidate, ticket.issuedAt)) return { status: "used" } as const;
    if (!evidenceMatches(candidate, ticket)) return { status: "changed" } as const;
    return { status: "ok", bytes: await dependencies.fetchArtifact(candidate) } as const;
  }

  async function record(authorization: string | undefined, body: { coreId: BrowserCoreId; error?: string; status: "passed" | "failed" }) {
    const ticket = readTicket(authorization);
    const candidate = await dependencies.find(ticket.candidateId);
    if (!candidate) return { status: "not_found" } as const;
    if (wasUsed(candidate, ticket.issuedAt)) return { status: "used" } as const;
    if (!evidenceMatches(candidate, ticket, body.coreId)) return { status: "changed" } as const;
    if (body.status === "passed") await dependencies.fetchArtifact(candidate);
    const recorded = await dependencies.record({ artifactSha256: ticket.artifactSha256, candidateId: candidate.id, coreId: body.coreId, error: body.status === "failed" ? body.error : null, issuedAt: new Date(ticket.issuedAt).toISOString(), reviewerId: ticket.reviewerId, status: body.status });
    if (!recorded) return { status: "used" } as const;
    const updated = await dependencies.find(candidate.id);
    if (!updated) throw new Error("Candidate disappeared after smoke result");
    return { status: "ok", candidate: enrichCandidateCompatibility(updated) } as const;
  }
  return { artifact, issue, record, session };
}
