import { useEffect, useState } from "react";
import { AlertCircle, Filter, RefreshCw, X } from "lucide-react";
import { CatalogCandidateCard } from "../../components/admin/CatalogCandidateCard";
import { Pagination } from "../../components/ui/Pagination";
import { PixelIcon } from "../../components/ui/PixelIcon";
import { AdminSelect } from "../../components/ui/AdminSelect";
import { AdminReviewPageSkeleton } from "../../components/ui/Skeleton";
import {
  getAdminApiErrorMessage,
  getPageAfterRemoval,
  getPageRangeLabel,
} from "../../features/admin/adminState";
import { useReviewCatalogCandidateMutation } from "../../features/admin/adminMutations";
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
const STATUS_FILTER_OPTIONS = STATUS_OPTIONS.map((option) => ({
  label: option,
  value: option,
}));
const SOURCE_FILTER_OPTIONS = SOURCE_OPTIONS.map((option) => ({
  label: option || "all sources",
  value: option,
}));
const PLATFORM_FILTER_OPTIONS = PLATFORM_OPTIONS.map((option) => ({
  label: option || "all platforms",
  value: option,
}));

export default function CatalogCandidates() {
  const [status, setStatus] =
    useState<ApiCatalogCandidateStatus>("needs_review");
  const [sourceKind, setSourceKind] =
    useState<ApiCatalogCandidateSourceKind | "">("");
  const [platformId, setPlatformId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [toastMessage, setToastMessage] = useState("");
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
      setToastMessage(
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

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timeout = window.setTimeout(() => setToastMessage(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

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
    if (action === "reject" && !notes) {
      setToastMessage("Add review notes before rejecting this candidate.");
      return;
    }
    setPendingCandidateId(candidateId);
    setToastMessage("");
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
    return <AdminReviewPageSkeleton filterCount={3} />;
  }

  const loadError = candidatesQuery.isError
    ? getAdminApiErrorMessage(
        candidatesQuery.error,
        "Could not load catalog candidates.",
      )
    : "";

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div
          className="fixed right-6 top-6 z-50 flex max-w-md items-start gap-3 rounded-lg border border-red-300/70 bg-[#2B0F16] px-4 py-3 text-sm font-semibold text-red-50 shadow-2xl"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-200" />
          <p className="min-w-0 flex-1 leading-6">{toastMessage}</p>
          <button
            aria-label="Dismiss notification"
            className="rounded p-1 text-red-100 hover:bg-red-500/20 hover:text-white"
            onClick={() => setToastMessage("")}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <h1 className="flex items-center gap-3 text-3xl font-bold text-white">
          <PixelIcon className="h-8 w-8 text-synth-secondary" name="cube" />
          Catalog Candidates
        </h1>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-synth-secondary/80 bg-synth-secondary/25 px-4 py-2 text-sm font-extrabold text-white">
          <span>{totalCandidates.toLocaleString()}</span>
          <span>Matching</span>
        </span>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-synth-secondary/35 bg-[#2B1720] p-4 shadow-card xl:flex-row xl:items-center">
        <div className="flex items-center gap-2 text-sm font-extrabold text-white">
          <Filter className="h-4 w-4" />
          Filters
        </div>
        <AdminSelect
          ariaLabel="Catalog candidate status"
          className="xl:w-48"
          onChange={(value) => {
            setStatus(value);
            resetToFirstPage();
          }}
          options={STATUS_FILTER_OPTIONS}
          value={status}
        />
        <AdminSelect<ApiCatalogCandidateSourceKind | "">
          ariaLabel="Catalog candidate source"
          className="xl:w-56"
          onChange={(value) => {
            setSourceKind(value);
            resetToFirstPage();
          }}
          options={SOURCE_FILTER_OPTIONS}
          value={sourceKind}
        />
        <AdminSelect
          ariaLabel="Catalog candidate platform"
          className="xl:w-48"
          onChange={(value) => {
            setPlatformId(value);
            resetToFirstPage();
          }}
          options={PLATFORM_FILTER_OPTIONS}
          value={platformId}
        />
        <input
          className="h-10 min-w-0 flex-1 rounded-lg border border-synth-secondary/40 bg-synth-bg px-3 text-sm font-semibold text-white outline-none placeholder:text-gray-400 focus:border-synth-secondary"
          onChange={(event) => {
            setSearch(event.target.value);
            resetToFirstPage();
          }}
          placeholder="Search title"
          type="search"
          value={search}
        />
      </div>

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
        <div className="rounded-lg border border-synth-secondary/35 bg-[#2B1720] p-12 text-center text-gray-200 shadow-card">
          <PixelIcon className="mx-auto mb-4 h-12 w-12 text-synth-secondary" name="cube" />
          <p className="text-xl text-white">No candidates found.</p>
          <p className="mt-2 text-sm font-medium">The current server filters are empty.</p>
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
        <p className="text-sm font-semibold text-gray-200">{pageLabel}</p>
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
