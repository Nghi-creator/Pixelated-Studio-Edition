import type {
  ResearchRunMetadataForm,
  ResearchRunScenario,
} from "../researchRunMetadata";

const SCENARIO_OPTIONS: Array<{
  label: string;
  value: ResearchRunScenario;
}> = [
  { label: "Localhost", value: "localhost" },
  { label: "LAN", value: "lan" },
  { label: "Browser baseline", value: "browser_only_baseline" },
  { label: "Custom", value: "custom" },
];

const NETWORK_OPTIONS = ["", "Ethernet", "Wi-Fi", "Mobile hotspot", "Custom"];

export function ResearchMetadataFields({
  form,
  onChange,
}: {
  form: ResearchRunMetadataForm;
  onChange: (form: ResearchRunMetadataForm) => void;
}) {
  const setField = <Key extends keyof ResearchRunMetadataForm>(
    key: Key,
    value: ResearchRunMetadataForm[Key],
  ) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs font-semibold uppercase text-gray-500">
        Scenario
        <select
          className="mt-1 h-9 w-full rounded-md border border-synth-border bg-synth-bg px-2 text-sm font-semibold normal-case text-white outline-none transition focus:border-synth-primary"
          onChange={(event) =>
            setField("scenario", event.target.value as ResearchRunScenario)
          }
          value={form.scenario}
        >
          {SCENARIO_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-semibold uppercase text-gray-500">
        Network
        <select
          className="mt-1 h-9 w-full rounded-md border border-synth-border bg-synth-bg px-2 text-sm font-semibold normal-case text-white outline-none transition focus:border-synth-primary"
          onChange={(event) => setField("networkType", event.target.value)}
          value={form.networkType}
        >
          {NETWORK_OPTIONS.map((networkType) => (
            <option key={networkType || "blank"} value={networkType}>
              {networkType || "Unspecified"}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 rounded-md border border-synth-border bg-synth-bg px-3 py-2 text-sm font-semibold text-gray-200 sm:col-span-2">
        <input
          checked={form.coldStart}
          className="h-4 w-4 accent-synth-primary"
          onChange={(event) => setField("coldStart", event.target.checked)}
          type="checkbox"
        />
        Cold start
      </label>

      <label className="block text-xs font-semibold uppercase text-gray-500 sm:col-span-2">
        Notes
        <textarea
          className="mt-1 min-h-24 w-full resize-y rounded-md border border-synth-border bg-synth-bg px-3 py-2 text-sm font-medium normal-case text-white outline-none transition placeholder:text-gray-600 focus:border-synth-primary"
          onChange={(event) => setField("notes", event.target.value)}
          placeholder="Device, room, network, or test condition notes"
          value={form.notes}
        />
      </label>
    </div>
  );
}
