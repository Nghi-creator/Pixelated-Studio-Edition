import { useState } from "react";
import { Filter, PackageCheck, RefreshCw } from "lucide-react";
import { CatalogCandidateCard } from "../../components/admin/CatalogCandidateCard";
import { Pagination } from "../../components/ui/Pagination";
import { AdminTablePageSkeleton } from "../../components/ui/Skeleton";
import {
  getAdminApiErrorMessage,
  getPageAfterRemoval,
  getPageRangeLabel,
} from "../../features/admin/adminState";
import { useReviewCatalogCandidateMutation } from "../../lib/api/apiMutations";
import { useCatalogCandidatesQuery } from "../../lib/api/apiQueries";
import type {
  ApiCatalogCandidate,
  ApiCatalogCandidateReviewAction,
  ApiCatalogCandidateSourceKind,
  ApiCatalogCandidateStatus,
} from "../../lib/api/apiTypes";

const CANDIDATES_PER_PAGE = 15;
const PLATFORM_OPTIONS = [
  "",
  "nes",
  "gb",
  "gbc",
  "gba",
  "snes",
  "genesis",
  "sms",
  "game_gear",
  "linux",
];
const SOURCE_OPTIONS: (ApiCatalogCandidateSourceKind | "")[] = [
  "",
  "curated_licensed_rom",
  "debian_main_games",
  "homebrew_hub_gb",
  "homebrew_hub_gba",
  "homebrew_hub_nes",
  "user_submission",
];
const STATUS_OPTIONS: ApiCatalogCandidateStatus[] = [
  "needs_review",
  "approved",
  "rejected",
  "promoted",
];

export default function CatalogCandidates() {
  const [status, setStatus] =
    useState<ApiCatalogCandidateStatus>("needs_review");
  const [sourceKind, setSourceKind] =
    useState<ApiCatalogCandidateSourceKind | "">("");
  const [platformId, setPlatformId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState("");
  const [pendingCandidateId, setPendingCandidateId] = useState<string | null>(null);
  const [notesByCandidate, setNotesByCandidate] = useState<Record<string, string>>(
    {},
  );

  const candidatesQuery = useCatalogCandidatesQuery<ApiCatalogCandidate>({
    page,
    pageSize: CANDIDATES_PER_PAGE,
    platformId,
    search,
    sourceKind,
    status,
  });
  const candidates = candidatesQuery.data?.candidates || [];
  const totalCandidates = candidatesQuery.data?.total || 0;
  const totalPages = candidatesQuery.data?.totalPages || 1;
  const safePage = Math.min(page, totalPages);

  const reviewMutation = useReviewCatalogCandidateMutation<ApiCatalogCandidate>({
    page,
    pageSize: CANDIDATES_PER_PAGE,
    platformId,
    search,
    sourceKind,
    status,
    totalCandidates,
    onError: (error) => {
      setActionError(
        getAdminApiErrorMessage(error, "Failed to review candidate."),
      );
    },
    onReviewed: ({ nextTotal }) => {
      setPage(
        getPageAfterRemoval({
          currentPage: page,
          pageSize: CANDIDATES_PER_PAGE,
          totalAfterRemoval: nextTotal,
        }),
      );
    },
  });

  const resetToFirstPage = () => setPage(1);
  const setCandidateNotes = (candidateId: string, notes: string) => {
    setNotesByCandidate((current) => ({ ...current, [candidateId]: notes }));
  };

  const reviewCandidate = async (
    candidateId: string,
    action: ApiCatalogCandidateReviewAction,
  ) => {
    if (pendingCandidateId) return;
    const notes = notesByCandidate[candidateId]?.trim() || "";
    setPendingCandidateId(candidateId);
    setActionError("");
    await reviewMutation
      .mutateAsync({ action, candidateId, notes })
      .catch(() => undefined)
      .finally(() => setPendingCandidateId(null));
  };

  const pageLabel = getPageRangeLabel({
    currentCount: candidates.length,
    page: safePage,
    pageSize: CANDIDATES_PER_PAGE,
    total: totalCandidates,
  });

  if (candidatesQuery.isLoading) {
    return <AdminTablePageSkeleton />;
  }

  const loadError = candidatesQuery.isError
    ? getAdminApiErrorMessage(
        candidatesQuery.error,
        "Could not load catalog candidates.",
      )
    : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <h1 className="flex items-center gap-3 text-3xl font-bold text-white">
          <PackageCheck className="h-8 w-8 text-synth-secondary" />
          Catalog Candidates
        </h1>
        <span className="w-fit rounded-full border border-synth-secondary/30 bg-synth-secondary/15 px-4 py-2 text-sm font-semibold text-synth-secondary">
          {totalCandidates} Matching
        </span>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-synth-border bg-[#2B1720] p-4 shadow-card xl:flex-row xl:items-center">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-400">
          <Filter className="h-4 w-4" />
          Filters
        </div>
        <select
          className="h-10 rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none focus:border-synth-secondary"
          onChange={(event) => {
            setStatus(event.target.value as ApiCatalogCandidateStatus);
            resetToFirstPage();
          }}
          value={status}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none focus:border-synth-secondary"
          onChange={(event) => {
            setSourceKind(event.target.value as ApiCatalogCandidateSourceKind | "");
            resetToFirstPage();
          }}
          value={sourceKind}
        >
          {SOURCE_OPTIONS.map((option) => (
            <option key={option || "all"} value={option}>
              {option || "all sources"}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none focus:border-synth-secondary"
          onChange={(event) => {
            setPlatformId(event.target.value);
            resetToFirstPage();
          }}
          value={platformId}
        >
          {PLATFORM_OPTIONS.map((option) => (
            <option key={option || "all"} value={option}>
              {option || "all platforms"}
            </option>
          ))}
        </select>
        <input
          className="h-10 min-w-0 flex-1 rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-synth-secondary"
          onChange={(event) => {
            setSearch(event.target.value);
            resetToFirstPage();
          }}
          placeholder="Search title"
          type="search"
          value={search}
        />
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {actionError}
        </div>
      )}

      {loadError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-8 text-center text-red-200">
          <p>{loadError}</p>
          <button
            className="mx-auto mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-red-400/40 px-4 text-sm font-bold hover:bg-red-500/10"
            onClick={() => void candidatesQuery.refetch()}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-lg border border-synth-border bg-[#2B1720] p-12 text-center text-gray-400 shadow-card">
          <PackageCheck className="mx-auto mb-4 h-12 w-12 text-synth-secondary opacity-70" />
          <p className="text-xl text-white">No candidates found.</p>
          <p className="mt-2 text-sm">The current server filters are empty.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {candidates.map((candidate) => (
            <CatalogCandidateCard
              candidate={candidate}
              key={candidate.id}
              notes={notesByCandidate[candidate.id] || ""}
              onNotesChange={(notes) => setCandidateNotes(candidate.id, notes)}
              onReview={(candidateId, action) =>
                void reviewCandidate(candidateId, action)
              }
              pending={pendingCandidateId === candidate.id}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">{pageLabel}</p>
        <Pagination
          currentPage={safePage}
          disabled={candidatesQuery.isFetching}
          onPageChange={setPage}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
}
