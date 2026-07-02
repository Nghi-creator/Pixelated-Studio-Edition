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
  if (tone === "danger") return "border-red-400/30 bg-red-500/10 text-red-100";
  if (tone === "success") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }
  if (tone === "warning") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }
  return "border-synth-border bg-synth-elevated/50 text-gray-200";
}

function DetailPill({ detail }: { detail: CatalogCandidateReviewDetail }) {
  const isLink = /^https:\/\//.test(detail.value);
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass(detail.tone)}`}>
      <dt className="text-[11px] font-bold uppercase text-gray-400">
        {detail.label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold">
        {isLink ? (
          <a
            className="inline-flex items-center gap-1 text-synth-secondary hover:text-white"
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

  return (
    <article className="rounded-lg border border-synth-border bg-[#2B1720] p-5 shadow-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-white">{candidate.title}</h2>
            <span className="rounded-full border border-synth-secondary/30 bg-synth-secondary/15 px-3 py-1 text-xs font-bold text-synth-secondary">
              {candidate.source_kind}
            </span>
            <span className="rounded-full border border-synth-border px-3 py-1 text-xs font-bold text-gray-300">
              {candidate.import_status}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-400">
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
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-4 text-sm font-bold text-red-100 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending || notes.trim().length === 0}
            onClick={() => onReview(candidate.id, "reject")}
            type="button"
          >
            <XCircle className="h-4 w-4" />
            Reject
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase text-gray-500">
            Rights Review
          </h3>
          <dl className="grid gap-2 sm:grid-cols-2">
            {rightsDetails.map((detail) => (
              <DetailPill detail={detail} key={`${detail.label}-${detail.value}`} />
            ))}
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-bold uppercase text-gray-500">
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
        <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
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
        <div className="rounded-lg border border-synth-border bg-synth-bg/60 p-3 text-sm text-gray-300">
          <p className="font-bold text-white">Attribution</p>
          <p className="mt-1 leading-6">{candidate.attribution_text || "Missing"}</p>
        </div>
        <div>
          <label
            className="mb-2 block text-xs font-bold uppercase text-gray-500"
            htmlFor={`candidate-notes-${candidate.id}`}
          >
            Review Notes
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
