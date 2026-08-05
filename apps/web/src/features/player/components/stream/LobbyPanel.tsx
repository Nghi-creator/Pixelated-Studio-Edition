import { Check, Copy, Link2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "../../../../lib/clipboard";
import type {
  EngineInputCapabilities,
  LobbyParticipant,
  LobbyState,
} from "../../hooks/webrtc/useWebRTC";
import { LobbyParticipants } from "./LobbyParticipants";
import { LobbyPlayerSlots } from "./LobbyPlayerSlots";

type LobbyPanelProps = {
  currentParticipant: LobbyParticipant | null;
  inputCapabilities: EngineInputCapabilities;
  isOpen: boolean;
  lobbyState: LobbyState | null;
  onClose: () => void;
  onKickParticipant: (socketId: string) => void;
  onReleaseSlot: () => void;
  onRequestSlot: (playerIndex: number) => void;
  shareGuidance: string | null;
  shareText: string;
  shareUrl: string;
};

export function LobbyPanel({
  currentParticipant,
  inputCapabilities,
  isOpen,
  lobbyState,
  onClose,
  onKickParticipant,
  onReleaseSlot,
  onRequestSlot,
  shareGuidance,
  shareText,
  shareUrl,
}: LobbyPanelProps) {
  const [copyState, setCopyState] = useState<"copied" | "failed" | "idle">(
    "idle",
  );
  const copyResetTimerRef = useRef<number | null>(null);
  const participants = lobbyState?.participants || [];
  const currentSlot = currentParticipant?.playerIndex || null;
  const maxPlayers = lobbyState?.maxPlayers || 4;
  const canKickParticipants = currentParticipant?.role === "host";

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    },
    [],
  );

  const copyShareUrl = async () => {
    const copied = await copyTextToClipboard(shareText);
    setCopyState(copied ? "copied" : "failed");
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopyState("idle");
      copyResetTimerRef.current = null;
    }, 1_600);
  };

  if (!isOpen) return null;

  return (
        <div className="fixed inset-0 z-[70]">
          <button
            aria-label="Close lobby"
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={onClose}
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
                onClick={onClose}
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
                    onClick={() => void copyShareUrl()}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-synth-border text-gray-300 transition-colors hover:bg-synth-elevated hover:text-white"
                    title={
                      shareGuidance
                        ? "Copy HTTPS join link and invite-code guidance"
                        : "Copy spectator invite link"
                    }
                  >
                    {copyState === "copied" ? (
                      <Check className="h-4 w-4 text-emerald-300" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p
                  aria-live="polite"
                  className={`mt-2 text-xs ${
                    copyState === "failed" ? "text-red-300" : "text-emerald-300"
                  }`}
                >
                  {copyState === "copied"
                    ? "Invite copied."
                    : copyState === "failed"
                      ? "Could not copy automatically. Select the invite URL manually."
                      : ""}
                </p>
                {shareGuidance && (
                  <p className="mt-2 text-xs leading-5 text-gray-400">
                    {shareGuidance}
                  </p>
                )}
              </div>

              <LobbyPlayerSlots
                currentParticipant={currentParticipant}
                inputCapabilities={inputCapabilities}
                maxPlayers={maxPlayers}
                onReleaseSlot={onReleaseSlot}
                onRequestSlot={onRequestSlot}
                participants={participants}
              />
              <LobbyParticipants
                canKickParticipants={canKickParticipants}
                currentParticipant={currentParticipant}
                onKickParticipant={onKickParticipant}
                participants={participants}
              />
            </div>
          </aside>
        </div>
  );
}
