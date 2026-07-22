import { z } from "zod";
import { env } from "../../../config/env.js";
import { createRateLimiter, type RateLimiter } from "../../security/sharedRateLimiter.js";
import { createSignedCatalogRomUrl } from "../domain/browserArtifact.js";
import {
  requireSupabaseUser,
  supabaseService,
} from "../supabaseAuth.js";
import type { SupabaseServiceLike } from "../services/backendSessions.js";

export const SESSION_TTL_MS = 15 * 60 * 1000;
export const sessionIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/).max(80);

export const createSessionBodySchema = z.object({
  clientEdition: z.enum(["studio", "user"]).default("studio"),
  clientSessionId: sessionIdSchema.optional(),
  gameId: z.string().uuid(),
  mode: z.enum(["cloud", "local"]).default("cloud"),
  runtimeKind: z.enum(["wasm", "webrtc", "native"]).default("webrtc"),
});

export type SessionRouteOptions = {
  artifactUrlLimiter?: RateLimiter;
  signCatalogRom?: (artifactUrl: string, expiresInSeconds: number) => Promise<string>;
  requireUser?: typeof requireSupabaseUser;
  sessionCreateLimiter?: RateLimiter;
  supabase?: SupabaseServiceLike | null;
};

export function createSessionRouteContext(options: SessionRouteOptions) {
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const artifactUrlLimiter = options.artifactUrlLimiter || createRateLimiter({
    limit: env.BROWSER_ARTIFACT_RATE_LIMIT_PER_MINUTE,
    namespace: "browser-artifact-user",
    windowMs: 60_000,
  });
  const signCatalogRom = options.signCatalogRom || (async (
    artifactUrl: string,
    expiresInSeconds: number,
  ) => {
    if (!service || !env.SUPABASE_URL) {
      throw new Error("Supabase artifact signing is not configured.");
    }
    return createSignedCatalogRomUrl({
      artifactUrl,
      expiresInSeconds,
      service,
      supabaseUrl: env.SUPABASE_URL,
    });
  });

  return {
    artifactUrlLimiter,
    requireUser: options.requireUser || requireSupabaseUser,
    service,
    sessionCreateLimiter: options.sessionCreateLimiter || createRateLimiter({
      limit: 60,
      namespace: "session-create-user",
      windowMs: 60_000,
    }),
    signCatalogRom,
    verificationIpLimiter: createRateLimiter({
      limit: 1_000,
      namespace: "session-verification-ip",
      windowMs: 60_000,
    }),
    verificationSessionLimiter: createRateLimiter({
      limit: 30,
      namespace: "session-verification-session",
      windowMs: 60_000,
    }),
  };
}

export type SessionRouteContext = ReturnType<typeof createSessionRouteContext>;
