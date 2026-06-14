import type { FastifyInstance } from "fastify";
import {
  requireSupabaseUser,
  supabaseService,
} from "../auth/supabaseAuth.js";
import { TtlCache } from "../cache/ttlCache.js";
import {
  type CatalogService,
  fetchFeaturedGames,
  getCatalogCacheKey,
  getPageRange,
  getUserRole,
  isAdminRole,
} from "./catalogService.js";
import {
  type CachedGamesCatalogResponse,
  commentBodySchema,
  commentParamsSchema,
  commentsQuerySchema,
  gameParamsSchema,
  gamesQuerySchema,
  reactionBodySchema,
} from "./contracts.js";
import { searchAndRankGames } from "./catalogSearch.js";
import { logTiming, timed } from "../observability/timing.js";
import { rejectRateLimitedRequest } from "../security/rateLimitResponse.js";
import { createRateLimiter } from "../security/sharedRateLimiter.js";

type CatalogRouteOptions = {
  requireUser?: typeof requireSupabaseUser;
  supabase?: CatalogService | null;
};

const MAX_SEARCH_CANDIDATES = 1000;

export async function registerCatalogRoutes(
  app: FastifyInstance,
  options: CatalogRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const gamesCatalogCache = new TtlCache<CachedGamesCatalogResponse>(60_000);
  const commentWriteLimiter = createRateLimiter({
    limit: 10,
    namespace: "comment-write",
    windowMs: 60_000,
  });
  const reactionWriteLimiter = createRateLimiter({
    limit: 120,
    namespace: "reaction-write",
    windowMs: 60_000,
  });

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
    const cacheKey = getCatalogCacheKey(page, pageSize, search);
    const cachedResponse = gamesCatalogCache.get(cacheKey);
    if (cachedResponse) {
      let featuredGames: unknown[] = [];
      try {
        featuredGames = await fetchFeaturedGames(service, timings);
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

    const { end, start } = getPageRange(page, pageSize);

    let gamesQuery = service
      .from("games")
      .select("*", { count: "exact" })
      .order("title");

    if (search) {
      gamesQuery = service
        .from("games")
        .select("*")
        .order("title")
        .limit(MAX_SEARCH_CANDIDATES);
    }

    const { data, count, error } = await timed(
      timings,
      "games_query_ms",
      () => (search ? gamesQuery : gamesQuery.range(start, end)),
    );

    if (error) {
      request.log.error({ err: error }, "Failed to load games");
      return reply.status(500).send({ error: "Failed to load games" });
    }

    let featuredGames: unknown[] = [];
    try {
      featuredGames = await fetchFeaturedGames(service, timings);
    } catch (err) {
      request.log.warn({ err }, "Failed to load featured games");
    }

    const rankedGames = search
      ? searchAndRankGames(data || [], search)
      : data || [];
    const pagedGames = search ? rankedGames.slice(start, end + 1) : rankedGames;
    const total = search ? rankedGames.length : count || 0;
    const response = {
      featuredGames,
      games: pagedGames,
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
      resultCount: pagedGames.length,
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
      featuredGames = await fetchFeaturedGames(service, timings);
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

      const { error } = await service
        .from("favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("game_id", params.data.gameId);

      if (error) {
        request.log.error({ err: error }, "Failed to delete favorite");
        return reply.status(500).send({ error: "Failed to delete favorite" });
      }

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
      if (
        rejectRateLimitedRequest(
          reply,
          await reactionWriteLimiter.consume(user.id),
          "Reaction limit reached. Please try again shortly.",
        )
      ) {
        return;
      }

      const { error } = await service.rpc("set_game_reaction", {
        p_game_id: params.data.gameId,
        p_is_like: body.data.isLike,
        p_user_id: user.id,
      });
      if (error) {
        request.log.error({ err: error }, "Failed to save reaction");
        return reply.status(500).send({ error: "Failed to save reaction" });
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
      if (
        rejectRateLimitedRequest(
          reply,
          await commentWriteLimiter.consume(user.id),
          "Comment limit reached. Please try again shortly.",
        )
      ) {
        return;
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
      const { error } = await query;
      if (error) {
        request.log.error({ err: error }, "Failed to delete comment");
        return reply.status(500).send({ error: "Failed to delete comment" });
      }

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

      const { data: comment, error: commentError } = await service
        .from("comments")
        .select("user_id")
        .eq("id", params.data.commentId)
        .maybeSingle<{ user_id: string | null }>();
      if (commentError) {
        request.log.error({ err: commentError }, "Failed to load comment");
        return reply.status(500).send({ error: "Failed to save comment reaction" });
      }
      if (!comment || comment.user_id === user.id) {
        return reply.status(403).send({ error: "Cannot react to this comment" });
      }
      if (
        rejectRateLimitedRequest(
          reply,
          await reactionWriteLimiter.consume(user.id),
          "Reaction limit reached. Please try again shortly.",
        )
      ) {
        return;
      }

      const { error: reactionError } = await service.rpc("set_comment_reaction", {
        p_comment_id: params.data.commentId,
        p_is_like: body.data.isLike,
        p_user_id: user.id,
      });
      if (reactionError) {
        request.log.error(
          { err: reactionError },
          "Failed to save comment reaction",
        );
        return reply.status(500).send({ error: "Failed to save comment reaction" });
      }

      const { data, error: loadError } = await service
        .from("comment_likes")
        .select("user_id,is_like")
        .eq("comment_id", params.data.commentId);
      if (loadError) {
        request.log.error({ err: loadError }, "Failed to load comment reactions");
        return reply.status(500).send({ error: "Failed to load comment reactions" });
      }

      return { reactions: data || [] };
    },
  );
}
