import { LobbyPanel } from "../../../src/features/player/components/stream/LobbyPanel";

export function LobbyHarness({
  isOpen,
  onClose,
  onRecord,
}: {
  isOpen: boolean;
  onClose: () => void;
  onRecord: (event: string) => void;
}) {
  return (
    <section aria-label="Lobby harness" className="space-y-3">
      <LobbyPanel
        currentParticipant={{
          connectedAt: "2026-06-14T00:00:00.000Z",
          displayName: "Host",
          playerIndex: 1,
          role: "host",
          socketId: "host-socket",
        }}
        inputCapabilities={{
          limitationReason:
            "P3/P4 are disabled in this harness to exercise disabled slots.",
          source: "health",
          supportedPlayerCount: 2,
        }}
        isOpen={isOpen}
        lobbyState={{
          hostSocketId: "host-socket",
          maxPlayers: 4,
          participants: [
            {
              connectedAt: "2026-06-14T00:00:00.000Z",
              displayName: "Host",
              playerIndex: 1,
              role: "host",
              socketId: "host-socket",
            },
            {
              connectedAt: "2026-06-14T00:01:00.000Z",
              displayName: "Guest",
              playerIndex: 2,
              role: "player",
              socketId: "guest-socket",
            },
          ],
          sessionId: "session-1",
        }}
        onClose={onClose}
        onKickParticipant={(socketId) => onRecord(`kick:${socketId}`)}
        onReleaseSlot={() => onRecord("release-slot")}
        onRequestSlot={(playerIndex) => onRecord(`request-slot:${playerIndex}`)}
        shareGuidance="Open this HTTPS join link, then enter the invite code."
        shareText="https://engine.local/play/demo?session=session-1"
        shareUrl="https://engine.local/play/demo?session=session-1"
      />
    </section>
  );
}
