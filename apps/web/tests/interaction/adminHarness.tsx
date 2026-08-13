import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import "../../src/index.css";
import {
  AdminConfirmDialog,
  type AdminConfirmation,
} from "../../src/components/admin/AdminConfirmDialog";
import { Pagination } from "../../src/components/ui/Pagination";
import ReportCard, {
  type Report,
} from "../../src/features/admin/components/ReportCard";
import { KeyboardMappingDrawer } from "../../src/features/player/components/stream/KeyboardMappingDrawer";
import { BootRecoveryHarness } from "./admin-harness/BootRecoveryHarness";
import { LobbyHarness } from "./admin-harness/LobbyHarness";
import { LocalVaultHarness } from "./admin-harness/LocalVaultHarness";
import { PublishFormHarness } from "./admin-harness/PublishFormHarness";
import { StreamStageHarness } from "./admin-harness/StreamStageHarness";

declare global {
  interface Window {
    __PIXELATED_INTERACTION_HARNESS_READY__?: boolean;
  }
}

const userReport: Report = {
  comments: {
    content: "This comment needs moderation.",
    id: "comment-user",
    profiles: { id: "target-user", role: "user", username: "player" },
  },
  created_at: "2026-06-14T00:00:00.000Z",
  id: "report-user",
  profiles: { id: "reporter-user", username: "reporter" },
  reason: "Harassment",
};

const adminReport: Report = {
  comments: {
    content: "Admin comment under review.",
    id: "comment-admin",
    profiles: { id: "target-admin", role: "admin", username: "moderator" },
  },
  created_at: "2026-06-14T00:00:00.000Z",
  id: "report-admin",
  profiles: { id: "reporter-user", username: "reporter" },
  reason: "Admin report",
};

export function AdminHarness() {
  const [confirmation, setConfirmation] = useState<AdminConfirmation | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [page, setPage] = useState(2);
  const [showLobby, setShowLobby] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);

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

      <StreamStageHarness
        onOpenKeyboard={() => setShowKeyboard(true)}
        onOpenLobby={() => setShowLobby(true)}
        onRecord={record}
      />
      <BootRecoveryHarness mode="cloud" onRecord={record} />
      <BootRecoveryHarness mode="local" onRecord={record} />
      <LobbyHarness
        isOpen={showLobby}
        onClose={() => setShowLobby(false)}
        onRecord={record}
      />
      {showKeyboard && (
        <KeyboardMappingDrawer onClose={() => setShowKeyboard(false)} />
      )}
      <PublishFormHarness onRecord={record} />
      <LocalVaultHarness onRecord={record} />

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
