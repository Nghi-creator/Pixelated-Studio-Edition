import type { ResearchBaselineForm } from "../../research/researchBaseline";

const FIELD_CLASS =
  "mt-1 h-9 w-full rounded-md border border-synth-border bg-synth-bg px-2 text-sm font-semibold normal-case text-white outline-none transition placeholder:text-gray-500 focus:border-synth-primary";

export function ResearchBaselineFields({
  form,
  onChange,
}: {
  form: ResearchBaselineForm;
  onChange: (form: ResearchBaselineForm) => void;
}) {
  const setField = <Key extends keyof ResearchBaselineForm>(
    key: Key,
    value: ResearchBaselineForm[Key],
  ) => onChange({ ...form, [key]: value });

  return (
    <fieldset className="mt-5 grid gap-3 rounded-lg border border-synth-border bg-synth-bg p-4 sm:grid-cols-2">
      <legend className="px-2 text-xs font-bold uppercase tracking-[0.16em] text-synth-secondary">
        Browser baseline measurements
      </legend>
      <label className="block text-xs font-semibold uppercase text-white">
        Emulator
        <input
          className={FIELD_CLASS}
          maxLength={128}
          onChange={(event) => setField("emulatorId", event.target.value)}
          placeholder="WASM emulator/runtime"
          value={form.emulatorId}
        />
      </label>
      <label className="block text-xs font-semibold uppercase text-white">
        Startup ms
        <input
          className={FIELD_CLASS}
          inputMode="decimal"
          onChange={(event) => setField("startupMs", event.target.value)}
          placeholder="Manual or measured"
          value={form.startupMs}
        />
      </label>
      <label className="block text-xs font-semibold uppercase text-white">
        FPS
        <input
          className={FIELD_CLASS}
          inputMode="decimal"
          onChange={(event) => setField("fps", event.target.value)}
          placeholder="If available"
          value={form.fps}
        />
      </label>
      <label className="block text-xs font-semibold uppercase text-white">
        Memory MB
        <input
          className={FIELD_CLASS}
          inputMode="decimal"
          onChange={(event) => setField("browserMemoryMb", event.target.value)}
          placeholder="Manual if needed"
          value={form.browserMemoryMb}
        />
      </label>
      <p className="text-xs normal-case text-gray-400 sm:col-span-2">
        These values are written to browser-baseline.json. Free-text device and
        CPU notes are excluded from the formal TAR.
      </p>
    </fieldset>
  );
}
