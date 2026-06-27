import crypto from "node:crypto";
import path from "node:path";
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
  platformId: z
    .enum([
      "nes",
      "gb",
      "gbc",
      "gba",
      "snes",
      "genesis",
      "sms",
      "game_gear",
      "linux",
    ])
    .optional(),
  search: z.string().trim().max(120).optional(),
  sourceKind: z
    .enum([
      "homebrew_hub_gb",
      "homebrew_hub_gba",
      "homebrew_hub_nes",
      "debian_main_games",
      "curated_licensed_rom",
    ])
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
  artifact_filename: string | null;
  artifact_sha256: string | null;
  artifact_size: number | null;
  artifact_url: string | null;
  asset_license_spdx: string | null;
  attribution_text: string;
  code_license_spdx: string;
  cover_license_spdx: string | null;
  developer_name: string | null;
  developer_url: string | null;
  id: string;
  import_status: string;
  launch_manifest_id: string | null;
  license_url: string | null;
  original_release_url: string | null;
  package_component: string | null;
  package_name: string | null;
  package_version: string | null;
  platform_id: string;
  review_notes: string | null;
  runtime_id: string;
  runtime_kind: "libretro" | "native_linux";
  source_kind: string;
  source_commit: string;
  source_entry_path: string;
  source_repo_url: string;
  title: string;
};
type GameRow = { id: string };
type GameBuildRow = { id: string };
type GameRightsRow = { id: string };

type CatalogCandidateRouteOptions = {
  fetchArtifact?: typeof fetch;
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

class CandidateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandidateValidationError";
  }
}

const LIBRETRO_CANDIDATE_RULES = [
  { extensions: [".nes"], platformId: "nes", runtimeId: "mesen" },
  { extensions: [".gb"], platformId: "gb", runtimeId: "mgba" },
  { extensions: [".gbc"], platformId: "gbc", runtimeId: "mgba" },
  { extensions: [".gba"], platformId: "gba", runtimeId: "mgba" },
  { extensions: [".sfc", ".smc"], platformId: "snes", runtimeId: "bsnes" },
  {
    extensions: [".md", ".gen"],
    platformId: "genesis",
    runtimeId: "picodrive",
  },
  { extensions: [".sms"], platformId: "sms", runtimeId: "picodrive" },
  { extensions: [".gg"], platformId: "game_gear", runtimeId: "picodrive" },
];

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
  "launch_manifest_id",
  "package_name",
  "package_version",
  "package_component",
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
const ALLOWED_ARTIFACT_HOSTS = new Set(["raw.githubusercontent.com"]);

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

function sanitizeObjectSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "artifact";
}

function sha256(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function candidateArtifactRoot(candidate: CandidateRow) {
  if (candidate.source_kind === "curated_licensed_rom") return "curated-roms";
  if (candidate.source_kind === "debian_main_games") return "debian-main";
  return "homebrew-hub";
}

function assertCandidateRuntimeAllowed(candidate: CandidateRow) {
  if (candidate.runtime_kind === "native_linux") {
    if (
      candidate.runtime_id !== "debian-native-v1" ||
      candidate.platform_id !== "linux" ||
      !candidate.launch_manifest_id
    ) {
      throw new CandidateValidationError(
        "Candidate native runtime/platform is not allowlisted.",
      );
    }
    return;
  }

  if (!candidate.artifact_filename) {
    throw new CandidateValidationError("Candidate is missing an artifact filename.");
  }

  const rule = LIBRETRO_CANDIDATE_RULES.find(
    (entry) =>
      entry.runtimeId === candidate.runtime_id &&
      entry.platformId === candidate.platform_id,
  );
  if (!rule) {
    throw new CandidateValidationError(
      "Candidate libretro runtime/platform is not allowlisted.",
    );
  }

  const extension = path.extname(candidate.artifact_filename).toLowerCase();
  if (!rule.extensions.includes(extension)) {
    throw new CandidateValidationError(
      `Candidate artifact extension ${extension || "(none)"} is not allowlisted for ${candidate.platform_id}/${candidate.runtime_id}.`,
    );
  }
}

function assertAllowedArtifactUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Candidate artifact URL is invalid.");
  }

  if (url.protocol !== "https:" || !ALLOWED_ARTIFACT_HOSTS.has(url.hostname)) {
    throw new Error("Candidate artifact URL host is not allowed.");
  }
}

async function mirrorCandidateArtifact(
  service: SupabaseServiceLike,
  candidate: CandidateRow,
  fetchArtifact: typeof fetch,
) {
  if (
    !candidate.artifact_url ||
    !candidate.artifact_filename ||
    !candidate.artifact_size ||
    !candidate.artifact_sha256
  ) {
    throw new Error("Candidate is missing artifact metadata.");
  }

  assertAllowedArtifactUrl(candidate.artifact_url);
  const response = await fetchArtifact(candidate.artifact_url);
  if (!response.ok) {
    throw new Error(`Failed to fetch candidate artifact: ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== candidate.artifact_size) {
    throw new Error(
      `Candidate artifact size mismatch. Expected ${candidate.artifact_size}, received ${bytes.length}.`,
    );
  }

  const actualSha256 = sha256(bytes);
  if (actualSha256 !== candidate.artifact_sha256) {
    throw new Error("Candidate artifact checksum mismatch.");
  }

  const objectPath = [
    candidateArtifactRoot(candidate),
    sanitizeObjectSegment(candidate.source_commit),
    sanitizeObjectSegment(candidate.platform_id),
    `${candidate.artifact_sha256}-${sanitizeObjectSegment(candidate.artifact_filename)}`,
  ].join("/");

  const bucket = service.storage.from("catalog_artifacts");
  const { error: uploadError } = await bucket.upload(objectPath, bytes, {
    contentType: "application/octet-stream",
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data } = bucket.getPublicUrl(objectPath);
  if (!data.publicUrl) {
    throw new Error("Failed to resolve mirrored artifact public URL.");
  }

  return {
    objectPath,
    publicUrl: data.publicUrl,
  };
}

function escapeSvgText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function createGeneratedCover(
  service: SupabaseServiceLike,
  candidate: CandidateRow,
) {
  const platform = candidate.platform_id.toUpperCase();
  const title = escapeSvgText(candidate.title);
  const license = escapeSvgText(candidate.code_license_spdx);
  const subtitle =
    candidate.runtime_kind === "native_linux"
      ? "Reviewed Debian native package"
      : "Reviewed homebrew build";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" role="img" aria-labelledby="title desc">
  <title id="title">${title}</title>
  <desc id="desc">Generated Pixelated catalog cover for ${title}</desc>
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#2a111d"/>
      <stop offset="45%" stop-color="#5a263b"/>
      <stop offset="100%" stop-color="#d79aae"/>
    </linearGradient>
  </defs>
  <rect width="960" height="540" fill="url(#bg)"/>
  <rect x="48" y="48" width="864" height="444" rx="38" fill="rgba(42,17,29,0.62)" stroke="#e6abc0" stroke-width="4"/>
  <text x="92" y="150" fill="#f9eef3" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700" letter-spacing="4">${platform}</text>
  <text x="92" y="276" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="72" font-weight="800">${title}</text>
  <text x="92" y="366" fill="#f1c9d7" font-family="Inter, Arial, sans-serif" font-size="30">${subtitle}</text>
  <text x="92" y="424" fill="#e6abc0" font-family="Inter, Arial, sans-serif" font-size="24">License: ${license}</text>
  <circle cx="814" cy="138" r="44" fill="#e6abc0" opacity="0.9"/>
  <circle cx="864" cy="190" r="28" fill="#ffffff" opacity="0.72"/>
</svg>`;

  const objectPath = [
    "covers",
    sanitizeObjectSegment(candidate.source_commit),
    sanitizeObjectSegment(candidate.platform_id),
    `${sanitizeObjectSegment(
      candidate.artifact_sha256 ||
        candidate.launch_manifest_id ||
        candidate.id,
    )}.svg`,
  ].join("/");

  const bucket = service.storage.from("catalog_artifacts");
  const { error: uploadError } = await bucket.upload(
    objectPath,
    Buffer.from(svg),
    {
      contentType: "image/svg+xml",
      upsert: true,
    },
  );
  if (uploadError) throw uploadError;

  const { data } = bucket.getPublicUrl(objectPath);
  if (!data.publicUrl) {
    throw new Error("Failed to resolve generated cover public URL.");
  }

  return {
    objectPath,
    publicUrl: data.publicUrl,
  };
}

async function promoteCandidate(
  service: SupabaseServiceLike,
  candidate: CandidateRow,
  reviewerId: string,
  notes: string | null,
  fetchArtifact: typeof fetch,
) {
  const now = new Date().toISOString();
  assertCandidateRuntimeAllowed(candidate);
  const isNative = candidate.runtime_kind === "native_linux";
  const mirroredArtifact = isNative
    ? null
    : await mirrorCandidateArtifact(service, candidate, fetchArtifact);
  const generatedCover = await createGeneratedCover(service, candidate);
  const catalogFilename = isNative
    ? `${candidate.launch_manifest_id}-native`
    : candidate.artifact_filename;
  if (!catalogFilename) {
    throw new Error("Candidate is missing a catalog filename.");
  }

  const { data: existingGame, error: existingGameError } = await service
    .from("games")
    .select("id")
    .eq("rom_filename", catalogFilename)
    .maybeSingle<GameRow>();
  if (existingGameError) throw existingGameError;

  const gamePayload = {
    author_name: candidate.developer_name || candidate.title,
    developer_name: candidate.developer_name,
    developer_url: candidate.developer_url,
    backdrop_url: generatedCover.publicUrl,
    cover_url: generatedCover.publicUrl,
    publication_status: "published",
    rom_filename: catalogFilename,
    rom_url: mirroredArtifact?.publicUrl || null,
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
    artifact_filename: isNative ? null : candidate.artifact_filename,
    artifact_sha256: isNative ? null : candidate.artifact_sha256,
    artifact_size: isNative ? null : candidate.artifact_size,
    artifact_url: mirroredArtifact?.publicUrl || null,
    enabled: true,
    game_id: game.id,
    launch_manifest_id: isNative ? candidate.launch_manifest_id : null,
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
    cover_license_spdx: candidate.cover_license_spdx || "CC0-1.0",
    game_build_id: build.id,
    game_id: game.id,
    license_url: candidate.license_url,
    modification_allowed: true,
    original_release_url: candidate.original_release_url,
    review_notes: notes || candidate.review_notes,
    source_url: isNative
      ? candidate.source_repo_url
      : `${candidate.source_repo_url}/blob/${candidate.source_commit}/${candidate.source_entry_path}`,
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
      review_notes: [
        notes || candidate.review_notes,
        mirroredArtifact
          ? `Mirrored artifact path: catalog_artifacts/${mirroredArtifact.objectPath}`
          : null,
        `Generated cover path: catalog_artifacts/${generatedCover.objectPath}`,
      ].filter(Boolean).join("\n"),
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
  const fetchArtifact = options.fetchArtifact || fetch;

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
          fetchArtifact,
        );
        return promoted;
      } catch (err) {
        request.log.error({ err }, "Failed to review catalog candidate");
        if (err instanceof CandidateValidationError) {
          return reply.status(422).send({ error: err.message });
        }
        return reply.status(500).send({ error: "Failed to review candidate" });
      }
    },
  );
}
