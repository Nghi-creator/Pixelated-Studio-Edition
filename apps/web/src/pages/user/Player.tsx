import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { PlayerExperience } from "../../features/player/components/shell/PlayerExperience";
import type { PlayerExperience as PlayerExperienceKind } from "../../features/research-mode/researchRoutes";
import type { ResearchRunConfig } from "../../features/research-mode/researchRunConfig";
import { readActiveResearchRun } from "../../features/research-mode/researchRunConfigStorage";

export default function Player({
  experience = "normal",
}: {
  experience?: PlayerExperienceKind;
}) {
  const { id } = useParams<{ id: string }>();
  const [researchConfig] = useState<ResearchRunConfig | null>(() =>
    experience === "research"
      ? readActiveResearchRun(window.sessionStorage, id)
      : null,
  );

  if (experience === "research" && !researchConfig) {
    return <MissingResearchRunSetup gameId={id} />;
  }

  return (
    <PlayerExperience
      experience={experience}
      gameId={id}
      researchConfig={researchConfig}
    />
  );
}

function MissingResearchRunSetup({ gameId }: { gameId?: string }) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl px-4 pt-28">
      <section className="mt-6 rounded-lg border border-synth-border bg-synth-surface p-6 text-center shadow-panel">
        <h1 className="text-2xl font-extrabold text-white">
          Research setup required
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-300">
          This player only starts from a validated, session-scoped run setup.
          Configure the phase and capture timing before connecting to the game.
        </p>
        <button
          className="mt-5 rounded-lg border border-synth-action-hover bg-synth-action px-5 py-2.5 font-bold text-white transition-colors hover:brightness-110"
          onClick={() => navigate(`/research/games/${gameId || ""}/setup`)}
          type="button"
        >
          Open run setup
        </button>
      </section>
    </div>
  );
}
