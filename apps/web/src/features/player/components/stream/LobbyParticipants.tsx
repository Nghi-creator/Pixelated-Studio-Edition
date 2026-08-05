import { X } from "lucide-react";
import { PixelIcon } from "../../../../components/ui/PixelIcon";
import type { LobbyParticipant } from "../../hooks/webrtc/useWebRTC";

function getRoleIconName(participant: LobbyParticipant) {
  if (participant.role === "host") return "engine-on";
  if (participant.role === "player") return "cartridge";
  return "profile";
}

export function LobbyParticipants({
  canKickParticipants,
  currentParticipant,
  onKickParticipant,
  participants,
}: {
  canKickParticipants: boolean;
  currentParticipant: LobbyParticipant | null;
  onKickParticipant: (socketId: string) => void;
  participants: LobbyParticipant[];
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
        Participants
      </p>
      <div className="grid gap-2">
        {participants.length === 0 ? (
          <div className="rounded-lg border border-synth-border bg-synth-surface px-3 py-6 text-center text-sm text-gray-500">
            No participants connected yet.
          </div>
        ) : (
          participants.map((participant) => {
            const isCurrent =
              currentParticipant?.socketId === participant.socketId;
            return (
              <div
                key={participant.socketId}
                className={`flex min-h-12 items-center justify-between rounded-lg border px-3 ${
                  isCurrent
                    ? "border-synth-border bg-synth-elevated"
                    : "border-synth-border bg-synth-surface"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <PixelIcon
                    className="h-4 w-4 shrink-0 text-synth-secondary"
                    name={getRoleIconName(participant)}
                  />
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-200">
                      {participant.displayName}
                    </span>
                    <span className="block text-[10px] uppercase tracking-wide text-[#C02066]">
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
          })
        )}
      </div>
    </div>
  );
}
