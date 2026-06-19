import { AlertTriangle, Loader2, X } from "lucide-react";

type ReportModalProps = {
  error: string;
  isSubmittingReport: boolean;
  onClose: () => void;
  onSubmitReport: (event: React.FormEvent<HTMLFormElement>) => void;
  reportReason: string;
  setReportReason: (reason: string) => void;
};

export function ReportModal({
  error,
  isSubmittingReport,
  onClose,
  onSubmitReport,
  reportReason,
  setReportReason,
}: ReportModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-synth-surface border border-synth-border rounded-2xl w-full max-w-md overflow-hidden shadow-card">
        <div className="flex justify-between items-center p-6 border-b border-synth-border">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="text-synth-secondary w-5 h-5" />
            Report Comment
          </h3>
          <button
            onClick={onClose}
            disabled={isSubmittingReport}
            className="text-gray-400 hover:text-white transition-colors disabled:cursor-wait disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmitReport} className="p-6">
          <p className="text-gray-400 text-sm mb-4">
            Why are you reporting this comment? This will be sent directly to
            our moderators for review.
          </p>

          {error && (
            <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          <textarea
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value)}
            placeholder="E.g., Spam, harassment, toxic behavior..."
            className="w-full bg-synth-bg border border-synth-border rounded-xl p-3 text-white focus:outline-none focus:border-synth-secondary focus:ring-1 focus:ring-synth-secondary/40 min-h-[100px] mb-6 resize-none"
            required
          />

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmittingReport}
              className="px-4 py-2 text-gray-400 hover:text-white font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingReport || !reportReason.trim()}
              className="px-6 py-2 bg-synth-primary hover:bg-synth-primary-hover text-white font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmittingReport && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {isSubmittingReport ? "Submitting..." : "Submit Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
