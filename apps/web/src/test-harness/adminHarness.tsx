import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import {
  AdminConfirmDialog,
  type AdminConfirmation,
} from "../components/admin/AdminConfirmDialog";
import ReportCard, { type Report } from "../components/admin/ReportCard";
import { StreamStage } from "../features/player/StreamStage";
import { INITIAL_WEBRTC_TELEMETRY } from "../lib/webrtc/webrtcTelemetry";
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
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const record = (event: string) => {
    setEvents((current) => [...current, event]);
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
        <StreamStage
          onRetry={() => record("stream-retry")}
          showStreamTelemetry
          status="error"
          telemetry={{
            ...INITIAL_WEBRTC_TELEMETRY,
            lastEngineError: "Engine could not open the selected game file.",
          }}
          videoRef={videoRef}
        />
      </section>

      <output aria-label="Harness events">{events.join("|")}</output>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AdminHarness />
  </React.StrictMode>,
);

window.__PIXELATED_INTERACTION_HARNESS_READY__ = true;
