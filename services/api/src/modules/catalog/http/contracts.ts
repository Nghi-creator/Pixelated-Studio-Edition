import { z } from "zod";
import { CATALOG_GENRES } from "../domain/catalogGenres.js";

const MAX_CATALOG_QUERY_RESULTS = 5_000;

export const gameParamsSchema = z.object({ gameId: z.string().min(1).max(200) });
export const gamesQuerySchema = z
  .object({
    genre: z.enum(CATALOG_GENRES).optional(),
    license: z.string().trim().min(1).max(80).optional(),
    page: z.coerce.number().int().min(1).max(500).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(15),
    search: z
      .string()
      .trim()
      .max(120)
      .refine((value) => value.split(/\s+/).filter(Boolean).length <= 12)
      .optional(),
  })
  .superRefine((query, context) => {
    if ((query.page - 1) * query.pageSize >= MAX_CATALOG_QUERY_RESULTS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Catalog page exceeds the bounded result window",
        path: ["page"],
      });
    }
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
