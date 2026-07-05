import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../../src/index.css";
import {
  AdminConfirmDialog,
  type AdminConfirmation,
} from "../../src/components/admin/AdminConfirmDialog";
import ReportCard, { type Report } from "../../src/components/admin/ReportCard";
import {
  INVALID_ENGINE_TOKEN_MESSAGE,
  validateLocalRomFile,
} from "../../src/features/local-vault/localVaultClient";
import { LobbyPanel } from "../../src/features/player/components/LobbyPanel";
import {
  PlayerControls,
  PlayerInstructions,
} from "../../src/features/player/components/PlayerControls";
import { PlayerHeader } from "../../src/features/player/components/PlayerHeader";
import { StreamStage } from "../../src/features/player/components/StreamStage";
import { StreamTelemetryPanel } from "../../src/features/player/components/StreamTelemetryPanel";
import {
  validateRomFile,
  validateSubmissionImageFile,
} from "../../src/features/publish/publishSubmission";
import {
  INITIAL_WEBRTC_TELEMETRY,
  type WebRTCTelemetry,
} from "../../src/lib/webrtc/webrtcTelemetry";
import type { WebRTCStatus } from "../../src/lib/webrtc/webrtcSession";
import {
  DEFAULT_STREAM_PROFILE,
  STREAM_PROFILES,
  type StreamProfileId,
} from "../../src/lib/engine/streamProfiles";
import { Pagination } from "../../src/components/ui/Pagination";

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

type BootRecoveryMode = "cloud" | "local";

type BootRecoveryState = {
  attempt: "failed" | "recovered" | "retrying";
  sessionId: string;
  status: WebRTCStatus;
  telemetry: WebRTCTelemetry;
};

const bootFailureCopy: Record<BootRecoveryMode, string> = {
  cloud:
    "Cloud boot failed: the hosted API returned a game without a reachable ROM target.",
  local:
    "Local boot failed: the desktop engine could not open demo-local.nes from Local Vault.",
};

function createBootRecoveryState(
  mode: BootRecoveryMode,
  attempt: "failed" | "recovered" = "failed",
): BootRecoveryState {
  const sessionId = `${mode}-session-${attempt}`;

  return {
    attempt,
    sessionId,
    status: attempt === "failed" ? "error" : "playing",
    telemetry: {
      ...INITIAL_WEBRTC_TELEMETRY,
      connectionState: attempt === "failed" ? "failed" : "connected",
      iceConnectionState: attempt === "failed" ? "failed" : "connected",
      lastEngineError: attempt === "failed" ? bootFailureCopy[mode] : null,
      lastUpdatedAt: attempt === "failed" ? 1_781_501_000_000 : 1_781_501_005_000,
    },
  };
}

function BootRecoveryHarness({
  mode,
  onRecord,
}: {
  mode: BootRecoveryMode;
  onRecord: (event: string) => void;
}) {
  const [state, setState] = useState(() => createBootRecoveryState(mode));
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const title =
    mode === "cloud" ? "Cloud Boot Recovery" : "Local Vault Boot Recovery";
  const shareUrl = `https://pixelated.test/play/${mode === "cloud" ? "cloud-game" : "demo-local.nes"}?session=${state.sessionId}`;

  const retryBoot = () => {
    onRecord(`${mode}-boot-retry:${state.sessionId}`);
    setState({
      ...createBootRecoveryState(mode, "failed"),
      attempt: "retrying",
      sessionId: `${mode}-session-retrying`,
      status: "connecting",
      telemetry: INITIAL_WEBRTC_TELEMETRY,
    });

    window.setTimeout(() => {
      setState(createBootRecoveryState(mode, "recovered"));
      onRecord(`${mode}-boot-recovered`);
    }, 250);
  };

  return (
    <section
      aria-label={`${title} harness`}
      className="max-w-3xl space-y-3"
    >
      <PlayerHeader
        backRoute={mode === "cloud" ? "/home" : "/local"}
        backText={mode === "cloud" ? "Back to Cloud Library" : "Back to Local Vault"}
        gameTitle={title}
        onToggleTelemetry={() => onRecord(`${mode}-boot-telemetry-toggle`)}
        showStreamTelemetry
        status={state.status}
      />
      <StreamStage
        isMuted={false}
        onRetry={retryBoot}
        showStreamTelemetry
        status={state.status}
        telemetry={state.telemetry}
        videoRef={videoRef}
      />
      <div className="rounded-lg border border-synth-border bg-synth-surface p-3 text-sm text-gray-300">
        <p>{mode === "cloud" ? "Cloud game" : "Local game"} session: {state.sessionId}</p>
        <p>Boot attempt: {state.attempt}</p>
        <p>Share URL: {shareUrl}</p>
      </div>
    </section>
  );
}

export function AdminHarness() {
  const [confirmation, setConfirmation] = useState<AdminConfirmation | null>(
    null,
  );
  const [localVaultConfirmation, setLocalVaultConfirmation] =
    useState<AdminConfirmation | null>(null);
  const [localVaultMessage, setLocalVaultMessage] = useState<string | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [page, setPage] = useState(2);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishRom, setPublishRom] = useState<File | null>(null);
  const [showTelemetry, setShowTelemetry] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [streamProfileId, setStreamProfileId] =
    useState<StreamProfileId>("balanced");
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
          backRoute="/home"
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
          controls={
            <PlayerControls
              gameTitle="Harness Game"
              isMuted={isMuted}
              onMuteToggle={() => setIsMuted((muted) => !muted)}
              onStreamProfileChange={setStreamProfileId}
              onToggleTelemetry={() => setShowTelemetry((visible) => !visible)}
              selectedStreamProfileId={streamProfileId}
              showStreamTelemetry={showTelemetry}
              streamProfiles={STREAM_PROFILES}
            />
          }
          isMuted={isMuted}
          onRetry={() => record("stream-retry")}
          showStreamTelemetry={showTelemetry}
          status="error"
          telemetry={streamTelemetry}
          videoRef={videoRef}
        />
        <PlayerInstructions />
        {showTelemetry && (
          <StreamTelemetryPanel
            gameId="harness-game"
            gameTitle="Harness Game"
            isRecordingCsv={false}
            onClearTelemetryCsv={() => record("telemetry-csv-clear")}
            onClose={() => {
              record("telemetry-hidden");
              setShowTelemetry(false);
            }}
            onResetTelemetryData={() => record("telemetry-reset")}
            onToggleCsvRecording={() => record("telemetry-csv-toggle")}
            playerMode="host"
            researchRun={{
              baselineForm: {
                browserMemoryMb: "",
                cpuNotes: "",
                deviceNotes: "",
                emulatorId: "",
                fps: "",
                startupMs: "",
              },
              events: [],
              metadataForm: {
                coldStart: false,
                networkType: "",
                notes: "",
                scenario: "localhost",
              },
              onBaselineFormChange: () => record("baseline-form-change"),
              onMetadataFormChange: () => record("research-form-change"),
              runId: "edge-run-harness",
            }}
            recordedCsvSamples={[]}
            sessionId="session-1"
            shareUrl="https://engine.local/play/demo?session=session-1"
            status="error"
            streamProfile={DEFAULT_STREAM_PROFILE}
            telemetry={streamTelemetry}
          />
        )}
      </section>

      <BootRecoveryHarness mode="cloud" onRecord={record} />
      <BootRecoveryHarness mode="local" onRecord={record} />

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

      <section aria-label="Publish form harness" className="max-w-2xl">
        <form
          className="space-y-3 rounded-xl border border-synth-border bg-synth-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const error = validateRomFile(publishRom);
            if (error) {
              setPublishError(error);
              return;
            }
            record("publish-submit-ready");
            setPublishError(null);
          }}
        >
          {publishError && (
            <p className="text-sm text-red-300" role="alert">
              {publishError}
            </p>
          )}
          <label
            className="block text-sm font-semibold text-gray-300"
            htmlFor="harness-publish-rom"
          >
            Harness ROM
          </label>
          <input
            id="harness-publish-rom"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] || null;
              const error = validateRomFile(file);
              setPublishRom(error ? null : file);
              setPublishError(error);
            }}
            type="file"
          />
          <label
            className="block text-sm font-semibold text-gray-300"
            htmlFor="harness-publish-cover"
          >
            Harness Cover
          </label>
          <input
            id="harness-publish-cover"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] || null;
              setPublishError(validateSubmissionImageFile(file));
            }}
            type="file"
          />
          <button
            className="rounded-lg border border-synth-primary/60 px-4 py-2 text-sm font-semibold text-white"
            type="submit"
          >
            Harness Submit
          </button>
        </form>
      </section>

      <section aria-label="Local vault harness" className="max-w-2xl">
        <div className="space-y-3 rounded-xl border border-synth-border bg-synth-surface p-4">
          {localVaultMessage && (
            <p className="text-sm text-red-300" role="alert">
              {localVaultMessage}
            </p>
          )}
          <label
            className="block text-sm font-semibold text-gray-300"
            htmlFor="harness-local-rom"
          >
            Harness Local ROM
          </label>
          <input
            id="harness-local-rom"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] || null;
              setLocalVaultMessage(validateLocalRomFile(file));
            }}
            type="file"
          />
          <button
            className="rounded-lg border border-red-400/60 px-4 py-2 text-sm font-semibold text-red-200"
            onClick={() =>
              setLocalVaultConfirmation({
                body: "Delete demo.nes from the local vault harness?",
                confirmLabel: "Delete ROM",
                id: "demo.nes",
                intent: "danger",
                title: "Delete local ROM?",
              })
            }
            type="button"
          >
            Open local delete
          </button>
          <button
            className="rounded-lg border border-synth-primary/60 px-4 py-2 text-sm font-semibold text-synth-secondary"
            onClick={() => setLocalVaultMessage(INVALID_ENGINE_TOKEN_MESSAGE)}
            type="button"
          >
            Simulate pairing loss
          </button>
        </div>
        {localVaultConfirmation && (
          <AdminConfirmDialog
            confirmation={localVaultConfirmation}
            isPending={false}
            onCancel={() => setLocalVaultConfirmation(null)}
            onConfirm={() => {
              record(`local-delete:${localVaultConfirmation.id}`);
              setLocalVaultConfirmation(null);
            }}
          />
        )}
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
