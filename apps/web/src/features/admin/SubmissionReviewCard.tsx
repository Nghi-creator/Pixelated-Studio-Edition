import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import {
  canCreateSubmissionCandidate,
  getSubmissionArtifactName,
  type SubmissionFormState,
} from "./submissionReviewState";
import type { ApiGameSubmission } from "../../lib/api/apiTypes";

const inputClassName =
  "h-11 w-full rounded-lg border border-synth-secondary/40 bg-synth-bg px-3 text-sm font-semibold text-white outline-none placeholder:text-gray-400 focus:border-synth-secondary";
const textareaClassName =
  "h-full min-h-0 w-full resize-none rounded-lg border border-synth-secondary/40 bg-synth-bg px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-gray-400 focus:border-synth-secondary";
const disabledTooltipClassName =
  "pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-xs -translate-x-1/2 rounded-md border border-synth-secondary/60 bg-synth-bg px-3 py-2 text-xs font-bold text-white shadow-xl group-hover:block group-focus-within:block";

type SubmissionReviewCardProps = {
  form: SubmissionFormState;
  onCreateCandidate: (submission: ApiGameSubmission) => void;
  onReject: (submission: ApiGameSubmission) => void;
  onUpdateForm: (
    submission: ApiGameSubmission,
    patch: Partial<SubmissionFormState>,
  ) => void;
  pending: boolean;
  submission: ApiGameSubmission;
};

export function SubmissionReviewCard({
  form,
  onCreateCandidate,
  onReject,
  onUpdateForm,
  pending,
  submission,
}: SubmissionReviewCardProps) {
  const candidateReady = canCreateSubmissionCandidate(form);

  return (
    <article className="rounded-lg border border-synth-secondary/35 bg-[#2B1720] p-5 shadow-card">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-white">
              {submission.game_title}
            </h2>
            <span className="rounded-full border border-[#ff5ca8]/90 bg-[#9B0048]/45 px-3 py-1 text-xs font-extrabold text-white">
              {submission.status}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-gray-200">
            {submission.author_name} · {submission.email}
          </p>
          <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-gray-200">
            {submission.description || "No description provided."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {submission.ownership_status && (
              <span className="rounded-full border border-[#ff5ca8]/80 bg-[#9B0048]/35 px-3 py-1 text-xs font-extrabold text-white">
                {submission.ownership_status}
              </span>
            )}
            {submission.hosting_permission && (
              <span className="rounded-full border border-emerald-300/70 bg-emerald-500/20 px-3 py-1 text-xs font-extrabold text-emerald-50">
                {submission.hosting_permission}
              </span>
            )}
            {submission.public_license_scope && (
              <span className="rounded-full border border-amber-300/70 bg-amber-500/20 px-3 py-1 text-xs font-extrabold text-amber-50">
                {submission.public_license_scope}
              </span>
            )}
          </div>
        </div>
        <div className="text-sm font-semibold text-gray-200">
          {new Date(submission.created_at).toLocaleString()}
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <a
          className="rounded-lg border border-synth-secondary/40 bg-synth-bg/80 p-3 text-sm font-semibold text-white hover:border-synth-secondary"
          href={submission.rom_url}
          rel="noreferrer"
          target="_blank"
        >
          <span className="block text-[11px] font-extrabold uppercase text-white">
            ROM
          </span>
          <span className="mt-1 inline-flex items-center gap-1 break-all font-semibold">
            {getSubmissionArtifactName(submission.rom_url)}
            <ExternalLink className="h-3.5 w-3.5" />
          </span>
        </a>
        {submission.cover_url && (
          <a
            className="rounded-lg border border-synth-secondary/40 bg-synth-bg/80 p-3 text-sm font-semibold text-white hover:border-synth-secondary"
            href={submission.cover_url}
            rel="noreferrer"
            target="_blank"
          >
            <span className="block text-[11px] font-extrabold uppercase text-white">
              Cover
            </span>
            Open artwork <ExternalLink className="inline h-3.5 w-3.5" />
          </a>
        )}
        {submission.banner_url && (
          <a
            className="rounded-lg border border-synth-secondary/40 bg-synth-bg/80 p-3 text-sm font-semibold text-white hover:border-synth-secondary"
            href={submission.banner_url}
            rel="noreferrer"
            target="_blank"
          >
            <span className="block text-[11px] font-extrabold uppercase text-white">
              Banner
            </span>
            Open artwork <ExternalLink className="inline h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {submission.status === "pending" && (
        <div className="mt-5 grid items-stretch gap-4 xl:grid-cols-2">
          <div className="grid grid-rows-[44px_44px_44px_44px_44px] gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={inputClassName}
                onChange={(event) =>
                  onUpdateForm(submission, {
                    codeLicense: event.target.value,
                  })
                }
                placeholder="Code license SPDX"
                value={form.codeLicense}
              />
              <input
                className={inputClassName}
                onChange={(event) =>
                  onUpdateForm(submission, {
                    assetLicense: event.target.value,
                  })
                }
                placeholder="Asset license SPDX"
                value={form.assetLicense}
              />
            </div>
            <input
              className={inputClassName}
              onChange={(event) =>
                onUpdateForm(submission, { licenseUrl: event.target.value })
              }
              placeholder="License URL"
              value={form.licenseUrl}
            />
            <input
              className={inputClassName}
              onChange={(event) =>
                onUpdateForm(submission, {
                  sourceRepoUrl: event.target.value,
                })
              }
              placeholder="Source or evidence URL"
              value={form.sourceRepoUrl}
            />
            <input
              className={inputClassName}
              onChange={(event) =>
                onUpdateForm(submission, {
                  permissionEvidenceUrl: event.target.value,
                })
              }
              placeholder="Permission evidence URL"
              value={form.permissionEvidenceUrl}
            />
            <input
              className={inputClassName}
              onChange={(event) =>
                onUpdateForm(submission, {
                  originalReleaseUrl: event.target.value,
                })
              }
              placeholder="Original release URL"
              value={form.originalReleaseUrl}
            />
          </div>

          <div className="grid grid-rows-[44px_44px_44px_44px_44px] gap-3">
            <textarea
              className={`${textareaClassName} row-span-2`}
              onChange={(event) =>
                onUpdateForm(submission, {
                  attribution: event.target.value,
                })
              }
              placeholder="Attribution text"
              value={form.attribution}
            />
            <textarea
              className={`${textareaClassName} row-span-2`}
              onChange={(event) =>
                onUpdateForm(submission, {
                  rightsWarnings: event.target.value,
                })
              }
              placeholder="Rights warnings, one per line"
              value={form.rightsWarnings}
            />
            <textarea
              className={textareaClassName}
              onChange={(event) =>
                onUpdateForm(submission, { notes: event.target.value })
              }
              placeholder="Review notes"
              value={form.notes}
            />
          </div>

          <div className="flex flex-wrap gap-2 xl:col-span-2">
            <span
              className={`group relative inline-flex ${
                candidateReady ? "" : "cursor-not-allowed"
              }`}
              tabIndex={candidateReady ? undefined : 0}
            >
              <button
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 text-sm font-bold text-emerald-100 transition-colors hover:bg-emerald-500/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending || !candidateReady}
                onClick={() => onCreateCandidate(submission)}
                type="button"
              >
                <CheckCircle2 className="h-4 w-4" />
                Create Candidate
              </button>
              {!candidateReady && (
                <span className={disabledTooltipClassName}>
                  Add code license, license URL, source URL, and attribution.
                </span>
              )}
            </span>
            <span
              className={`group relative inline-flex ${
                form.notes.trim() ? "" : "cursor-not-allowed"
              }`}
              tabIndex={form.notes.trim() ? undefined : 0}
            >
              <button
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-4 text-sm font-bold text-red-100 transition-colors hover:bg-red-500/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending || form.notes.trim().length === 0}
                onClick={() => onReject(submission)}
                type="button"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
              {!form.notes.trim() && (
                <span className={disabledTooltipClassName}>
                  Add review notes before rejecting.
                </span>
              )}
            </span>
          </div>
        </div>
      )}
    </article>
  );
}
