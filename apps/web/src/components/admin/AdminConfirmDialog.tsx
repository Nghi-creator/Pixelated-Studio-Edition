import { AlertTriangle, Loader2, X } from "lucide-react";

export type AdminConfirmation = {
  body: string;
  confirmLabel: string;
  id: string;
  intent?: "danger" | "warning";
  title: string;
};

export function AdminConfirmDialog({
  confirmation,
  isPending,
  onCancel,
  onConfirm,
}: {
  confirmation: AdminConfirmation;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isDanger = confirmation.intent === "danger";

  return (
    <div
      aria-labelledby="admin-confirm-title"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
    >
      <div className="w-full max-w-md rounded-lg border border-synth-border bg-synth-surface shadow-card">
        <div className="flex items-center justify-between border-b border-synth-border p-5">
          <h2
            className="flex items-center gap-2 text-lg font-bold text-white"
            id="admin-confirm-title"
          >
            <AlertTriangle
              className={isDanger ? "h-5 w-5 text-red-400" : "h-5 w-5 text-synth-secondary"}
            />
            {confirmation.title}
          </h2>
          <button
            aria-label="Close confirmation dialog"
            className="text-gray-400 transition-colors hover:text-white disabled:opacity-50"
            disabled={isPending}
            onClick={onCancel}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <p className="text-sm leading-6 text-gray-300">{confirmation.body}</p>
          <div className="flex justify-end gap-3">
            <button
              className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-300 transition-colors hover:bg-synth-elevated hover:text-white disabled:opacity-50"
              disabled={isPending}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors disabled:cursor-wait disabled:opacity-60 ${
                isDanger
                  ? "border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                  : "border border-synth-primary/30 bg-synth-primary/10 text-synth-secondary hover:bg-synth-primary/20"
              }`}
              disabled={isPending}
              onClick={onConfirm}
              type="button"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmation.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
