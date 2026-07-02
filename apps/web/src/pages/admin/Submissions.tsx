import { useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  FileArchive,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Pagination } from "../../components/ui/Pagination";
import { AdminTablePageSkeleton } from "../../components/ui/Skeleton";
import {
  getAdminApiErrorMessage,
  getPageAfterRemoval,
  getPageRangeLabel,
} from "../../features/admin/adminState";
import {
  getDefaultSubmissionAttribution,
  getSubmissionArtifactName,
  parseRightsWarnings,
} from "../../features/admin/submissionReviewState";
import { useReviewGameSubmissionMutation } from "../../lib/api/apiMutations";
import { useGameSubmissionsQuery } from "../../lib/api/apiQueries";
import type {
  ApiGameSubmission,
  ApiGameSubmissionStatus,
  ApiSubmissionCandidatePayload,
} from "../../lib/api/apiTypes";

const SUBMISSIONS_PER_PAGE = 15;
const STATUS_OPTIONS: ApiGameSubmissionStatus[] = [
  "pending",
  "candidate_created",
  "rejected",
];

type SubmissionFormState = {
  assetLicense: string;
  attribution: string;
  codeLicense: string;
  licenseUrl: string;
  notes: string;
  originalReleaseUrl: string;
  permissionEvidenceUrl: string;
  rightsWarnings: string;
  sourceRepoUrl: string;
};

function initialFormState(submission: ApiGameSubmission): SubmissionFormState {
  return {
    assetLicense: "",
    attribution: getDefaultSubmissionAttribution(submission),
    codeLicense: "",
    licenseUrl: "",
    notes: "",
    originalReleaseUrl: "",
    permissionEvidenceUrl: "",
    rightsWarnings: "Confirm submitted ROM, code, art, and audio can be hosted.",
    sourceRepoUrl: "",
  };
}

function canCreateCandidate(form: SubmissionFormState) {
  return Boolean(
    form.attribution.trim() &&
      form.codeLicense.trim() &&
      form.licenseUrl.trim() &&
      form.sourceRepoUrl.trim(),
  );
}

export default function Submissions() {
  const [status, setStatus] = useState<ApiGameSubmissionStatus>("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState("");
  const [pendingSubmissionId, setPendingSubmissionId] = useState<string | null>(null);
  const [formsBySubmission, setFormsBySubmission] = useState<
    Record<string, SubmissionFormState>
  >({});

  const submissionsQuery = useGameSubmissionsQuery<ApiGameSubmission>({
    page,
    pageSize: SUBMISSIONS_PER_PAGE,
    search,
    status,
  });
  const submissions = submissionsQuery.data?.submissions || [];
  const totalSubmissions = submissionsQuery.data?.total || 0;
  const totalPages = submissionsQuery.data?.totalPages || 1;
  const safePage = Math.min(page, totalPages);

  const reviewMutation = useReviewGameSubmissionMutation<ApiGameSubmission>({
    page,
    pageSize: SUBMISSIONS_PER_PAGE,
    search,
    status,
    totalSubmissions,
    onError: (error) => {
      setActionError(
        getAdminApiErrorMessage(error, "Failed to review submission."),
      );
    },
    onReviewed: ({ nextTotal }) => {
      setPage(
        getPageAfterRemoval({
          currentPage: page,
          pageSize: SUBMISSIONS_PER_PAGE,
          totalAfterRemoval: nextTotal,
        }),
      );
    },
  });

  const formFor = (submission: ApiGameSubmission) =>
    formsBySubmission[submission.id] || initialFormState(submission);
  const updateForm = (
    submission: ApiGameSubmission,
    patch: Partial<SubmissionFormState>,
  ) => {
    setFormsBySubmission((current) => ({
      ...current,
      [submission.id]: { ...formFor(submission), ...patch },
    }));
  };

  const rejectSubmission = async (submission: ApiGameSubmission) => {
    if (pendingSubmissionId) return;
    const form = formFor(submission);
    setPendingSubmissionId(submission.id);
    setActionError("");
    await reviewMutation
      .mutateAsync({ notes: form.notes, submissionId: submission.id })
      .catch(() => undefined)
      .finally(() => setPendingSubmissionId(null));
  };

  const createCandidate = async (submission: ApiGameSubmission) => {
    if (pendingSubmissionId) return;
    const form = formFor(submission);
    const payload: ApiSubmissionCandidatePayload = {
      asset_license_spdx: form.assetLicense.trim() || null,
      attribution_text: form.attribution.trim(),
      code_license_spdx: form.codeLicense.trim(),
      license_url: form.licenseUrl.trim(),
      noncommercial_hosting_allowed: true,
      notes: form.notes.trim(),
      original_release_url: form.originalReleaseUrl.trim() || null,
      permission_evidence_url: form.permissionEvidenceUrl.trim() || null,
      rights_warnings: parseRightsWarnings(form.rightsWarnings),
      source_repo_url: form.sourceRepoUrl.trim(),
    };

    setPendingSubmissionId(submission.id);
    setActionError("");
    await reviewMutation
      .mutateAsync({ payload, submissionId: submission.id })
      .catch(() => undefined)
      .finally(() => setPendingSubmissionId(null));
  };

  const pageLabel = getPageRangeLabel({
    currentCount: submissions.length,
    page: safePage,
    pageSize: SUBMISSIONS_PER_PAGE,
    total: totalSubmissions,
  });

  if (submissionsQuery.isLoading) return <AdminTablePageSkeleton />;

  const loadError = submissionsQuery.isError
    ? getAdminApiErrorMessage(
        submissionsQuery.error,
        "Could not load submissions.",
      )
    : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <h1 className="flex items-center gap-3 text-3xl font-bold text-white">
          <FileArchive className="h-8 w-8 text-synth-secondary" />
          Game Submissions
        </h1>
        <span className="w-fit rounded-full border border-synth-secondary/30 bg-synth-secondary/15 px-4 py-2 text-sm font-semibold text-synth-secondary">
          {totalSubmissions} Matching
        </span>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-synth-border bg-[#2B1720] p-4 shadow-card sm:flex-row sm:items-center">
        <select
          className="h-10 rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none focus:border-synth-secondary"
          onChange={(event) => {
            setStatus(event.target.value as ApiGameSubmissionStatus);
            setPage(1);
          }}
          value={status}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          className="h-10 min-w-0 flex-1 rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-synth-secondary"
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
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
            onClick={() => void submissionsQuery.refetch()}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      ) : submissions.length === 0 ? (
        <div className="rounded-lg border border-synth-border bg-[#2B1720] p-12 text-center text-gray-400 shadow-card">
          <FileArchive className="mx-auto mb-4 h-12 w-12 text-synth-secondary opacity-70" />
          <p className="text-xl text-white">No submissions found.</p>
          <p className="mt-2 text-sm">The current server filters are empty.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map((submission) => {
            const form = formFor(submission);
            const pending = pendingSubmissionId === submission.id;
            const candidateReady = canCreateCandidate(form);
            return (
              <article
                className="rounded-lg border border-synth-border bg-[#2B1720] p-5 shadow-card"
                key={submission.id}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-white">
                        {submission.game_title}
                      </h2>
                      <span className="rounded-full border border-synth-border px-3 py-1 text-xs font-bold text-gray-300">
                        {submission.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-400">
                      {submission.author_name} · {submission.email}
                    </p>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-300">
                      {submission.description || "No description provided."}
                    </p>
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(submission.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-3">
                  <a
                    className="rounded-lg border border-synth-border bg-synth-bg/60 p-3 text-sm text-synth-secondary hover:text-white"
                    href={submission.rom_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="block text-[11px] font-bold uppercase text-gray-500">
                      ROM
                    </span>
                    <span className="mt-1 inline-flex items-center gap-1 break-all font-semibold">
                      {getSubmissionArtifactName(submission.rom_url)}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </span>
                  </a>
                  {submission.cover_url && (
                    <a
                      className="rounded-lg border border-synth-border bg-synth-bg/60 p-3 text-sm text-synth-secondary hover:text-white"
                      href={submission.cover_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="block text-[11px] font-bold uppercase text-gray-500">
                        Cover
                      </span>
                      Open artwork <ExternalLink className="inline h-3.5 w-3.5" />
                    </a>
                  )}
                  {submission.banner_url && (
                    <a
                      className="rounded-lg border border-synth-border bg-synth-bg/60 p-3 text-sm text-synth-secondary hover:text-white"
                      href={submission.banner_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="block text-[11px] font-bold uppercase text-gray-500">
                        Banner
                      </span>
                      Open artwork <ExternalLink className="inline h-3.5 w-3.5" />
                    </a>
                  )}
                </div>

                {submission.status === "pending" && (
                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          className="h-10 rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-synth-secondary"
                          onChange={(event) =>
                            updateForm(submission, {
                              codeLicense: event.target.value,
                            })
                          }
                          placeholder="Code license SPDX"
                          value={form.codeLicense}
                        />
                        <input
                          className="h-10 rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-synth-secondary"
                          onChange={(event) =>
                            updateForm(submission, {
                              assetLicense: event.target.value,
                            })
                          }
                          placeholder="Asset license SPDX"
                          value={form.assetLicense}
                        />
                      </div>
                      <input
                        className="h-10 w-full rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-synth-secondary"
                        onChange={(event) =>
                          updateForm(submission, { licenseUrl: event.target.value })
                        }
                        placeholder="License URL"
                        value={form.licenseUrl}
                      />
                      <input
                        className="h-10 w-full rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-synth-secondary"
                        onChange={(event) =>
                          updateForm(submission, {
                            sourceRepoUrl: event.target.value,
                          })
                        }
                        placeholder="Source or evidence URL"
                        value={form.sourceRepoUrl}
                      />
                      <input
                        className="h-10 w-full rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-synth-secondary"
                        onChange={(event) =>
                          updateForm(submission, {
                            permissionEvidenceUrl: event.target.value,
                          })
                        }
                        placeholder="Permission evidence URL"
                        value={form.permissionEvidenceUrl}
                      />
                      <input
                        className="h-10 w-full rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-synth-secondary"
                        onChange={(event) =>
                          updateForm(submission, {
                            originalReleaseUrl: event.target.value,
                          })
                        }
                        placeholder="Original release URL"
                        value={form.originalReleaseUrl}
                      />
                    </div>

                    <div className="space-y-3">
                      <textarea
                        className="min-h-24 w-full resize-y rounded-lg border border-synth-border bg-synth-bg px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-synth-secondary"
                        onChange={(event) =>
                          updateForm(submission, {
                            attribution: event.target.value,
                          })
                        }
                        placeholder="Attribution text"
                        value={form.attribution}
                      />
                      <textarea
                        className="min-h-20 w-full resize-y rounded-lg border border-synth-border bg-synth-bg px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-synth-secondary"
                        onChange={(event) =>
                          updateForm(submission, {
                            rightsWarnings: event.target.value,
                          })
                        }
                        placeholder="Rights warnings, one per line"
                        value={form.rightsWarnings}
                      />
                      <textarea
                        className="min-h-20 w-full resize-y rounded-lg border border-synth-border bg-synth-bg px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-synth-secondary"
                        onChange={(event) =>
                          updateForm(submission, { notes: event.target.value })
                        }
                        placeholder="Review notes"
                        value={form.notes}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2 xl:col-span-2">
                      <button
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 text-sm font-bold text-emerald-100 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={pending || !candidateReady}
                        onClick={() => void createCandidate(submission)}
                        type="button"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Create Candidate
                      </button>
                      <button
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-4 text-sm font-bold text-red-100 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={pending || form.notes.trim().length === 0}
                        onClick={() => void rejectSubmission(submission)}
                        type="button"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">{pageLabel}</p>
        <Pagination
          currentPage={safePage}
          disabled={submissionsQuery.isFetching}
          onPageChange={setPage}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
}
