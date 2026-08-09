import { ArrowLeft, FlaskConical, Play } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useGameMetadata } from "../../player/hooks/data/useGameMetadata";
import { ResearchModeBanner } from "../components/ResearchModeBanner";
import { ResearchRunSetupForm } from "../components/ResearchRunSetupForm";
import { getResearchPlayerDestination } from "../researchRoutes";
import {
  createDefaultResearchRunConfig,
  validateResearchRunConfig,
} from "../researchRunConfig";
import {
  readActiveResearchRun,
  writeActiveResearchRun,
} from "../researchRunConfigStorage";

export default function ResearchRunSetup() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { gameTitle } = useGameMetadata(id);
  const [config, setConfig] = useState(() =>
    readActiveResearchRun(window.sessionStorage, id) ||
    createDefaultResearchRunConfig(id),
  );
  const [errors, setErrors] = useState<string[]>([]);

  const startRun = () => {
    const validationErrors = validateResearchRunConfig(config);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    if (!writeActiveResearchRun(window.sessionStorage, config)) {
      setErrors([
        "The browser could not save this run configuration for the player.",
      ]);
      return;
    }
    navigate(getResearchPlayerDestination(id), {
      state: {
        backRoute: `/research/games/${id}/setup`,
        backText: "Back to Research Setup",
      },
    });
  };

  return (
    <div className="mx-auto min-h-[calc(100vh-4rem)] w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <button
        className="mb-6 inline-flex items-center gap-2 text-gray-400 transition-colors hover:text-white"
        onClick={() => navigate("/home")}
        type="button"
      >
        <ArrowLeft aria-hidden="true" className="h-5 w-5" />
        Back to Cloud Library
      </button>

      <ResearchModeBanner />

      <section className="mt-6 rounded-lg border border-synth-border bg-synth-surface p-6 shadow-panel sm:p-8">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-synth-action-hover bg-synth-action text-white">
            <FlaskConical aria-hidden="true" className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-synth-secondary">
              Research run setup
            </p>
            <h1 className="mt-1 text-3xl font-extrabold text-white">
              {gameTitle || "Loading game…"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-300">
              Configure a reproducible run. The player waits for a connected,
              visible stream, performs the warm-up and records automatically.
            </p>
          </div>
        </div>

        <ResearchRunSetupForm
          config={config}
          errors={errors}
          onChange={(nextConfig) => {
            setConfig(nextConfig);
            setErrors([]);
          }}
          onSubmit={startRun}
        />

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            className="rounded-lg border border-synth-border bg-synth-bg px-5 py-2.5 font-semibold text-white transition-colors hover:bg-synth-elevated"
            onClick={() => navigate("/home")}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-synth-action-hover bg-synth-action px-5 py-2.5 font-bold text-white transition-colors hover:brightness-110"
            onClick={startRun}
            type="button"
          >
            <Play aria-hidden="true" className="h-5 w-5 fill-current" />
            Open research player
          </button>
        </div>
      </section>
    </div>
  );
}
