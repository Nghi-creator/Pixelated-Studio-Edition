import { QueryClient } from "@tanstack/react-query";

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
  adminReports: (
    page: number,
    pageSize: number,
    targetRole: "all" | "users" | "admins",
  ) => ["adminReports", page, pageSize, targetRole] as const,
  adminUsers: (page: number, pageSize: number, search: string) =>
    ["adminUsers", page, pageSize, search] as const,
  featuredGames: () => ["featuredGames"] as const,
  favorites: () => ["favorites"] as const,
  favoriteIds: () => ["favoriteIds"] as const,
  game: (gameId: string | undefined) => ["game", gameId] as const,
  gameCatalog: (page: number, pageSize: number, search: string) =>
    ["gameCatalog", page, pageSize, search] as const,
  gameComments: (gameId: string | undefined) => ["gameComments", gameId] as const,
  gameReactions: (gameId: string | undefined) =>
    ["gameReactions", gameId] as const,
  permissions: () => ["permissions"] as const,
  profile: () => ["profile"] as const,
};
