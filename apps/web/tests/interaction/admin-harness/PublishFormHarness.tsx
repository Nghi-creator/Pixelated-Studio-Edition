import { useState } from "react";
import {
  validateRomFile,
  validateSubmissionImageFile,
} from "../../../src/features/publish/publishSubmission";

export function PublishFormHarness({
  onRecord,
}: {
  onRecord: (event: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [rom, setRom] = useState<File | null>(null);

  return (
    <section aria-label="Publish form harness" className="max-w-2xl">
      <form
        className="space-y-3 rounded-xl border border-synth-border bg-synth-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const validationError = validateRomFile(rom);
          if (validationError) {
            setError(validationError);
            return;
          }
          onRecord("publish-submit-ready");
          setError(null);
        }}
      >
        {error && (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
        <label
          className="block text-sm font-semibold text-gray-300"
          htmlFor="harness-publish-rom"
        >
          Harness ROM
        </label>
        <input
          id="harness-publish-rom"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] || null;
            const validationError = validateRomFile(file);
            setRom(validationError ? null : file);
            setError(validationError);
          }}
          type="file"
        />
        <label
          className="block text-sm font-semibold text-gray-300"
          htmlFor="harness-publish-cover"
        >
          Harness Cover
        </label>
        <input
          id="harness-publish-cover"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] || null;
            setError(validateSubmissionImageFile(file));
          }}
          type="file"
        />
        <button
          className="rounded-lg border border-synth-primary/60 px-4 py-2 text-sm font-semibold text-white"
          type="submit"
        >
          Harness Submit
        </button>
      </form>
    </section>
  );
}
