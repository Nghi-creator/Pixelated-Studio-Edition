import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/supabaseAuth.js";
import { TtlCache } from "../../cache/ttlCache.js";
import { createRateLimiter } from "../../security/sharedRateLimiter.js";
import type { CatalogService } from "../services/catalogService.js";
import type { CachedGamesCatalogResponse } from "./contracts.js";

export type CatalogRouteOptions = {
  requireUser?: typeof requireSupabaseUser;
  supabase?: CatalogService | null;
};

export const CATALOG_CACHE_MAX_ENTRIES = 256;

export function createCatalogRouteContext(options: CatalogRouteOptions = {}) {
  return {
    commentWriteLimiter: createRateLimiter({
      limit: 10,
      namespace: "comment-write",
      windowMs: 60_000,
    }),
    gamesCatalogCache: new TtlCache<CachedGamesCatalogResponse>(
      60_000,
      CATALOG_CACHE_MAX_ENTRIES,
    ),
    reactionWriteLimiter: createRateLimiter({
      limit: 120,
      namespace: "reaction-write",
      windowMs: 60_000,
    }),
    requireUser: options.requireUser || requireSupabaseUser,
    service: options.supabase === undefined ? supabaseService : options.supabase,
  };
}

export type CatalogRouteContext = ReturnType<typeof createCatalogRouteContext>;
