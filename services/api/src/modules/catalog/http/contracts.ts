import { z } from "zod";

export const gameParamsSchema = z.object({ gameId: z.string().min(1).max(200) });
export const gamesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(15),
  search: z.string().trim().max(120).optional(),
});
export const commentParamsSchema = z.object({ commentId: z.string().uuid() });
export const commentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export const commentBodySchema = z.object({
  content: z.string().trim().min(1).max(2000),
});
export const reactionBodySchema = z.object({
  isLike: z.boolean().nullable(),
});

export type CachedGamesCatalogResponse = {
  featuredGames?: unknown[];
  games: unknown[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
