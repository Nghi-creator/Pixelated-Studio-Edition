import { AlertTriangle, CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import type {
  ApiCatalogCandidate,
  ApiCatalogCandidateReviewAction,
} from "../../lib/api/apiTypes";
import {
  getCatalogCandidateRightsDetails,
  getCatalogCandidateRuntimeDetails,
  getCatalogCandidateWarnings,
  type CatalogCandidateReviewDetail,
} from "../../features/admin/catalogCandidateReviewState";

type CatalogCandidateCardProps = {
  candidate: ApiCatalogCandidate;
  notes: string;
  onNotesChange: (notes: string) => void;
  onReview: (
    candidateId: string,
    action: ApiCatalogCandidateReviewAction,
  ) => void;
  pending: boolean;
};

function toneClass(tone: CatalogCandidateReviewDetail["tone"]) {
  if (tone === "danger") return "border-red-300/70 bg-red-500/20 text-red-50";
  if (tone === "success") {
    return "border-emerald-300/70 bg-emerald-500/20 text-emerald-50";
  }
  if (tone === "warning") {
    return "border-amber-300/70 bg-amber-500/20 text-amber-50";
  }
  return "border-[#ff5ca8]/80 bg-[#9B0048]/35 text-white";
}

const disabledTooltipClassName =
  "pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-xs -translate-x-1/2 rounded-md border border-synth-secondary/60 bg-synth-bg px-3 py-2 text-xs font-bold text-white shadow-xl group-hover:block group-focus-within:block";

function DetailPill({ detail }: { detail: CatalogCandidateReviewDetail }) {
  const isLink = /^https:\/\//.test(detail.value);
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass(detail.tone)}`}>
      <dt className="text-[11px] font-extrabold uppercase text-white">
        {detail.label}
      </dt>
      <dd className="mt-1 break-words text-sm font-bold text-white">
        {isLink ? (
          <a
            className="inline-flex items-center gap-1 text-white underline decoration-synth-secondary decoration-2 underline-offset-4 hover:text-synth-secondary"
            href={detail.value}
            rel="noreferrer"
            target="_blank"
          >
            Open Evidence <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          detail.value
        )}
      </dd>
    </div>
  );
}

export function CatalogCandidateCard({
  candidate,
  notes,
  onNotesChange,
  onReview,
  pending,
}: CatalogCandidateCardProps) {
  const rightsDetails = getCatalogCandidateRightsDetails(candidate);
  const runtimeDetails = getCatalogCandidateRuntimeDetails(candidate);
  const warnings = getCatalogCandidateWarnings(candidate);
  const rejectRequiresNotes = notes.trim().length === 0;

  return (
    <article className="rounded-lg border border-synth-secondary/35 bg-[#2B1720] p-5 shadow-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-white">{candidate.title}</h2>
            <span className="rounded-full border border-[#ff5ca8]/90 bg-[#9B0048]/45 px-3 py-1 text-xs font-extrabold text-white">
              {candidate.source_kind}
            </span>
            <span className="rounded-full border border-[#ff5ca8]/90 bg-[#9B0048]/45 px-3 py-1 text-xs font-extrabold text-white">
              {candidate.import_status}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-gray-200">
            {candidate.developer_name || "Unknown developer"} ·{" "}
            {candidate.source_entry_path}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 text-sm font-bold text-emerald-100 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending}
            onClick={() => onReview(candidate.id, "promote")}
            type="button"
          >
            <CheckCircle2 className="h-4 w-4" />
            Promote
          </button>
          <span
            className={`group relative inline-flex ${
              rejectRequiresNotes ? "cursor-not-allowed" : ""
            }`}
            tabIndex={rejectRequiresNotes ? 0 : undefined}
          >
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-4 text-sm font-bold text-red-100 transition-colors hover:bg-red-500/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pending || rejectRequiresNotes}
              onClick={() => onReview(candidate.id, "reject")}
              type="button"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </button>
            {rejectRequiresNotes && (
              <span className={disabledTooltipClassName}>
                Add review notes before rejecting.
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section>
          <h3 className="mb-2 text-xs font-extrabold uppercase text-white">
            Rights Review
          </h3>
          <dl className="grid gap-2 sm:grid-cols-2">
            {rightsDetails.map((detail) => (
              <DetailPill detail={detail} key={`${detail.label}-${detail.value}`} />
            ))}
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-extrabold uppercase text-white">
            Runtime Target
          </h3>
          <dl className="grid gap-2 sm:grid-cols-2">
            {runtimeDetails.map((detail) => (
              <DetailPill detail={detail} key={`${detail.label}-${detail.value}`} />
            ))}
          </dl>
        </section>
      </div>

      {warnings.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-300/70 bg-amber-500/20 p-3 text-sm font-medium text-amber-50">
          <div className="mb-2 flex items-center gap-2 font-bold">
            <AlertTriangle className="h-4 w-4" />
            Rights Warnings
          </div>
          <ul className="space-y-1">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-synth-secondary/40 bg-synth-bg/80 p-3 text-sm font-medium text-white">
          <p className="font-bold text-white">Attribution</p>
          <p className="mt-1 leading-6">{candidate.attribution_text || "Missing"}</p>
        </div>
        <div>
          <label
            className="mb-2 block text-xs font-extrabold uppercase text-white"
            htmlFor={`candidate-notes-${candidate.id}`}
          >
            Review Notes
            <span className="ml-2 text-amber-200">Required to reject</span>
          </label>
          <textarea
            className="min-h-24 w-full resize-y rounded-lg border border-synth-border bg-synth-bg px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-synth-secondary"
            id={`candidate-notes-${candidate.id}`}
            maxLength={2000}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Required for rejection; optional for promotion."
            value={notes}
          />
        </div>
      </div>
    </article>
  );
}
