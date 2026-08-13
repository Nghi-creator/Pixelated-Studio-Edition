import { useState } from "react";
import {
  AdminConfirmDialog,
  type AdminConfirmation,
} from "../../../src/components/admin/AdminConfirmDialog";
import {
  INVALID_ENGINE_TOKEN_MESSAGE,
  validateLocalRomFile,
} from "../../../src/lib/local-vault/localVaultClient";

export function LocalVaultHarness({
  onRecord,
}: {
  onRecord: (event: string) => void;
}) {
  const [confirmation, setConfirmation] = useState<AdminConfirmation | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section aria-label="Local vault harness" className="max-w-2xl">
      <div className="space-y-3 rounded-xl border border-synth-border bg-synth-surface p-4">
        {message && (
          <p className="text-sm text-red-300" role="alert">
            {message}
          </p>
        )}
        <label
          className="block text-sm font-semibold text-gray-300"
          htmlFor="harness-local-rom"
        >
          Harness Local ROM
        </label>
        <input
          id="harness-local-rom"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] || null;
            setMessage(validateLocalRomFile(file));
          }}
          type="file"
        />
        <button
          className="rounded-lg border border-red-400/60 px-4 py-2 text-sm font-semibold text-red-200"
          onClick={() =>
            setConfirmation({
              body: "Delete demo.nes from the local vault harness?",
              confirmLabel: "Delete ROM",
              id: "demo.nes",
              intent: "danger",
              title: "Delete local ROM?",
            })
          }
          type="button"
        >
          Open local delete
        </button>
        <button
          className="rounded-lg border border-synth-primary/60 px-4 py-2 text-sm font-semibold text-synth-secondary"
          onClick={() => setMessage(INVALID_ENGINE_TOKEN_MESSAGE)}
          type="button"
        >
          Simulate pairing loss
        </button>
      </div>
      {confirmation && (
        <AdminConfirmDialog
          confirmation={confirmation}
          isPending={false}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            onRecord(`local-delete:${confirmation.id}`);
            setConfirmation(null);
          }}
        />
      )}
    </section>
  );
}
