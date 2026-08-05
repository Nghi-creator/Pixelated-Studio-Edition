import type {
  EngineInputCapabilities,
  LobbyParticipant,
} from "../../hooks/webrtc/useWebRTC";

export function LobbyPlayerSlots({
  currentParticipant,
  inputCapabilities,
  maxPlayers,
  onReleaseSlot,
  onRequestSlot,
  participants,
}: {
  currentParticipant: LobbyParticipant | null;
  inputCapabilities: EngineInputCapabilities;
  maxPlayers: number;
  onReleaseSlot: () => void;
  onRequestSlot: (playerIndex: number) => void;
  participants: LobbyParticipant[];
}) {
  const currentSlot = currentParticipant?.playerIndex || null;
  const supportedPlayerCount = Math.min(
    maxPlayers,
    inputCapabilities.supportedPlayerCount,
  );
  const occupiedSlots = new Set(
    participants
      .map((participant) => participant.playerIndex)
      .filter((playerIndex): playerIndex is number => playerIndex !== null),
  );

  return (
    <div className="mb-5">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
        Player Slots
      </p>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: maxPlayers }, (_, index) => index + 1).map(
          (playerIndex) => {
            const isCurrentSlot = currentSlot === playerIndex;
            const isOccupied =
              occupiedSlots.has(playerIndex) && !isCurrentSlot;
            const isUnsupported = playerIndex > supportedPlayerCount;
            const isDisabled = isOccupied || isUnsupported;

            return (
              <button
                key={playerIndex}
                type="button"
                disabled={isDisabled}
                onClick={() => onRequestSlot(playerIndex)}
                title={
                  isUnsupported
                    ? inputCapabilities.limitationReason || "Slot disabled"
                    : isOccupied
                      ? `P${playerIndex} is already taken`
                      : `Request P${playerIndex}`
                }
                className={`h-10 rounded-lg border text-sm font-semibold transition-colors ${
                  isCurrentSlot
                    ? "border-synth-border bg-synth-elevated text-white"
                    : isDisabled
                      ? "cursor-not-allowed border-synth-border bg-synth-bg text-gray-600"
                      : "border-synth-border bg-synth-surface text-gray-300 hover:bg-synth-elevated hover:text-white"
                }`}
              >
                P{playerIndex}
              </button>
            );
          },
        )}
      </div>

      {inputCapabilities.limitationReason && (
        <p className="mt-3 text-xs leading-5 text-gray-400">
          {inputCapabilities.limitationReason}
        </p>
      )}

      {currentParticipant?.role !== "host" && currentSlot && (
        <button
          type="button"
          onClick={onReleaseSlot}
          className="mt-3 h-10 w-full rounded-lg border border-synth-border bg-synth-surface text-sm font-semibold text-gray-300 transition-colors hover:bg-synth-elevated hover:text-white"
        >
          Watch Only
        </button>
      )}
    </div>
  );
}
