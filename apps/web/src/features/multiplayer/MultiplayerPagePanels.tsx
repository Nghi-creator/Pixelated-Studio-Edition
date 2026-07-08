import { useNavigate } from "react-router-dom";
import type React from "react";
import {
  AlertCircle,
  CheckCircle2,
  LogIn,
  Search,
  Wifi,
} from "lucide-react";
import { PixelIcon } from "../../components/ui/PixelIcon";
import {
  MultiplayerGameGridSkeleton,
} from "./MultiplayerGameCards";
import {
  CloudCatalogContent,
  LocalCatalogContent,
} from "./MultiplayerCatalogContent";

export function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-bold transition-colors ${
        active
          ? "border-[#C02066] bg-[#9B0048] text-white shadow-card"
          : "border-[#C02066]/50 bg-[#9B0048]/15 text-gray-300 hover:border-[#C02066] hover:bg-[#9B0048]/30 hover:text-white"
      }`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

export function StatusPill({ paired }: { paired: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
        paired
          ? "border-[#C02066]/40 bg-[#9B0048]/15 text-[#F38BB4]"
          : "border-amber-400/30 bg-amber-400/10 text-amber-200"
      }`}
    >
      {paired ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <AlertCircle className="h-4 w-4" />
      )}
      {paired ? "Engine paired" : "Pairing needed"}
    </div>
  );
}

export function JoinLobbyPanel({
  inviteSessionId,
  inviteUrl,
  joinInvite,
  setInviteUrl,
}: {
  inviteSessionId: string | null;
  inviteUrl: string;
  joinInvite: { isCompanion: boolean; target: string; url: string } | null;
  setInviteUrl: (value: string) => void;
}) {
  const navigate = useNavigate();

  return (
    <section className="rounded-lg border border-synth-border bg-synth-surface p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-synth-border bg-synth-bg text-synth-primary">
          <PixelIcon className="h-5 w-5" name="multiplayer" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">
            Join An Existing Lobby
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-400">
            Paste the link shared by the host. An HTTPS desktop companion link
            opens the LAN join checks, then asks for the short-lived invite
            code. You do not need the host&apos;s engine token.
          </p>
        </div>
      </div>

      <label className="block">
        <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">
          Host invite link
        </span>
        <input
          className="h-12 w-full rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-synth-primary"
          onChange={(event) => setInviteUrl(event.target.value)}
          placeholder="https://192.168.1.20:8090/play/game-id?session=..."
          value={inviteUrl}
        />
      </label>

      {inviteUrl && (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            joinInvite
              ? "border-[#C02066]/40 bg-[#9B0048]/15 text-[#F38BB4]"
              : "danger-panel font-bold"
          }`}
        >
          {joinInvite?.isCompanion
            ? `HTTPS companion invite detected${inviteSessionId ? ` for session ${inviteSessionId}` : ""}. Open it to run the LAN preflight and enter the host's invite code.`
            : joinInvite
              ? `Play invite detected${inviteSessionId ? ` for session ${inviteSessionId}` : ""}.`
              : "That does not look like a Pixelated play invite."}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3">
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#ff5ca8]/80 bg-[#9B0048]/55 px-5 text-sm font-bold text-white transition-colors hover:bg-[#B00052] disabled:cursor-not-allowed disabled:border-[#ff5ca8]/60 disabled:bg-[#9B0048]/35 disabled:text-red-100"
          disabled={!joinInvite}
          onClick={() => {
            if (!joinInvite) return;
            if (joinInvite.isCompanion) {
              window.location.assign(joinInvite.url);
              return;
            }
            navigate(joinInvite.target);
          }}
          type="button"
        >
          <LogIn className="h-4 w-4" />
          {joinInvite?.isCompanion ? "Open LAN Join Page" : "Join Lobby"}
        </button>
        <p className="inline-flex items-start gap-2 text-xs leading-5 text-gray-400">
          <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-synth-secondary" />
          For LAN play, stay on the same network as the host. The companion page
          checks HTTPS trust, invite status, and host engine availability before
          enabling Join.
        </p>
      </div>
    </section>
  );
}

export function HostCatalogPanel({
  catalog,
}: {
  catalog: ReturnType<typeof import("./useMultiplayerCatalog").useMultiplayerCatalog>;
}) {
  const {
    cloudLoadError,
    cloudLoading,
    gameSource,
    isEnginePaired,
    localLoading,
    localMessage,
    searchQuery,
    setGameSource,
    updateSearchQuery,
  } = catalog;

  return (
    <section
      className="scroll-mt-24 rounded-lg border border-synth-border bg-synth-surface p-5"
      id="multiplayer-game-catalog"
    >
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">
            Choose A Game To Host
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-400">
            The player page will start the lobby and expose invite, slots, and
            stream controls after the game opens.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[auto_auto_minmax(220px,320px)]">
          <ModeButton
            active={gameSource === "cloud"}
            icon={null}
            label="Cloud"
            onClick={() => setGameSource("cloud")}
          />
          <ModeButton
            active={gameSource === "local"}
            icon={null}
            label="Local"
            onClick={() => setGameSource("local")}
          />
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-500" />
            <input
              className="h-11 w-full rounded-lg border border-synth-border bg-synth-bg pl-10 pr-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-synth-primary"
              onChange={(event) => updateSearchQuery(event.target.value)}
              placeholder="Search games..."
              value={searchQuery}
            />
          </label>
        </div>
      </div>

      {gameSource === "local" && !isEnginePaired && (
        <div className="mb-5 rounded-lg border border-synth-primary/30 bg-synth-primary/10 px-4 py-3 text-sm text-synth-secondary">
          Pair the desktop engine before loading Local Vault games.
        </div>
      )}

      {localMessage && (
        <div className="danger-panel mb-5 rounded-lg border px-4 py-3 text-sm font-bold">
          {localMessage}
        </div>
      )}

      {gameSource === "cloud" && cloudLoading ? (
        <MultiplayerGameGridSkeleton source="cloud" />
      ) : gameSource === "local" && localLoading ? (
        <MultiplayerGameGridSkeleton source="local" />
      ) : gameSource === "cloud" && cloudLoadError ? (
        <div className="danger-panel rounded-lg border px-4 py-16 text-center font-bold">
          {cloudLoadError}
        </div>
      ) : gameSource === "cloud" ? (
        <CloudCatalogContent catalog={catalog} />
      ) : (
        <LocalCatalogContent catalog={catalog} />
      )}
    </section>
  );
}
