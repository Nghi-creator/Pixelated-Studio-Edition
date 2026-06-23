import { Copy, Link2, X } from "lucide-react";
import { useState } from "react";
import { PixelIcon } from "../../../components/ui/PixelIcon";
import type {
  EngineInputCapabilities,
  LobbyParticipant,
  LobbyState,
} from "../../../lib/webrtc/useWebRTC";

type LobbyPanelProps = {
  currentParticipant: LobbyParticipant | null;
  inputCapabilities: EngineInputCapabilities;
  lobbyState: LobbyState | null;
  onKickParticipant: (socketId: string) => void;
  onReleaseSlot: () => void;
  onRequestSlot: (playerIndex: number) => void;
  shareGuidance: string | null;
  shareText: string;
  shareUrl: string;
};

function getRoleIconName(participant: LobbyParticipant) {
  if (participant.role === "host") return "engine-on";
  if (participant.role === "player") return "cartridge";
  return "profile";
}

export function LobbyPanel({
  currentParticipant,
  inputCapabilities,
  lobbyState,
  onKickParticipant,
  onReleaseSlot,
  onRequestSlot,
  shareGuidance,
  shareText,
  shareUrl,
}: LobbyPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const participants = lobbyState?.participants || [];
  const currentSlot = currentParticipant?.playerIndex || null;
  const maxPlayers = lobbyState?.maxPlayers || 4;
  const supportedPlayerCount = Math.min(
    maxPlayers,
    inputCapabilities.supportedPlayerCount,
  );
  const canKickParticipants = currentParticipant?.role === "host";
  const occupiedSlots = new Set(
    participants
      .map((participant) => participant.playerIndex)
      .filter((playerIndex): playerIndex is number => playerIndex !== null),
  );

  const copyShareUrl = () => {
    void navigator.clipboard?.writeText(shareText);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#5D263A] bg-[#351B27] px-4 text-sm font-bold text-white transition-colors hover:bg-[#2B1720]"
      >
        Lobby
        <span className="rounded-full border border-synth-border bg-synth-bg px-2 py-0.5 text-[10px] font-semibold text-gray-300">
          {participants.length}
        </span>
        {currentParticipant && (
          <span className="rounded-full border border-synth-border bg-synth-bg/70 px-2 py-0.5 text-[10px] font-medium capitalize text-gray-400">
            {currentParticipant.role}
            {currentSlot ? ` · P${currentSlot}` : ""}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[70]">
          <button
            aria-label="Close lobby"
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
            type="button"
          />

          <aside className="absolute left-0 top-0 flex h-full w-full max-w-md flex-col border-r border-synth-border bg-synth-bg shadow-2xl">
            <div className="flex items-center justify-between border-b border-synth-border px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-white">Lobby</h2>
                {currentParticipant && (
                  <p className="mt-1 text-xs capitalize text-gray-400">
                    {currentParticipant.role}
                    {currentSlot ? ` · Player ${currentSlot}` : " · Spectator"}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-synth-border text-gray-400 transition-colors hover:bg-synth-elevated hover:text-white"
                title="Close lobby"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="mb-5">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                  {shareGuidance ? "LAN Invite" : "Spectator Invite"}
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-synth-border bg-synth-surface px-3 py-2">
                  <Link2 className="h-4 w-4 shrink-0 text-synth-secondary" />
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-400">
                    {shareUrl}
                  </span>
                  <button
                    type="button"
                    onClick={copyShareUrl}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-synth-border text-gray-300 transition-colors hover:bg-synth-elevated hover:text-white"
                    title={
                      shareGuidance
                        ? "Copy HTTPS join link and invite-code guidance"
                        : "Copy spectator invite link"
                    }
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                {shareGuidance && (
                  <p className="mt-2 text-xs leading-5 text-gray-400">
                    {shareGuidance}
                  </p>
                )}
              </div>

              <div className="mb-5">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                  Player Slots
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from(
                    { length: maxPlayers },
                    (_, index) => index + 1,
                  ).map((playerIndex) => {
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
                            ? inputCapabilities.limitationReason ||
                              "Slot disabled"
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
                  })}
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
                      const roleIconName = getRoleIconName(participant);
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
                              name={roleIconName}
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
                                  onClick={() =>
                                    onKickParticipant(participant.socketId)
                                  }
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
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
