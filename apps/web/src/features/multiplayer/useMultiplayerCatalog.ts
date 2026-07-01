import { useEffect, useMemo, useState } from "react";
import { api, getAuthSession, type ApiGame } from "../../lib/api/apiClient";
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
} from "../local-vault/localVaultClient";
import { getPageSlice } from "../../components/ui/paginationUtils";
import { searchAndRankGames } from "../search/gameSearch";
import {
  getJoinInvite,
  getSessionFromInvite,
} from "./inviteUtils";
import type { GameSource, LocalGame } from "./MultiplayerGameCards";

export type MultiplayerMode = "host" | "join";

export const CLOUD_GAMES_PER_PAGE = 15;
export const LOCAL_GAMES_PER_PAGE = 15;

export function useMultiplayerCatalog() {
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

      setLocalGames(
        toLocalVaultGames(normalizeLocalGameFilenames(await response.json())),
      );
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
    () => searchAndRankGames(localGames, searchQuery),
    [localGames, searchQuery],
  );
  const localPageSlice = useMemo(
    () => getPageSlice(filteredLocalGames, localPage, LOCAL_GAMES_PER_PAGE),
    [filteredLocalGames, localPage],
  );

  useEffect(() => {
    if (localPage !== localPageSlice.safeCurrentPage) {
      setLocalPage(localPageSlice.safeCurrentPage);
    }
  }, [localPage, localPageSlice.safeCurrentPage]);

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

  const updateSearchQuery = (nextSearchQuery: string) => {
    setSearchQuery(nextSearchQuery);
    setCloudPage(1);
    setLocalPage(1);
  };

  return {
    changeCatalogPage,
    cloudGames,
    cloudLoadError,
    cloudLoading,
    cloudPageStart,
    cloudTotal,
    cloudTotalPages,
    filteredLocalGames,
    gameSource,
    inviteSessionId,
    inviteUrl,
    isEnginePaired,
    joinInvite,
    localLoading,
    localMessage,
    localPageSlice,
    mode,
    safeCloudPage,
    searchQuery,
    setGameSource,
    setInviteUrl,
    setMode,
    updateSearchQuery,
  };
}
