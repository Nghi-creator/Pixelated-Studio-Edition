import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Crown,
  LogIn,
  Search,
  Users,
  Wifi,
} from "lucide-react";
import { api, getAuthSession, type ApiGame } from "../../lib/apiClient";
import {
  clearEngineToken,
  engineAuthHeaders,
  ENGINE_PAIRING_EVENT,
  hasEngineToken,
} from "../../lib/engine/engineAuth";
import { engineEndpoint } from "../../lib/engine/engineConfig";
import {
  INVALID_ENGINE_TOKEN_MESSAGE,
  normalizeLocalGameFilenames,
  toLocalVaultGames,
} from "../../features/local-vault/localVaultClient";
import {
  CloudGameCard,
  LocalGameCard,
  MultiplayerGameGridSkeleton,
  type GameSource,
  type LocalGame,
} from "../../features/multiplayer/MultiplayerGameCards";
import {
  getJoinInvite,
  getSessionFromInvite,
} from "../../features/multiplayer/inviteUtils";
import { Pagination } from "../../components/ui/Pagination";
import { getPageSlice } from "../../components/ui/paginationUtils";

type MultiplayerMode = "host" | "join";

const CLOUD_GAMES_PER_PAGE = 15;
const LOCAL_GAMES_PER_PAGE = 15;

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

function StatusPill({ paired }: { paired: boolean }) {
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
  const [cloudLoadError, setCloudLoadError] = useState("");
  const [cloudPage, setCloudPage] = useState(1);
  const [cloudTotal, setCloudTotal] = useState(0);
  const [cloudTotalPages, setCloudTotalPages] = useState(1);
  const [localLoading, setLocalLoading] = useState(false);
  const [localPage, setLocalPage] = useState(1);

  useEffect(() => {
    if (mode !== "host" || gameSource !== "cloud") return;

    let isCurrentRequest = true;
    const timeout = window.setTimeout(
      () => {
        setCloudLoading(true);
        setCloudLoadError("");

        api
          .games({
            page: cloudPage,
            pageSize: CLOUD_GAMES_PER_PAGE,
            search: searchQuery,
          })
          .then(({ games, total, totalPages }) => {
            if (!isCurrentRequest) return;
            setCloudGames(games);
            setCloudTotal(total);
            setCloudTotalPages(totalPages);
          })
          .catch((error) => {
            console.error("Failed to load multiplayer cloud games:", error);
            if (isCurrentRequest) {
              setCloudLoadError(
                "Could not load cloud games. Check the API connection and try again.",
              );
            }
          })
          .finally(() => {
            if (isCurrentRequest) setCloudLoading(false);
          });
      },
      searchQuery ? 250 : 0,
    );

    return () => {
      isCurrentRequest = false;
      window.clearTimeout(timeout);
    };
  }, [cloudPage, gameSource, mode, searchQuery]);

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
        if (response.status === 401) {
          clearEngineToken();
          setIsEnginePaired(false);
          throw new Error(INVALID_ENGINE_TOKEN_MESSAGE);
        }
        throw new Error("Local engine did not return games.");
      }

      setLocalGames(toLocalVaultGames(normalizeLocalGameFilenames(await response.json())));
    } catch (error) {
      console.error("Failed to load local multiplayer games:", error);
      setLocalMessage(
        error instanceof Error && error.message
          ? error.message
          : "Could not load Local Vault games. Confirm the desktop engine is running and paired.",
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

  useEffect(() => {
    if (cloudPage > cloudTotalPages) {
      setCloudPage(cloudTotalPages);
    }
  }, [cloudPage, cloudTotalPages]);

  const filteredLocalGames = useMemo(
    () =>
      localGames.filter((game) =>
        game.title.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [localGames, searchQuery],
  );
  const localPageSlice = useMemo(
    () => getPageSlice(filteredLocalGames, localPage, LOCAL_GAMES_PER_PAGE),
    [filteredLocalGames, localPage],
  );
  const joinInvite = getJoinInvite(inviteUrl);
  const inviteSessionId = getSessionFromInvite(inviteUrl);
  const safeCloudPage = Math.min(cloudPage, cloudTotalPages);
  const cloudPageStart = (safeCloudPage - 1) * CLOUD_GAMES_PER_PAGE;

  const changeCatalogPage = (page: number, source: GameSource) => {
    if (source === "cloud") {
      setCloudPage(page);
    } else {
      setLocalPage(page);
    }
    document
      .getElementById("multiplayer-game-catalog")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (localPage !== localPageSlice.safeCurrentPage) {
      setLocalPage(localPageSlice.safeCurrentPage);
    }
  }, [localPage, localPageSlice.safeCurrentPage]);

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
          <h1 className="text-3xl font-extrabold text-white">Multiplayer</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-400">
            Set up a LAN lobby. Hosts choose a game; guests join from an invite
            and request a slot after connecting.
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
                Paste the link shared by the host. An HTTPS desktop companion
                link opens the LAN join checks, then asks for the short-lived
                invite code. You do not need the host&apos;s engine token.
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
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                  : "border-red-400/30 bg-red-500/10 text-red-200"
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
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-synth-primary/70 bg-synth-primary/15 px-5 text-sm font-bold text-white transition-colors hover:bg-synth-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
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
              For LAN play, stay on the same network as the host. The companion
              page checks HTTPS trust, invite status, and host engine
              availability before enabling Join.
            </p>
          </div>
        </section>
      ) : (
        <section
          className="scroll-mt-24 rounded-lg border border-synth-border bg-synth-surface p-5"
          id="multiplayer-game-catalog"
        >
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
                  The player page will start the lobby and expose invite, slots,
                  and stream controls after the game opens.
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
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setCloudPage(1);
                    setLocalPage(1);
                  }}
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
          ) : gameSource === "cloud" && cloudLoadError ? (
            <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-16 text-center text-red-200">
              {cloudLoadError}
            </div>
          ) : gameSource === "cloud" ? (
            cloudGames.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
                  {cloudGames.map((game) => (
                    <CloudGameCard game={game} key={game.id} />
                  ))}
                </div>

                {cloudTotalPages > 1 && (
                  <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-gray-500">
                      Showing {cloudPageStart + 1}-
                      {Math.min(
                        cloudPageStart + cloudGames.length,
                        cloudTotal,
                      )}{" "}
                      of {cloudTotal}
                    </p>

                    <Pagination
                      currentPage={safeCloudPage}
                      onPageChange={(page) => changeCatalogPage(page, "cloud")}
                      totalPages={cloudTotalPages}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-synth-border bg-synth-bg px-4 py-16 text-center text-gray-500">
                {searchQuery
                  ? `No cloud games match "${searchQuery}".`
                  : "No cloud games are available."}
              </div>
            )
          ) : filteredLocalGames.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
                {localPageSlice.items.map((game) => (
                  <LocalGameCard game={game} key={game.id} />
                ))}
              </div>

              {localPageSlice.totalPages > 1 && (
                <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-gray-500">
                    Showing {localPageSlice.pageStart + 1}-
                    {Math.min(
                      localPageSlice.pageStart + localPageSlice.items.length,
                      filteredLocalGames.length,
                    )}{" "}
                    of {filteredLocalGames.length}
                  </p>
                  <Pagination
                    currentPage={localPageSlice.safeCurrentPage}
                    onPageChange={(page) => changeCatalogPage(page, "local")}
                    totalPages={localPageSlice.totalPages}
                  />
                </div>
              )}
            </>
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
