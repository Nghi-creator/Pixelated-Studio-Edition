import type { ResearchBaselineForm } from "../research/researchBaseline";

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
  ) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <div className="mt-4 grid gap-3 rounded-md border border-synth-border bg-synth-bg/70 p-3 sm:grid-cols-2">
      <label className="block text-xs font-semibold uppercase text-white">
        Emulator
        <input
          className="mt-1 h-9 w-full rounded-md border border-synth-border bg-synth-bg px-2 text-sm font-semibold normal-case text-white outline-none transition placeholder:text-white focus:border-synth-primary"
          onChange={(event) => setField("emulatorId", event.target.value)}
          placeholder="WASM emulator/runtime"
          value={form.emulatorId}
        />
      </label>
      <label className="block text-xs font-semibold uppercase text-white">
        Startup ms
        <input
          className="mt-1 h-9 w-full rounded-md border border-synth-border bg-synth-bg px-2 text-sm font-semibold normal-case text-white outline-none transition placeholder:text-white focus:border-synth-primary"
          inputMode="decimal"
          onChange={(event) => setField("startupMs", event.target.value)}
          placeholder="Manual or measured"
          value={form.startupMs}
        />
      </label>
      <label className="block text-xs font-semibold uppercase text-white">
        FPS
        <input
          className="mt-1 h-9 w-full rounded-md border border-synth-border bg-synth-bg px-2 text-sm font-semibold normal-case text-white outline-none transition placeholder:text-white focus:border-synth-primary"
          inputMode="decimal"
          onChange={(event) => setField("fps", event.target.value)}
          placeholder="If available"
          value={form.fps}
        />
      </label>
      <label className="block text-xs font-semibold uppercase text-white">
        Memory MB
        <input
          className="mt-1 h-9 w-full rounded-md border border-synth-border bg-synth-bg px-2 text-sm font-semibold normal-case text-white outline-none transition placeholder:text-white focus:border-synth-primary"
          inputMode="decimal"
          onChange={(event) => setField("browserMemoryMb", event.target.value)}
          placeholder="Manual if needed"
          value={form.browserMemoryMb}
        />
      </label>
      <label className="block text-xs font-semibold uppercase text-white sm:col-span-2">
        Device notes
        <textarea
          className="mt-1 min-h-16 w-full resize-y rounded-md border border-synth-border bg-synth-bg px-3 py-2 text-sm font-medium normal-case text-white outline-none transition placeholder:text-white focus:border-synth-primary"
          onChange={(event) => setField("deviceNotes", event.target.value)}
          placeholder="Browser-only test device and setup"
          value={form.deviceNotes}
        />
      </label>
      <label className="block text-xs font-semibold uppercase text-white sm:col-span-2">
        CPU notes
        <textarea
          className="mt-1 min-h-16 w-full resize-y rounded-md border border-synth-border bg-synth-bg px-3 py-2 text-sm font-medium normal-case text-white outline-none transition placeholder:text-white focus:border-synth-primary"
          onChange={(event) => setField("cpuNotes", event.target.value)}
          placeholder="Manual CPU/RAM observations"
          value={form.cpuNotes}
        />
      </label>
    </div>
  );
}
