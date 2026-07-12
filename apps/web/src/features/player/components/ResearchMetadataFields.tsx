import { AdminSelect } from "../../../components/ui/AdminSelect";
import type {
  ResearchRunMetadataForm,
  ResearchRunScenario,
} from "../research/researchRunMetadata";

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
const RESEARCH_SELECT_BUTTON_CLASS =
  "flex h-9 w-full items-center justify-between gap-4 rounded-md border border-synth-border bg-synth-bg pl-2 pr-5 text-left text-sm font-semibold normal-case text-white outline-none transition hover:border-synth-primary focus:border-synth-primary";
const RESEARCH_SELECT_MENU_CLASS =
  "absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-md border border-synth-border bg-synth-bg py-1 shadow-card";

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
      <label className="block text-xs font-semibold uppercase text-white">
        Scenario
        <AdminSelect
          ariaLabel="Research scenario"
          buttonClassName={RESEARCH_SELECT_BUTTON_CLASS}
          className="mt-1"
          menuClassName={RESEARCH_SELECT_MENU_CLASS}
          onChange={(value) => setField("scenario", value)}
          options={SCENARIO_OPTIONS}
          value={form.scenario}
        />
      </label>

      <label className="block text-xs font-semibold uppercase text-white">
        Network
        <AdminSelect
          ariaLabel="Research network type"
          buttonClassName={RESEARCH_SELECT_BUTTON_CLASS}
          className="mt-1"
          menuClassName={RESEARCH_SELECT_MENU_CLASS}
          onChange={(value) => setField("networkType", value)}
          options={NETWORK_OPTIONS.map((networkType) => ({
            label: networkType || "Unspecified",
            value: networkType,
          }))}
          value={form.networkType}
        />
      </label>

      <label className="flex items-center gap-2 rounded-md border border-synth-border bg-synth-bg px-3 py-2 text-sm font-semibold text-white sm:col-span-2">
        <input
          checked={form.coldStart}
          className="h-4 w-4 accent-synth-primary"
          onChange={(event) => setField("coldStart", event.target.checked)}
          type="checkbox"
        />
        Cold start
      </label>

      <label className="block text-xs font-semibold uppercase text-white sm:col-span-2">
        Notes
        <textarea
          className="mt-1 min-h-24 w-full resize-y rounded-md border border-synth-border bg-synth-bg px-3 py-2 text-sm font-medium normal-case text-white outline-none transition placeholder:text-white focus:border-synth-primary"
          onChange={(event) => setField("notes", event.target.value)}
          placeholder="Device, room, network, or test condition notes"
          value={form.notes}
        />
      </label>
    </div>
  );
}
