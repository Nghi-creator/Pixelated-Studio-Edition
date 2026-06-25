import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getCachedUserRole } from "../../modules/auth/roleCache.js";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../modules/auth/supabaseAuth.js";
import { logTiming, timed } from "../../modules/observability/timing.js";

const candidateQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  platformId: z.enum(["nes", "gb", "gbc", "gba"]).optional(),
  search: z.string().trim().max(120).optional(),
  sourceKind: z
    .enum(["homebrew_hub_gb", "homebrew_hub_gba", "homebrew_hub_nes"])
    .optional(),
  status: z
    .enum(["needs_review", "approved", "rejected", "promoted"])
    .default("needs_review"),
});

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type CatalogCandidateRouteOptions = {
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

const CANDIDATE_COLUMNS = [
  "id",
  "source_kind",
  "source_repo_url",
  "source_commit",
  "source_entry_path",
  "title",
  "developer_name",
  "developer_url",
  "runtime_kind",
  "runtime_id",
  "platform_id",
  "artifact_url",
  "artifact_filename",
  "artifact_size",
  "artifact_sha256",
  "code_license_spdx",
  "asset_license_spdx",
  "cover_license_spdx",
  "license_url",
  "original_release_url",
  "attribution_text",
  "rights_warnings",
  "import_status",
  "review_notes",
  "promoted_game_id",
  "promoted_build_id",
  "first_seen_at",
  "last_seen_at",
].join(",");

export async function registerCatalogCandidateRoutes(
  app: FastifyInstance,
  options: CatalogCandidateRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;

  app.get(
    "/admin/catalog-candidates",
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

      const timings = {};
      const roleLookup = await timed(
        timings,
        "admin_role_check_ms",
        () => getCachedUserRole(service, user.id),
      );
      if (roleLookup.error) {
        request.log.error(
          { err: roleLookup.error },
          "Failed to authorize catalog candidates",
        );
        return reply.status(500).send({ error: "Failed to authorize candidates" });
      }
      if (!["admin", "super_admin"].includes(roleLookup.role || "")) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const parsedQuery = candidateQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({ error: "Invalid candidate query" });
      }

      const { page, pageSize, platformId, search, sourceKind, status } =
        parsedQuery.data;
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;

      let query = service
        .from("catalog_ingestion_candidates")
        .select(CANDIDATE_COLUMNS, { count: "exact" })
        .eq("import_status", status)
        .order("last_seen_at", { ascending: false })
        .range(start, end);

      if (platformId) query = query.eq("platform_id", platformId);
      if (sourceKind) query = query.eq("source_kind", sourceKind);
      if (search) query = query.ilike("title", `%${search}%`);

      const { count, data, error } = await timed(
        timings,
        "catalog_candidates_query_ms",
        () => query,
      );
      if (error) {
        request.log.error({ err: error }, "Failed to load catalog candidates");
        return reply.status(500).send({ error: "Failed to load candidates" });
      }

      const total = count || 0;
      logTiming(request.log, "Catalog candidates timing", timings, {
        page,
        pageSize,
        platformId,
        resultCount: data?.length || 0,
        roleCache: roleLookup.cache,
        search: Boolean(search),
        sourceKind,
        status,
        total,
      });

      return {
        candidates: data || [],
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  );
}
