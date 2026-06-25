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
const candidateParamsSchema = z.object({ candidateId: z.string().uuid() });
const candidateReviewBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("promote"),
    notes: z.string().trim().max(2000).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    notes: z.string().trim().min(1).max(2000),
  }),
]);

type SupabaseServiceLike = NonNullable<typeof supabaseService>;
type CandidateRow = {
  artifact_filename: string;
  artifact_sha256: string;
  artifact_size: number;
  artifact_url: string;
  asset_license_spdx: string | null;
  attribution_text: string;
  code_license_spdx: string;
  cover_license_spdx: string | null;
  developer_name: string | null;
  developer_url: string | null;
  id: string;
  import_status: string;
  license_url: string | null;
  original_release_url: string | null;
  platform_id: string;
  review_notes: string | null;
  runtime_id: string;
  runtime_kind: "libretro" | "native_linux";
  source_commit: string;
  source_entry_path: string;
  source_repo_url: string;
  title: string;
};
type GameRow = { id: string };
type GameBuildRow = { id: string };
type GameRightsRow = { id: string };

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

async function requireAdminRole(
  service: SupabaseServiceLike,
  userId: string,
) {
  const roleLookup = await getCachedUserRole(service, userId);
  if (roleLookup.error) throw roleLookup.error;
  return {
    cache: roleLookup.cache,
    ok: ["admin", "super_admin"].includes(roleLookup.role || ""),
  };
}

async function promoteCandidate(
  service: SupabaseServiceLike,
  candidate: CandidateRow,
  reviewerId: string,
  notes: string | null,
) {
  const now = new Date().toISOString();

  const { data: existingGame, error: existingGameError } = await service
    .from("games")
    .select("id")
    .eq("rom_filename", candidate.artifact_filename)
    .maybeSingle<GameRow>();
  if (existingGameError) throw existingGameError;

  const gamePayload = {
    author_name: candidate.developer_name || candidate.title,
    developer_name: candidate.developer_name,
    developer_url: candidate.developer_url,
    publication_status: "published",
    rom_filename: candidate.artifact_filename,
    rom_url: candidate.artifact_url,
    title: candidate.title,
  };

  let game = existingGame;
  if (game) {
    const { data, error } = await service
      .from("games")
      .update(gamePayload)
      .eq("id", game.id)
      .select("id")
      .single<GameRow>();
    if (error) throw error;
    game = data;
  } else {
    const { data, error } = await service
      .from("games")
      .insert({
        ...gamePayload,
        backdrop_url: null,
        cover_url: null,
      })
      .select("id")
      .single<GameRow>();
    if (error) throw error;
    game = data;
  }

  const { data: existingBuild, error: existingBuildError } = await service
    .from("game_builds")
    .select("id")
    .eq("game_id", game.id)
    .eq("runtime_id", candidate.runtime_id)
    .eq("platform_id", candidate.platform_id)
    .maybeSingle<GameBuildRow>();
  if (existingBuildError) throw existingBuildError;

  const buildPayload = {
    artifact_filename: candidate.artifact_filename,
    artifact_sha256: candidate.artifact_sha256,
    artifact_size: candidate.artifact_size,
    artifact_url: candidate.artifact_url,
    enabled: true,
    game_id: game.id,
    platform_id: candidate.platform_id,
    runtime_id: candidate.runtime_id,
    runtime_kind: candidate.runtime_kind,
  };

  let build = existingBuild;
  if (build) {
    const { data, error } = await service
      .from("game_builds")
      .update(buildPayload)
      .eq("id", build.id)
      .select("id")
      .single<GameBuildRow>();
    if (error) throw error;
    build = data;
  } else {
    const { data, error } = await service
      .from("game_builds")
      .insert(buildPayload)
      .select("id")
      .single<GameBuildRow>();
    if (error) throw error;
    build = data;
  }

  const { data: existingRights, error: existingRightsError } = await service
    .from("game_rights")
    .select("id")
    .eq("game_id", game.id)
    .eq("game_build_id", build.id)
    .maybeSingle<GameRightsRow>();
  if (existingRightsError) throw existingRightsError;

  const rightsPayload = {
    asset_license_spdx: candidate.asset_license_spdx || candidate.code_license_spdx,
    attribution_text: candidate.attribution_text,
    code_license_spdx: candidate.code_license_spdx,
    cover_license_spdx: candidate.cover_license_spdx,
    game_build_id: build.id,
    game_id: game.id,
    license_url: candidate.license_url,
    modification_allowed: true,
    original_release_url: candidate.original_release_url,
    review_notes: notes || candidate.review_notes,
    source_url: `${candidate.source_repo_url}/blob/${candidate.source_commit}/${candidate.source_entry_path}`,
    verified_at: now,
    verified_by: reviewerId,
  };

  if (existingRights) {
    const { error } = await service
      .from("game_rights")
      .update(rightsPayload)
      .eq("id", existingRights.id);
    if (error) throw error;
  } else {
    const { error } = await service.from("game_rights").insert(rightsPayload);
    if (error) throw error;
  }

  const { data: promotedCandidate, error: candidateError } = await service
    .from("catalog_ingestion_candidates")
    .update({
      import_status: "promoted",
      promoted_build_id: build.id,
      promoted_game_id: game.id,
      review_notes: notes || candidate.review_notes,
      reviewed_at: now,
      reviewed_by: reviewerId,
      updated_at: now,
    })
    .eq("id", candidate.id)
    .select(CANDIDATE_COLUMNS)
    .single<CandidateRow>();
  if (candidateError) throw candidateError;

  return { build, candidate: promotedCandidate, game };
}

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
      let roleLookup: Awaited<ReturnType<typeof requireAdminRole>>;
      try {
        roleLookup = await timed(timings, "admin_role_check_ms", () =>
          requireAdminRole(service, user.id),
        );
      } catch (err) {
        request.log.error(
          { err },
          "Failed to authorize catalog candidates",
        );
        return reply.status(500).send({ error: "Failed to authorize candidates" });
      }
      if (!roleLookup.ok) {
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

  app.patch(
    "/admin/catalog-candidates/:candidateId",
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

      const params = candidateParamsSchema.safeParse(request.params);
      const body = candidateReviewBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid candidate review" });
      }

      try {
        const role = await requireAdminRole(service, user.id);
        if (!role.ok) {
          return reply.status(403).send({ error: "Admin access required" });
        }

        const { data: candidate, error: candidateError } = await service
          .from("catalog_ingestion_candidates")
          .select(CANDIDATE_COLUMNS)
          .eq("id", params.data.candidateId)
          .maybeSingle<CandidateRow>();
        if (candidateError) throw candidateError;
        if (!candidate) {
          return reply.status(404).send({ error: "Candidate not found" });
        }
        if (candidate.import_status === "promoted") {
          return reply.status(409).send({ error: "Candidate already promoted" });
        }

        const now = new Date().toISOString();
        if (body.data.action === "reject") {
          const { data, error } = await service
            .from("catalog_ingestion_candidates")
            .update({
              import_status: "rejected",
              review_notes: body.data.notes,
              reviewed_at: now,
              reviewed_by: user.id,
              updated_at: now,
            })
            .eq("id", candidate.id)
            .select(CANDIDATE_COLUMNS)
            .single<CandidateRow>();
          if (error) throw error;
          return { candidate: data };
        }

        const promoted = await promoteCandidate(
          service,
          candidate,
          user.id,
          body.data.notes || null,
        );
        return promoted;
      } catch (err) {
        request.log.error({ err }, "Failed to review catalog candidate");
        return reply.status(500).send({ error: "Failed to review candidate" });
      }
    },
  );
}
