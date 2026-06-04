import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../modules/auth/supabaseAuth.js";
import { TtlCache } from "../modules/cache/ttlCache.js";
import {
  logTiming,
  timed,
  type TimingFields,
} from "../modules/observability/timing.js";

const gameParamsSchema = z.object({ gameId: z.string().min(1).max(200) });
const gamesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(15),
  search: z.string().trim().max(120).optional(),
});
const commentParamsSchema = z.object({ commentId: z.string().uuid() });
const commentsQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
});
const commentBodySchema = z.object({
  content: z.string().trim().min(1).max(2000),
});
const reactionBodySchema = z.object({
  isLike: z.boolean().nullable(),
});
const FEATURED_GAME_LIMIT = 3;
const ZERO_PLAY_FEATURED_POOL_LIMIT = 5;

type ProfileRole = {
  role: string | null;
};

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type CatalogRouteOptions = {
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

type GamesCatalogResponse = {
  featuredGames: unknown[];
  games: unknown[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type CachedGamesCatalogResponse = Omit<GamesCatalogResponse, "featuredGames">;

function isAdminRole(role: string | null | undefined) {
  return role === "admin" || role === "super_admin";
}

function shuffleRows<T>(rows: T[]) {
  const shuffled = [...rows];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const currentRow = shuffled[index];
    const swapRow = shuffled[swapIndex];
    if (currentRow === undefined || swapRow === undefined) continue;
    shuffled[index] = swapRow;
    shuffled[swapIndex] = currentRow;
  }
  return shuffled;
}

async function getUserRole(service: SupabaseServiceLike | null, userId: string) {
  if (!service) return null;

  const { data, error } = await service
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<ProfileRole>();

  if (error) throw error;
  return data?.role || null;
}

export async function registerCatalogRoutes(
  app: FastifyInstance,
  options: CatalogRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const gamesCatalogCache = new TtlCache<CachedGamesCatalogResponse>(60_000);

  const fetchFeaturedGames = async (timings: TimingFields) => {
    const { data, error } = await timed(
      timings,
      "featured_games_query_ms",
      () =>
        service!
          .from("games")
          .select("id,title,cover_url,backdrop_url,play_count")
          .order("play_count", { ascending: false })
          .limit(100),
    );

    if (error) {
      throw error;
    }

    const featuredPool = data || [];
    if (featuredPool.length === 0) return [];

    const hasAnyPlays = featuredPool.some(
      (game) =>
        typeof game.play_count === "number" && game.play_count > 0,
    );

    return (hasAnyPlays ? featuredPool : shuffleRows(featuredPool)).slice(
      0,
      hasAnyPlays ? FEATURED_GAME_LIMIT : ZERO_PLAY_FEATURED_POOL_LIMIT,
    );
  };

  app.get("/games", async (request, reply) => {
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const query = gamesQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: "Invalid games query" });
    }

    const { page, pageSize, search } = query.data;
    const timings = {};
    const cacheKey = JSON.stringify({
      page,
      pageSize,
      search: search?.toLowerCase() || "",
    });
    const cachedResponse = gamesCatalogCache.get(cacheKey);
    if (cachedResponse) {
      let featuredGames: unknown[] = [];
      try {
        featuredGames = await fetchFeaturedGames(timings);
      } catch (err) {
        request.log.warn({ err }, "Failed to load featured games");
      }

      reply.header("Cache-Control", "public, max-age=30, s-maxage=60");
      reply.header("X-Pixelated-Cache", "HIT");
      logTiming(request.log, "Games catalog timing", timings, {
        cache: "hit",
        page,
        pageSize,
        resultCount: cachedResponse.games.length,
        search: Boolean(search),
        total: cachedResponse.total,
      });
      return {
        ...cachedResponse,
        featuredGames,
      };
    }

    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    let gamesQuery = service
      .from("games")
      .select("*", { count: "exact" })
      .order("title");

    if (search) {
      gamesQuery = gamesQuery.ilike("title", `%${search}%`);
    }

    const { data, count, error } = await timed(
      timings,
      "games_query_ms",
      () => gamesQuery.range(start, end),
    );

    if (error) {
      request.log.error({ err: error }, "Failed to load games");
      return reply.status(500).send({ error: "Failed to load games" });
    }

    let featuredGames: unknown[] = [];
    try {
      featuredGames = await fetchFeaturedGames(timings);
    } catch (err) {
      request.log.warn({ err }, "Failed to load featured games");
    }

    const total = count || 0;
    const response = {
      featuredGames,
      games: data || [],
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };

    gamesCatalogCache.set(cacheKey, {
      games: response.games,
      page: response.page,
      pageSize: response.pageSize,
      total: response.total,
      totalPages: response.totalPages,
    });
    reply.header("Cache-Control", "public, max-age=30, s-maxage=60");
    reply.header("X-Pixelated-Cache", "MISS");
    logTiming(request.log, "Games catalog timing", timings, {
      cache: "miss",
      page,
      pageSize,
      resultCount: data?.length || 0,
      search: Boolean(search),
      total,
    });

    return response;
  });

  app.get("/games/featured", async (request, reply) => {
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const timings = {};
    let featuredGames: unknown[] = [];
    try {
      featuredGames = await fetchFeaturedGames(timings);
    } catch (err) {
      request.log.warn({ err }, "Failed to load featured games");
    }

    reply.header("Cache-Control", "no-store");
    logTiming(request.log, "Featured games timing", timings, {
      resultCount: featuredGames.length,
    });

    return { featuredGames };
  });

  app.get("/games/:gameId", async (request, reply) => {
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const params = gameParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "Invalid game id" });
    }

    const { data, error } = await service
      .from("games")
      .select("id,title,author_name,rom_url,rom_filename,cover_url,backdrop_url,play_count")
      .eq("id", params.data.gameId)
      .maybeSingle();

    if (error) {
      request.log.error({ err: error }, "Failed to load game");
      return reply.status(500).send({ error: "Failed to load game" });
    }

    if (!data) {
      return reply.status(404).send({ error: "Game not found" });
    }

    return { game: data };
  });

  app.get(
    "/favorites",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const { data, error } = await service
        .from("favorites")
        .select("game_id,games(id,title,cover_url)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        request.log.error({ err: error }, "Failed to load favorites");
        return reply.status(500).send({ error: "Failed to load favorites" });
      }

      return {
        favorites: (data || [])
          .map((row) => row.games)
          .filter(Boolean),
      };
    },
  );

  app.get(
    "/favorites/:gameId",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = gameParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "Invalid game id" });
      }

      const { data, error } = await service
        .from("favorites")
        .select("game_id")
        .eq("user_id", user.id)
        .eq("game_id", params.data.gameId)
        .maybeSingle();

      if (error) {
        request.log.error({ err: error }, "Failed to load favorite");
        return reply.status(500).send({ error: "Failed to load favorite" });
      }

      return { favorited: Boolean(data) };
    },
  );

  app.put(
    "/favorites/:gameId",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = gameParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "Invalid game id" });
      }

      const { error } = await service
        .from("favorites")
        .upsert({ game_id: params.data.gameId, user_id: user.id });

      if (error) {
        request.log.error({ err: error }, "Failed to save favorite");
        return reply.status(500).send({ error: "Failed to save favorite" });
      }

      return { favorited: true };
    },
  );

  app.delete(
    "/favorites/:gameId",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = gameParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "Invalid game id" });
      }

      await service
        .from("favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("game_id", params.data.gameId);

      return reply.status(204).send();
    },
  );

  app.get("/games/:gameId/reactions", async (request, reply) => {
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const params = gameParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "Invalid game id" });
    }

    const { data, error } = await service
      .from("likes")
      .select("user_id,is_like")
      .eq("game_id", params.data.gameId);

    if (error) {
      request.log.error({ err: error }, "Failed to load reactions");
      return reply.status(500).send({ error: "Failed to load reactions" });
    }

    return { reactions: data || [] };
  });

  app.put(
    "/games/:gameId/reaction",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = gameParamsSchema.safeParse(request.params);
      const body = reactionBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid reaction" });
      }

      await service
        .from("likes")
        .delete()
        .eq("user_id", user.id)
        .eq("game_id", params.data.gameId);

      if (body.data.isLike !== null) {
        const { error } = await service.from("likes").insert({
          game_id: params.data.gameId,
          is_like: body.data.isLike,
          user_id: user.id,
        });
        if (error) {
          request.log.error({ err: error }, "Failed to save reaction");
          return reply.status(500).send({ error: "Failed to save reaction" });
        }
      }

      return { success: true };
    },
  );

  app.get("/games/:gameId/comments", async (request, reply) => {
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const params = gameParamsSchema.safeParse(request.params);
    const query = commentsQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.status(400).send({ error: "Invalid comments request" });
    }

    const start = query.data.page * 10;
    const end = start + 10;
    const { data, error } = await service
      .from("comments")
      .select(
        "id,content,created_at,user_id,profiles(username,avatar_url),comment_likes(user_id,is_like)",
      )
      .eq("game_id", params.data.gameId)
      .order("created_at", { ascending: false })
      .range(start, end);

    if (error) {
      request.log.error({ err: error }, "Failed to load comments");
      return reply.status(500).send({ error: "Failed to load comments" });
    }

    return {
      comments: (data || []).slice(0, 10),
      hasMore: (data || []).length > 10,
    };
  });

  app.post(
    "/games/:gameId/comments",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = gameParamsSchema.safeParse(request.params);
      const body = commentBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid comment" });
      }

      const { error } = await service.from("comments").insert({
        content: body.data.content,
        game_id: params.data.gameId,
        user_id: user.id,
      });

      if (error) {
        request.log.error({ err: error }, "Failed to post comment");
        return reply.status(500).send({ error: "Failed to post comment" });
      }

      return reply.status(201).send({ success: true });
    },
  );

  app.delete(
    "/comments/:commentId",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = commentParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "Invalid comment id" });
      }

      const role = await getUserRole(service, user.id);
      let query = service
        .from("comments")
        .delete()
        .eq("id", params.data.commentId);
      if (!isAdminRole(role)) {
        query = query.eq("user_id", user.id);
      }
      await query;

      return reply.status(204).send();
    },
  );

  app.put(
    "/comments/:commentId/reaction",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = commentParamsSchema.safeParse(request.params);
      const body = reactionBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid comment reaction" });
      }

      const { data: comment } = await service
        .from("comments")
        .select("user_id")
        .eq("id", params.data.commentId)
        .maybeSingle<{ user_id: string | null }>();
      if (!comment || comment.user_id === user.id) {
        return reply.status(403).send({ error: "Cannot react to this comment" });
      }

      await service
        .from("comment_likes")
        .delete()
        .eq("user_id", user.id)
        .eq("comment_id", params.data.commentId);
      if (body.data.isLike !== null) {
        await service.from("comment_likes").insert({
          comment_id: params.data.commentId,
          is_like: body.data.isLike,
          user_id: user.id,
        });
      }

      const { data } = await service
        .from("comment_likes")
        .select("user_id,is_like")
        .eq("comment_id", params.data.commentId);

      return { reactions: data || [] };
    },
  );
}
