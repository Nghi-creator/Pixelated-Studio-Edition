import { useEffect, useMemo, useState } from "react";
import { useGameCatalogQuery } from "../../lib/api/apiQueries";
import {
  ENGINE_PAIRING_EVENT,
  hasEngineToken,
} from "../../lib/engine/engineAuth";
import { getLocalVaultErrorMessage } from "../local-vault/localVaultClient";
import { getPageSlice } from "../../components/ui/paginationUtils";
import { searchAndRankGames } from "../search/gameSearch";
import {
  getJoinInvite,
  getSessionFromInvite,
} from "./inviteUtils";
import type { GameSource } from "./MultiplayerGameCards";
import { useLocalMultiplayerGamesQuery } from "./useLocalMultiplayerGamesQuery";

export type MultiplayerMode = "host" | "join";

export const CLOUD_GAMES_PER_PAGE = 15;
export const LOCAL_GAMES_PER_PAGE = 15;

export function useMultiplayerCatalog() {
  const [mode, setMode] = useState<MultiplayerMode>("host");
  const [gameSource, setGameSource] = useState<GameSource>("cloud");
  const [isEnginePaired, setIsEnginePaired] = useState(hasEngineToken);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [cloudPage, setCloudPage] = useState(1);
  const [localPage, setLocalPage] = useState(1);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedSearchQuery(searchQuery),
      searchQuery ? 250 : 0,
    );

    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  const cloudGamesQuery = useGameCatalogQuery({
    enabled: mode === "host" && gameSource === "cloud",
    page: cloudPage,
    pageSize: CLOUD_GAMES_PER_PAGE,
    search: debouncedSearchQuery,
  });
  const cloudGames = cloudGamesQuery.data?.games || [];
  const cloudTotal = cloudGamesQuery.data?.total || 0;
  const cloudTotalPages = cloudGamesQuery.data?.totalPages || 1;
  const cloudLoading = cloudGamesQuery.isLoading || cloudGamesQuery.isFetching;
  const cloudLoadError = cloudGamesQuery.isError
    ? "Could not load cloud games. Check the API connection and try again."
    : "";
  const localGamesQuery = useLocalMultiplayerGamesQuery({
    enabled: mode === "host" && gameSource === "local" && isEnginePaired,
  });
  const localGames = useMemo(
    () => localGamesQuery.data || [],
    [localGamesQuery.data],
  );
  const localLoading = localGamesQuery.isLoading || localGamesQuery.isFetching;
  const localMessage = localGamesQuery.isError
    ? getLocalVaultErrorMessage(
        localGamesQuery.error,
        "Could not load Local Vault games. Confirm the desktop engine is running and paired.",
      )
    : "";

  useEffect(() => {
    const refreshEnginePairing = () => {
      setIsEnginePaired(hasEngineToken());
    };

    window.addEventListener(ENGINE_PAIRING_EVENT, refreshEnginePairing);
    return () =>
      window.removeEventListener(ENGINE_PAIRING_EVENT, refreshEnginePairing);
  }, []);

  const filteredLocalGames = useMemo(
    () => searchAndRankGames(localGames, searchQuery),
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
