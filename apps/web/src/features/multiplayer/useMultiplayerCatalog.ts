import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, getAuthSession } from "../../lib/api/apiClient";
import { queryKeys } from "../../lib/api/queryClient";
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
  const [localGames, setLocalGames] = useState<LocalGame[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const [cloudPage, setCloudPage] = useState(1);
  const [localLoading, setLocalLoading] = useState(false);
  const [localPage, setLocalPage] = useState(1);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedSearchQuery(searchQuery),
      searchQuery ? 250 : 0,
    );

    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  const cloudGamesQuery = useQuery({
    enabled: mode === "host" && gameSource === "cloud",
    queryKey: queryKeys.gameCatalog(
      cloudPage,
      CLOUD_GAMES_PER_PAGE,
      debouncedSearchQuery,
    ),
    queryFn: () =>
      api.games({
        page: cloudPage,
        pageSize: CLOUD_GAMES_PER_PAGE,
        search: debouncedSearchQuery,
      }),
  });
  const cloudGames = cloudGamesQuery.data?.games || [];
  const cloudTotal = cloudGamesQuery.data?.total || 0;
  const cloudTotalPages = cloudGamesQuery.data?.totalPages || 1;
  const cloudLoading = cloudGamesQuery.isLoading || cloudGamesQuery.isFetching;
  const cloudLoadError = cloudGamesQuery.isError
    ? "Could not load cloud games. Check the API connection and try again."
    : "";

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
