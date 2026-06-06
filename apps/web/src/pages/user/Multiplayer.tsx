import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Crown,
  Gamepad2,
  LogIn,
  Play,
  Search,
  Users,
  Wifi,
} from "lucide-react";
import { api, getAuthSession, type ApiGame } from "../../lib/apiClient";
import {
  engineAuthHeaders,
  ENGINE_PAIRING_EVENT,
  hasEngineToken,
} from "../../lib/engineAuth";
import { engineEndpoint, getEngineUrl } from "../../lib/engineConfig";
import { Skeleton } from "../../components/ui/Skeleton";

type MultiplayerMode = "host" | "join";
type GameSource = "cloud" | "local";

type LocalGame = {
  id: string;
  title: string;
};

const getInvitePath = (invite: string) => {
  const trimmedInvite = invite.trim();
  if (!trimmedInvite) return null;

  try {
    return new URL(trimmedInvite, window.location.origin);
  } catch {
    return null;
  }
};

const getJoinTarget = (invite: string) => {
  const inviteUrl = getInvitePath(invite);
  if (!inviteUrl || !inviteUrl.pathname.startsWith("/play/")) return null;
  return `${inviteUrl.pathname}${inviteUrl.search}`;
};

const getSessionFromInvite = (invite: string) => {
  const inviteUrl = getInvitePath(invite);
  return inviteUrl?.searchParams.get("session") || "";
};

const multiplayerBackState = {
  backRoute: "/multiplayer",
  backText: "Back to Multiplayer",
};

function ModeButton({
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
          ? "border-synth-primary/70 bg-synth-primary/20 text-white shadow-glow-primary-sm"
          : "border-synth-border bg-synth-surface text-gray-400 hover:border-synth-primary/50 hover:text-white"
      }`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function StatusPill({
  paired,
}: {
  paired: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
        paired
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
          : "border-amber-400/30 bg-amber-500/10 text-amber-200"
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

function CloudGameCard({ game }: { game: ApiGame }) {
  return (
    <Link
      className="group overflow-hidden rounded-lg border border-synth-border bg-synth-surface transition-all hover:border-synth-primary/60 hover:shadow-glow-primary-sm"
      state={multiplayerBackState}
      to={`/play/${game.id}`}
    >
      <div className="aspect-[4/5] overflow-hidden bg-synth-bg">
        <img
          alt={game.title}
          className="h-full w-full object-cover opacity-80 transition-all duration-300 group-hover:scale-105 group-hover:opacity-100"
          src={game.cover_url}
        />
      </div>
      <div className="flex min-h-20 flex-col justify-between gap-3 p-3">
        <p className="line-clamp-2 text-sm font-bold text-white">
          {game.title}
        </p>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-synth-primary">
          <Play className="h-3.5 w-3.5" />
          Host lobby
        </span>
      </div>
    </Link>
  );
}

function LocalGameCard({ game }: { game: LocalGame }) {
  return (
    <Link
      className="group flex min-h-44 flex-col justify-between rounded-lg border border-synth-border bg-synth-surface p-4 transition-all hover:border-synth-secondary/70 hover:shadow-glow-primary-sm"
      state={multiplayerBackState}
      to={`/play/${encodeURIComponent(game.id)}`}
    >
      <div>
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-synth-border bg-synth-bg text-synth-secondary">
          <Gamepad2 className="h-6 w-6" />
        </div>
        <p className="line-clamp-3 text-sm font-bold text-white">
          {game.title}
        </p>
      </div>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-synth-secondary">
        <Play className="h-3.5 w-3.5" />
        Host lobby
      </span>
    </Link>
  );
}

function MultiplayerGameGridSkeleton({
  source,
}: {
  source: GameSource;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 10 }, (_, index) => (
        source === "cloud" ? (
          <div
            className="overflow-hidden rounded-lg border border-synth-border bg-synth-surface"
            key={index}
          >
            <Skeleton className="aspect-[4/5] w-full rounded-none" />
            <div className="flex min-h-20 flex-col justify-between gap-3 p-3">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ) : (
          <div
            className="flex min-h-44 flex-col justify-between rounded-lg border border-synth-border bg-synth-surface p-4"
            key={index}
          >
            <div>
              <Skeleton className="mb-4 h-12 w-12 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
            <Skeleton className="h-3 w-20" />
          </div>
        )
      ))}
    </div>
  );
}

export default function Multiplayer() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<MultiplayerMode>("host");
  const [gameSource, setGameSource] = useState<GameSource>("cloud");
  const [isEnginePaired, setIsEnginePaired] = useState(hasEngineToken);
  const [cloudGames, setCloudGames] = useState<ApiGame[]>([]);
  const [localGames, setLocalGames] = useState<LocalGame[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const [cloudLoading, setCloudLoading] = useState(true);
  const [localLoading, setLocalLoading] = useState(false);

  useEffect(() => {
    api
      .games()
      .then(({ games }) => setCloudGames(games))
      .catch((error) => {
        console.error("Failed to load multiplayer cloud games:", error);
      })
      .finally(() => setCloudLoading(false));
  }, []);

  useEffect(() => {
    const refreshEnginePairing = () => {
      setIsEnginePaired(hasEngineToken());
    };

    window.addEventListener(ENGINE_PAIRING_EVENT, refreshEnginePairing);
    return () =>
      window.removeEventListener(ENGINE_PAIRING_EVENT, refreshEnginePairing);
  }, []);

  const fetchLocalGames = async () => {
    if (!hasEngineToken()) {
      setLocalGames([]);
      return;
    }

    setLocalLoading(true);
    setLocalMessage("");

    try {
      const session = await getAuthSession();
      const userId = session?.user?.id || "anonymous";
      const response = await fetch(engineEndpoint("/local-games"), {
        headers: { "X-User-Id": userId, ...engineAuthHeaders() },
      });

      if (!response.ok) {
        throw new Error("Local engine did not return games.");
      }

      const filenames = (await response.json()) as string[];
      setLocalGames(
        filenames.map((filename) => ({
          id: filename,
          title: filename.replace(/\.nes$/i, ""),
        })),
      );
    } catch (error) {
      console.error("Failed to load local multiplayer games:", error);
      setLocalMessage(
        "Could not load Local Vault games. Confirm the desktop engine is running and paired.",
      );
    } finally {
      setLocalLoading(false);
    }
  };

  useEffect(() => {
    if (mode === "host" && gameSource === "local" && isEnginePaired) {
      fetchLocalGames();
    }
  }, [gameSource, isEnginePaired, mode]);

  const filteredCloudGames = useMemo(
    () =>
      cloudGames.filter((game) =>
        game.title.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [cloudGames, searchQuery],
  );
  const filteredLocalGames = useMemo(
    () =>
      localGames.filter((game) =>
        game.title.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [localGames, searchQuery],
  );
  const joinTarget = getJoinTarget(inviteUrl);
  const inviteSessionId = getSessionFromInvite(inviteUrl);

  const copyEngineUrl = async () => {
    await navigator.clipboard.writeText(getEngineUrl());
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-synth-primary transition-colors font-medium group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          Back to Library
        </Link>
      </div>

      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="border-l-4 border-synth-secondary pl-3">
          <h1 className="text-3xl font-extrabold text-white">
            Multiplayer
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-400">
            Set up a LAN lobby before opening the player. Hosts choose a game;
            guests join from an invite and request a slot after connecting.
          </p>
        </div>
        <StatusPill paired={isEnginePaired} />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <ModeButton
          active={mode === "host"}
          icon={<Crown className="h-4 w-4" />}
          label="Host Game"
          onClick={() => setMode("host")}
        />
        <ModeButton
          active={mode === "join"}
          icon={<LogIn className="h-4 w-4" />}
          label="Join Game"
          onClick={() => setMode("join")}
        />
      </div>

      {mode === "join" ? (
        <section className="rounded-lg border border-synth-border bg-synth-surface p-5">
          <div className="mb-5 flex items-start gap-3">
            <div className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-synth-border bg-synth-bg text-synth-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                Join An Existing Lobby
              </h2>
              <p className="mt-1 text-sm leading-6 text-gray-400">
                Paste the invite from the host. Pair with the host engine first
                if this browser has not saved the token yet.
              </p>
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">
              Invite URL
            </span>
            <input
              className="h-12 w-full rounded-lg border border-synth-border bg-synth-bg px-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-synth-primary"
              onChange={(event) => setInviteUrl(event.target.value)}
              placeholder="https://pixelated-studio-edition.vercel.app/play/game-id?session=..."
              value={inviteUrl}
            />
          </label>

          {inviteUrl && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                joinTarget
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                  : "border-red-400/30 bg-red-500/10 text-red-200"
              }`}
            >
              {joinTarget
                ? `Invite detected${inviteSessionId ? ` for session ${inviteSessionId}` : ""}.`
                : "That does not look like a Pixelated play invite."}
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-synth-primary/70 bg-synth-primary/15 px-5 text-sm font-bold text-white transition-colors hover:bg-synth-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!joinTarget}
              onClick={() => {
                if (joinTarget) navigate(joinTarget);
              }}
              type="button"
            >
              <LogIn className="h-4 w-4" />
              Join Lobby
            </button>
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-synth-border bg-synth-bg px-4 text-sm font-semibold text-gray-300 transition-colors hover:border-synth-secondary/60 hover:text-white"
              onClick={copyEngineUrl}
              type="button"
            >
              <Copy className="h-4 w-4" />
              Copy Paired Engine URL
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-synth-border bg-synth-surface p-5">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-synth-border bg-synth-bg text-synth-secondary">
                <Crown className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  Choose A Game To Host
                </h2>
                <p className="mt-1 text-sm leading-6 text-gray-400">
                  The player page will start the lobby and expose invite,
                  slots, and stream controls after the game opens.
                </p>
              </div>
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
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search games..."
                  value={searchQuery}
                />
              </label>
            </div>
          </div>

          {gameSource === "local" && !isEnginePaired && (
            <div className="mb-5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Pair the desktop engine before loading Local Vault games.
            </div>
          )}

          {localMessage && (
            <div className="mb-5 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {localMessage}
            </div>
          )}

          {gameSource === "cloud" && cloudLoading ? (
            <MultiplayerGameGridSkeleton source="cloud" />
          ) : gameSource === "local" && localLoading ? (
            <MultiplayerGameGridSkeleton source="local" />
          ) : gameSource === "cloud" ? (
            filteredCloudGames.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
                {filteredCloudGames.map((game) => (
                  <CloudGameCard game={game} key={game.id} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-synth-border bg-synth-bg px-4 py-16 text-center text-gray-500">
                No cloud games match that search.
              </div>
            )
          ) : filteredLocalGames.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
              {filteredLocalGames.map((game) => (
                <LocalGameCard game={game} key={game.id} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-synth-border bg-synth-bg px-4 py-16 text-center text-gray-500">
              <Wifi className="mx-auto mb-3 h-8 w-8 opacity-40" />
              {isEnginePaired
                ? "No Local Vault games are available."
                : "Pair the engine to view Local Vault games."}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
