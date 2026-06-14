import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../index.css";
import {
  AdminConfirmDialog,
  type AdminConfirmation,
} from "../components/admin/AdminConfirmDialog";
import ReportCard, { type Report } from "../components/admin/ReportCard";
import { LobbyPanel } from "../features/player/LobbyPanel";
import { PlayerHeader } from "../features/player/PlayerHeader";
import { StreamStage } from "../features/player/StreamStage";
import { StreamTelemetryPanel } from "../features/player/StreamTelemetryPanel";
import {
  INITIAL_WEBRTC_TELEMETRY,
  type WebRTCTelemetry,
} from "../lib/webrtc/webrtcTelemetry";
import { Pagination } from "../components/ui/Pagination";

declare global {
  interface Window {
    __PIXELATED_INTERACTION_HARNESS_READY__?: boolean;
  }
}

const userReport: Report = {
  comments: {
    content: "This comment needs moderation.",
    id: "comment-user",
    profiles: {
      id: "target-user",
      role: "user",
      username: "player",
    },
  },
  created_at: "2026-06-14T00:00:00.000Z",
  id: "report-user",
  profiles: {
    id: "reporter-user",
    username: "reporter",
  },
  reason: "Harassment",
};

const adminReport: Report = {
  comments: {
    content: "Admin comment under review.",
    id: "comment-admin",
    profiles: {
      id: "target-admin",
      role: "admin",
      username: "moderator",
    },
  },
  created_at: "2026-06-14T00:00:00.000Z",
  id: "report-admin",
  profiles: {
    id: "reporter-user",
    username: "reporter",
  },
  reason: "Admin report",
};

export function AdminHarness() {
  const [confirmation, setConfirmation] = useState<AdminConfirmation | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [page, setPage] = useState(2);
  const [showTelemetry, setShowTelemetry] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const record = (event: string) => {
    setEvents((current) => [...current, event]);
  };
  const streamTelemetry: WebRTCTelemetry = {
    ...INITIAL_WEBRTC_TELEMETRY,
    bitrateKbps: 1200,
    connectionState: "connected",
    fps: 60,
    iceConnectionState: "connected",
    jitterMs: 3.5,
    lastEngineError: "Engine could not open the selected game file.",
    lastUpdatedAt: 1_781_500_000_000,
    packetsLost: 0,
  };

  const confirmDestructiveAction = () => {
    setPending(true);
    window.setTimeout(() => {
      record(`confirmed:${confirmation?.id || "missing"}`);
      setPending(false);
      setConfirmation(null);
    }, 80);
  };

  return (
    <main className="min-h-screen space-y-8 bg-synth-bg p-8 text-white">
      <section aria-label="Confirmation harness" className="space-y-4">
        <button
          className="rounded-lg bg-red-500/10 px-4 py-2 text-red-300"
          onClick={() =>
            setConfirmation({
              body: "This fake action exercises the same confirmation shell used by admin mutations.",
              confirmLabel: "Confirm Ban",
              id: "ban-user",
              intent: "danger",
              title: "Ban user?",
            })
          }
          type="button"
        >
          Open confirmation
        </button>
        {confirmation && (
          <AdminConfirmDialog
            confirmation={confirmation}
            isPending={pending}
            onCancel={() => {
              record("cancelled");
              setConfirmation(null);
            }}
            onConfirm={confirmDestructiveAction}
          />
        )}
      </section>

      <section aria-label="Report card harness" className="space-y-4">
        <ReportCard
          currentUserId="admin-user"
          currentUserRole="admin"
          onBan={(id) => record(`ban:${id}`)}
          onDelete={(id) => record(`delete:${id}`)}
          onIgnore={(id) => record(`ignore:${id}`)}
          pending={false}
          report={userReport}
        />
        <ReportCard
          currentUserId="admin-user"
          currentUserRole="admin"
          onBan={(id) => record(`ban:${id}`)}
          onDelete={(id) => record(`delete:${id}`)}
          onIgnore={(id) => record(`ignore:${id}`)}
          pending={false}
          report={adminReport}
        />
      </section>

      <section aria-label="Pagination harness" className="space-y-3">
        <p data-testid="current-page">Current page: {page}</p>
        <Pagination
          currentPage={page}
          onPageChange={setPage}
          totalPages={4}
        />
      </section>

      <section aria-label="Stream stage harness" className="max-w-2xl">
        <PlayerHeader
          backRoute="/"
          backText="Back to Cloud Library"
          gameTitle="Harness Game"
          onToggleTelemetry={() => {
            record(showTelemetry ? "telemetry-toggle-off" : "telemetry-toggle-on");
            setShowTelemetry((isVisible) => !isVisible);
          }}
          showStreamTelemetry={showTelemetry}
          status="error"
        />
        <StreamStage
          onRetry={() => record("stream-retry")}
          showStreamTelemetry={showTelemetry}
          status="error"
          telemetry={streamTelemetry}
          videoRef={videoRef}
        />
        {showTelemetry && (
          <StreamTelemetryPanel
            gameId="harness-game"
            onClose={() => {
              record("telemetry-hidden");
              setShowTelemetry(false);
            }}
            playerMode="host"
            sessionId="session-1"
            shareUrl="https://engine.local/play/demo?session=session-1"
            status="error"
            telemetry={streamTelemetry}
          />
        )}
      </section>

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
          onKickParticipant={(socketId) => record(`kick:${socketId}`)}
          onReleaseSlot={() => record("release-slot")}
          onRequestSlot={(playerIndex) => record(`request-slot:${playerIndex}`)}
          shareGuidance="Open this HTTPS join link, then enter the invite code."
          shareText="https://engine.local/play/demo?session=session-1"
          shareUrl="https://engine.local/play/demo?session=session-1"
        />
      </section>

      <output aria-label="Harness events">{events.join("|")}</output>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MemoryRouter>
      <AdminHarness />
    </MemoryRouter>
  </React.StrictMode>,
);

window.__PIXELATED_INTERACTION_HARNESS_READY__ = true;
