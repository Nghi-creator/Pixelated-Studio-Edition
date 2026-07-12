import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw, X } from "lucide-react";
import { Pagination } from "../../components/ui/Pagination";
import { PixelIcon } from "../../components/ui/PixelIcon";
import { AdminSelect } from "../../components/ui/AdminSelect";
import { AdminReviewPageSkeleton } from "../../components/ui/Skeleton";
import {
  getAdminApiErrorMessage,
  getPageAfterRemoval,
  getPageRangeLabel,
} from "../../features/admin/adminState";
import { SubmissionReviewCard } from "../../features/admin/SubmissionReviewCard";
import {
  canCreateSubmissionCandidate,
  getInitialSubmissionFormState,
  parseRightsWarnings,
  type SubmissionFormState,
} from "../../features/admin/submissionReviewState";
import { useReviewGameSubmissionMutation } from "../../features/admin/adminMutations";
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
const STATUS_FILTER_OPTIONS = STATUS_OPTIONS.map((option) => ({
  label: option,
  value: option,
}));

export default function Submissions() {
  const [status, setStatus] = useState<ApiGameSubmissionStatus>("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [toastMessage, setToastMessage] = useState("");
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
      setToastMessage(
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

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timeout = window.setTimeout(() => setToastMessage(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const formFor = (submission: ApiGameSubmission) =>
    formsBySubmission[submission.id] || getInitialSubmissionFormState(submission);
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
    if (!form.notes.trim()) {
      setToastMessage("Add review notes before rejecting this submission.");
      return;
    }
    setPendingSubmissionId(submission.id);
    setToastMessage("");
    await reviewMutation
      .mutateAsync({ notes: form.notes, submissionId: submission.id })
      .catch(() => undefined)
      .finally(() => setPendingSubmissionId(null));
  };

  const createCandidate = async (submission: ApiGameSubmission) => {
    if (pendingSubmissionId) return;
    const form = formFor(submission);
    if (!canCreateSubmissionCandidate(form)) {
      setToastMessage(
        "Add code license, license URL, source URL, and attribution before creating a candidate.",
      );
      return;
    }
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
    setToastMessage("");
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

  if (submissionsQuery.isLoading) {
    return <AdminReviewPageSkeleton filterCount={1} />;
  }

  const loadError = submissionsQuery.isError
    ? getAdminApiErrorMessage(
        submissionsQuery.error,
        "Could not load submissions.",
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
          <PixelIcon className="h-8 w-8 text-synth-secondary" name="publish" />
          Game Submissions
        </h1>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-synth-secondary/80 bg-synth-secondary/25 px-4 py-2 text-sm font-extrabold text-white">
          <span>{totalSubmissions.toLocaleString()}</span>
          <span>Matching</span>
        </span>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-synth-secondary/35 bg-[#2B1720] p-4 shadow-card sm:flex-row sm:items-center">
        <AdminSelect
          ariaLabel="Submission status"
          className="sm:w-44"
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={STATUS_FILTER_OPTIONS}
          value={status}
        />
        <input
          className="h-10 min-w-0 flex-1 rounded-lg border border-synth-secondary/40 bg-synth-bg px-3 text-sm font-semibold text-white outline-none placeholder:text-gray-400 focus:border-synth-secondary"
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
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
            onClick={() => void submissionsQuery.refetch()}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      ) : submissions.length === 0 ? (
        <div className="rounded-lg border border-synth-secondary/35 bg-[#2B1720] p-12 text-center text-gray-200 shadow-card">
          <PixelIcon
            className="mx-auto mb-4 h-12 w-12 text-synth-secondary"
            name="publish"
          />
          <p className="text-xl text-white">No submissions found.</p>
          <p className="mt-2 text-sm font-medium">
            The current server filters are empty.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map((submission) => (
            <SubmissionReviewCard
              form={formFor(submission)}
              key={submission.id}
              onCreateCandidate={(currentSubmission) =>
                void createCandidate(currentSubmission)
              }
              onReject={(currentSubmission) =>
                void rejectSubmission(currentSubmission)
              }
              onUpdateForm={updateForm}
              pending={pendingSubmissionId === submission.id}
              submission={submission}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-gray-200">{pageLabel}</p>
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
