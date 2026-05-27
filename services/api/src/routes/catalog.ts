import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../modules/auth/supabaseAuth.js";

const gameParamsSchema = z.object({ gameId: z.string().min(1).max(200) });
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

type ProfileRole = {
  role: string | null;
};

function isAdminRole(role: string | null | undefined) {
  return role === "admin" || role === "super_admin";
}

async function getUserRole(userId: string) {
  if (!supabaseService) return null;

  const { data, error } = await supabaseService
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<ProfileRole>();

  if (error) throw error;
  return data?.role || null;
}

export async function registerCatalogRoutes(app: FastifyInstance) {
  app.get("/games", async (request, reply) => {
    if (!supabaseService) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const { data, error } = await supabaseService
      .from("games")
      .select("*")
      .order("title");

    if (error) {
      request.log.error({ err: error }, "Failed to load games");
      return reply.status(500).send({ error: "Failed to load games" });
    }

    return { games: data || [] };
  });

  app.get("/games/:gameId", async (request, reply) => {
    if (!supabaseService) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const params = gameParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "Invalid game id" });
    }

    const { data, error } = await supabaseService
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
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!supabaseService) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const { data, error } = await supabaseService
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
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!supabaseService) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = gameParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "Invalid game id" });
      }

      const { data, error } = await supabaseService
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
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!supabaseService) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = gameParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "Invalid game id" });
      }

      const { error } = await supabaseService
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
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!supabaseService) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = gameParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "Invalid game id" });
      }

      await supabaseService
        .from("favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("game_id", params.data.gameId);

      return reply.status(204).send();
    },
  );

  app.get("/games/:gameId/reactions", async (request, reply) => {
    if (!supabaseService) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const params = gameParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "Invalid game id" });
    }

    const { data, error } = await supabaseService
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
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!supabaseService) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = gameParamsSchema.safeParse(request.params);
      const body = reactionBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid reaction" });
      }

      await supabaseService
        .from("likes")
        .delete()
        .eq("user_id", user.id)
        .eq("game_id", params.data.gameId);

      if (body.data.isLike !== null) {
        const { error } = await supabaseService.from("likes").insert({
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
    if (!supabaseService) {
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
    const { data, error } = await supabaseService
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
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!supabaseService) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = gameParamsSchema.safeParse(request.params);
      const body = commentBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid comment" });
      }

      const { error } = await supabaseService.from("comments").insert({
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
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!supabaseService) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = commentParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "Invalid comment id" });
      }

      const role = await getUserRole(user.id);
      let query = supabaseService
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
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!supabaseService) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = commentParamsSchema.safeParse(request.params);
      const body = reactionBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid comment reaction" });
      }

      const { data: comment } = await supabaseService
        .from("comments")
        .select("user_id")
        .eq("id", params.data.commentId)
        .maybeSingle<{ user_id: string | null }>();
      if (!comment || comment.user_id === user.id) {
        return reply.status(403).send({ error: "Cannot react to this comment" });
      }

      await supabaseService
        .from("comment_likes")
        .delete()
        .eq("user_id", user.id)
        .eq("comment_id", params.data.commentId);
      if (body.data.isLike !== null) {
        await supabaseService.from("comment_likes").insert({
          comment_id: params.data.commentId,
          is_like: body.data.isLike,
          user_id: user.id,
        });
      }

      const { data } = await supabaseService
        .from("comment_likes")
        .select("user_id,is_like")
        .eq("comment_id", params.data.commentId);

      return { reactions: data || [] };
    },
  );
}
