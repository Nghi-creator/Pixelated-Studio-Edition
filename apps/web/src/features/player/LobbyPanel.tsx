import {
  Copy,
  Crown,
  Gamepad2,
  Link2,
  Monitor,
  UserRound,
  X,
} from "lucide-react";
import type {
  LobbyParticipant,
  LobbyState,
} from "../../lib/useWebRTC";

type LobbyPanelProps = {
  currentParticipant: LobbyParticipant | null;
  lobbyState: LobbyState | null;
  onKickParticipant: (socketId: string) => void;
  onReleaseSlot: () => void;
  onRequestSlot: (playerIndex: number) => void;
  shareUrl: string;
};

function getRoleIcon(participant: LobbyParticipant) {
  if (participant.role === "host") return Crown;
  if (participant.role === "player") return Gamepad2;
  return Monitor;
}

export function LobbyPanel({
  currentParticipant,
  lobbyState,
  onKickParticipant,
  onReleaseSlot,
  onRequestSlot,
  shareUrl,
}: LobbyPanelProps) {
  const participants = lobbyState?.participants || [];
  const currentSlot = currentParticipant?.playerIndex || null;
  const maxPlayers = lobbyState?.maxPlayers || 4;
  const canKickParticipants = currentParticipant?.role === "host";
  const occupiedSlots = new Set(
    participants
      .map((participant) => participant.playerIndex)
      .filter((playerIndex): playerIndex is number => playerIndex !== null),
  );

  const copyShareUrl = () => {
    void navigator.clipboard?.writeText(shareUrl);
  };

  return (
    <section className="w-full max-w-5xl mt-5 border-y border-synth-border py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-200">
            <UserRound className="h-4 w-4 text-synth-primary" />
            Lobby
            {currentParticipant && (
              <span className="rounded-full border border-synth-border px-2 py-0.5 text-xs font-medium capitalize text-gray-400">
                {currentParticipant.role}
                {currentSlot ? ` · P${currentSlot}` : ""}
              </span>
            )}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {participants.map((participant) => {
              const RoleIcon = getRoleIcon(participant);
              const isCurrent =
                currentParticipant?.socketId === participant.socketId;

              return (
                <div
                  key={participant.socketId}
                  className={`flex min-h-12 items-center justify-between rounded-lg border px-3 ${
                    isCurrent
                      ? "border-synth-primary/70 bg-synth-primary/10"
                      : "border-synth-border bg-synth-surface"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <RoleIcon className="h-4 w-4 shrink-0 text-synth-primary" />
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-200">
                        {participant.displayName}
                      </span>
                      <span className="block text-[10px] uppercase tracking-wide text-emerald-400">
                        Connected
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {participant.playerIndex
                        ? `P${participant.playerIndex}`
                        : "View"}
                    </span>
                    {canKickParticipants &&
                      !isCurrent &&
                      participant.role !== "host" && (
                        <button
                          type="button"
                          onClick={() => onKickParticipant(participant.socketId)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-synth-border text-gray-400 transition-colors hover:border-red-400/70 hover:text-red-300"
                          title={`Remove ${participant.displayName}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-80">
          <div className="flex items-center gap-2 rounded-lg border border-synth-border bg-synth-surface px-3 py-2">
            <Link2 className="h-4 w-4 shrink-0 text-synth-primary" />
            <span className="min-w-0 flex-1 truncate text-xs text-gray-400">
              {shareUrl}
            </span>
            <button
              type="button"
              onClick={copyShareUrl}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-synth-border text-gray-300 transition-colors hover:border-synth-primary/70 hover:text-white"
              title="Copy invite link"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: maxPlayers }, (_, index) => index + 1).map(
              (playerIndex) => {
                const isCurrentSlot = currentSlot === playerIndex;
                const isOccupied =
                  occupiedSlots.has(playerIndex) && !isCurrentSlot;

                return (
                  <button
                    key={playerIndex}
                    type="button"
                    disabled={isOccupied}
                    onClick={() => onRequestSlot(playerIndex)}
                    className={`h-10 rounded-lg border text-sm font-semibold transition-colors ${
                      isCurrentSlot
                        ? "border-synth-primary bg-synth-primary/20 text-white"
                        : isOccupied
                          ? "cursor-not-allowed border-synth-border bg-synth-bg text-gray-600"
                          : "border-synth-border bg-synth-surface text-gray-300 hover:border-synth-primary/70 hover:text-white"
                    }`}
                  >
                    P{playerIndex}
                  </button>
                );
              },
            )}
          </div>

          {currentParticipant?.role !== "host" && currentSlot && (
            <button
              type="button"
              onClick={onReleaseSlot}
              className="h-10 rounded-lg border border-synth-border bg-synth-surface text-sm font-semibold text-gray-300 transition-colors hover:border-synth-primary/70 hover:text-white"
            >
              Watch Only
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
