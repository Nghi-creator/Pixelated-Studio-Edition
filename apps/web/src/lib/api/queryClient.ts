import { QueryClient, type QueryClient as QueryClientInstance } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export const queryKeys = {
  accessLogs: (page: number, pageSize: number) =>
    ["accessLogs", page, pageSize] as const,
  catalogCandidates: (
    page: number,
    pageSize: number,
    status: string,
    sourceKind: string,
    platformId: string,
    search: string,
  ) =>
    [
      "catalogCandidates",
      page,
      pageSize,
      status,
      sourceKind,
      platformId,
      search,
    ] as const,
  catalogCandidatesRoot: () => ["catalogCandidates"] as const,
  gameSubmissions: (
    page: number,
    pageSize: number,
    status: string,
    search: string,
  ) => ["gameSubmissions", page, pageSize, status, search] as const,
  gameSubmissionsRoot: () => ["gameSubmissions"] as const,
  adminReports: (
    page: number,
    pageSize: number,
    targetRole: "all" | "users" | "admins",
  ) => ["adminReports", page, pageSize, targetRole] as const,
  adminReportsRoot: () => ["adminReports"] as const,
  adminUsers: (page: number, pageSize: number, search: string) =>
    ["adminUsers", page, pageSize, search] as const,
  adminUsersRoot: () => ["adminUsers"] as const,
  authSession: () => ["authSession"] as const,
  featuredGames: () => ["featuredGames"] as const,
  favorites: () => ["favorites"] as const,
  favoriteIds: () => ["favoriteIds"] as const,
  game: (gameId: string | undefined) => ["game", gameId] as const,
  gameCatalog: (page: number, pageSize: number, search: string) =>
    ["gameCatalog", page, pageSize, search] as const,
  libraryGamePicker: (pageSize: number) =>
    ["libraryGamePicker", pageSize] as const,
  gameComments: (gameId: string | undefined) => ["gameComments", gameId] as const,
  gameReactions: (gameId: string | undefined) =>
    ["gameReactions", gameId] as const,
  localMultiplayerGames: () => ["localMultiplayerGames"] as const,
  permissions: () => ["permissions"] as const,
  profile: () => ["profile"] as const,
};

export const invalidateAdminReportsQueries = (client: QueryClientInstance) =>
  client.invalidateQueries({ queryKey: queryKeys.adminReportsRoot() });

export const invalidateAdminUsersQueries = (client: QueryClientInstance) =>
  client.invalidateQueries({ queryKey: queryKeys.adminUsersRoot() });

export const invalidateCatalogCandidateQueries = (client: QueryClientInstance) =>
  client.invalidateQueries({ queryKey: queryKeys.catalogCandidatesRoot() });

export const invalidateGameSubmissionQueries = (client: QueryClientInstance) =>
  client.invalidateQueries({ queryKey: queryKeys.gameSubmissionsRoot() });

export const invalidateFavoriteQueries = async (client: QueryClientInstance) => {
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.favoriteIds() }),
    client.invalidateQueries({ queryKey: queryKeys.favorites() }),
  ]);
};

export const invalidateGameCommentsQuery = (
  client: QueryClientInstance,
  gameId: string | undefined,
) => client.invalidateQueries({ queryKey: queryKeys.gameComments(gameId) });

export const invalidateGameReactionsQuery = (
  client: QueryClientInstance,
  gameId: string | undefined,
) => client.invalidateQueries({ queryKey: queryKeys.gameReactions(gameId) });

export const invalidateProfileQueries = async (client: QueryClientInstance) => {
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.profile() }),
    client.invalidateQueries({ queryKey: queryKeys.permissions() }),
  ]);
};
