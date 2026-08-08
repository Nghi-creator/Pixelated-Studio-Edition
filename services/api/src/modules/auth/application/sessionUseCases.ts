import { CandidateValidationError } from "../../catalog/ingestion/domain/catalogCandidateValidation.js";
import { getBrowserEligibility } from "../domain/browserArtifact.js";
import type { BackendSessionRow } from "../domain/backendSession.js";
import { assertBuildBootable, mapBoot } from "../domain/sessionBoot.js";
import {
  createSessionId,
  createSessionToken,
  hashSessionToken,
  sessionTokenMatches,
} from "../domain/sessionTokens.js";

type SessionBuild = {
  artifact_filename: string | null;
  artifact_sha256?: string | null;
  artifact_size?: number | null;
  artifact_url: string | null;
  launch_manifest_id?: string | null;
  platform_id: string;
  runtime_id: string;
  runtime_kind: "libretro" | "native_linux";
};

type SessionGame = { game_builds: SessionBuild[] };

export class SessionUseCaseError extends Error {
  constructor(
    readonly stage: "insert" | "load_game" | "sign_artifact" | "stop",
    override readonly cause: unknown,
  ) {
    super(`Session operation failed during ${stage}`);
  }
}

export function createCreateSession(dependencies: {
  authorizeArtifactSign(identity: string): Promise<{ allowed: boolean; resetAt: number }>;
  findGame(gameId: string): Promise<SessionGame | null>;
  findLiveSession(sessionId: string): Promise<BackendSessionRow | null>;
  insertSession(row: Record<string, unknown>): Promise<void>;
  now(): number;
  signCatalogRom(url: string, expiresInSeconds: number): Promise<string>;
}) {
  return async function createSession(input: {
    artifactUrlTtlSeconds: number;
    clientEdition: "studio" | "user";
    clientRuntimeKind: "wasm" | "webrtc" | "native";
    clientSessionId?: string;
    gameId: string;
    isAnonymousUser: boolean;
    mode: "cloud" | "local";
    rateLimitIdentity: string;
    sessionTtlMs: number;
    userId: string | null;
  }) {
    let game: SessionGame | null;
    try {
      game = await dependencies.findGame(input.gameId);
    } catch (error) {
      throw new SessionUseCaseError("load_game", error);
    }
    if (!game) return { status: "game_not_found" } as const;

    const build = game.game_builds[0];
    if (!build) return { status: "build_not_found" } as const;
    try {
      assertBuildBootable(build);
    } catch (error) {
      if (error instanceof CandidateValidationError) {
        return { error: error.message, status: "unbootable" } as const;
      }
      throw error;
    }

    const requestsBrowserArtifact =
      input.clientEdition === "user" &&
      input.clientRuntimeKind === "wasm" &&
      input.mode === "cloud";
    const browser = getBrowserEligibility(build);
    if (requestsBrowserArtifact && !browser.eligible) {
      return {
        error: browser.reason || "This build is not browser compatible.",
        status: "browser_ineligible",
      } as const;
    }

    const sessionId = createSessionId(input.clientSessionId);
    if (await dependencies.findLiveSession(sessionId)) {
      return { status: "active_conflict" } as const;
    }

    let signedArtifactUrl: string | null = null;
    let artifactUrlExpiresAt: string | null = null;
    if (build.artifact_url && (requestsBrowserArtifact || input.isAnonymousUser)) {
      const rateLimit = await dependencies.authorizeArtifactSign(input.rateLimitIdentity);
      if (!rateLimit.allowed) {
        return { rateLimit, status: "artifact_rate_limited" } as const;
      }
      try {
        signedArtifactUrl = await dependencies.signCatalogRom(
          build.artifact_url,
          input.artifactUrlTtlSeconds,
        );
        artifactUrlExpiresAt = new Date(
          dependencies.now() + input.artifactUrlTtlSeconds * 1000,
        ).toISOString();
      } catch (error) {
        throw new SessionUseCaseError("sign_artifact", error);
      }
    }

    const sessionToken = createSessionToken();
    const expiresAt = new Date(dependencies.now() + input.sessionTtlMs).toISOString();
    const storedBoot = {
      artifactSha256: build.artifact_sha256 || null,
      artifactSize: build.artifact_size || null,
      launchManifestId: build.launch_manifest_id || null,
      romFilename: build.artifact_filename || null,
      romUrl: build.artifact_url || null,
      runtimeId: build.runtime_id,
      runtimeKind: build.runtime_kind,
    };
    const boot = {
      ...storedBoot,
      browser: { ...browser, artifactUrlExpiresAt },
      romUrl: signedArtifactUrl || storedBoot.romUrl,
    };

    try {
      await dependencies.insertSession({
        boot_artifact_sha256: storedBoot.artifactSha256,
        boot_artifact_size: storedBoot.artifactSize,
        boot_launch_manifest_id: storedBoot.launchManifestId,
        boot_rom_filename: storedBoot.romFilename,
        boot_rom_url: storedBoot.romUrl,
        boot_runtime_id: storedBoot.runtimeId,
        browser_core_id: requestsBrowserArtifact ? browser.coreId : null,
        browser_system_id: requestsBrowserArtifact ? browser.systemId : null,
        client_edition: input.clientEdition,
        client_runtime_kind: input.clientRuntimeKind,
        deleted_at: null,
        expires_at: expiresAt,
        game_id: input.gameId,
        id: sessionId,
        mode: input.mode,
        session_token_hash: hashSessionToken(sessionToken),
        user_id: input.userId,
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return { status: "id_conflict" } as const;
      }
      throw new SessionUseCaseError("insert", error);
    }

    return { boot, expiresAt, sessionId, sessionToken, status: "created" } as const;
  };
}

export function createStopSession(dependencies: {
  findLiveSession(sessionId: string): Promise<BackendSessionRow | null>;
  stopSession(sessionId: string): Promise<void>;
}) {
  return async function stopSessionUseCase(input: {
    sessionId: string;
    sessionToken?: string;
    userId?: string;
  }) {
    const session = await dependencies.findLiveSession(input.sessionId);
    const ownedByUser = Boolean(input.userId && session?.user_id === input.userId);
    const authorizedByToken = Boolean(
      session &&
        input.sessionToken &&
        sessionTokenMatches(session.session_token_hash, input.sessionToken),
    );
    if (!session || (!ownedByUser && !authorizedByToken)) return;
    try {
      await dependencies.stopSession(input.sessionId);
    } catch (error) {
      throw new SessionUseCaseError("stop", error);
    }
  };
}

export function createGetOwnedSession(dependencies: {
  findLiveSession(sessionId: string): Promise<BackendSessionRow | null>;
}) {
  return async function getOwnedSession(sessionId: string, userId: string | undefined) {
    const session = await dependencies.findLiveSession(sessionId);
    return session?.user_id === userId ? session : null;
  };
}

export function createVerifySession(dependencies: {
  authorizeArtifactSign(identity: string): Promise<{ allowed: boolean; resetAt: number }>;
  findLiveSession(sessionId: string): Promise<BackendSessionRow | null>;
  isPrivateCatalogRomUrl(url: string): boolean;
  now(): number;
  signCatalogRom(url: string, expiresInSeconds: number): Promise<string>;
}) {
  return async function verifySession(input: {
    artifactUrlTtlSeconds: number;
    sessionId: string;
    sessionToken: string;
  }) {
    const session = await dependencies.findLiveSession(input.sessionId);
    if (!session || !sessionTokenMatches(session.session_token_hash, input.sessionToken)) {
      return { status: "invalid" } as const;
    }

    let romUrl = session.boot_rom_url;
    let artifactUrlExpiresAt: string | null = null;
    if (romUrl && dependencies.isPrivateCatalogRomUrl(romUrl)) {
      const rateLimit = await dependencies.authorizeArtifactSign(
        session.user_id || session.id,
      );
      if (!rateLimit.allowed) {
        return { rateLimit, status: "artifact_rate_limited" } as const;
      }
      try {
        romUrl = await dependencies.signCatalogRom(romUrl, input.artifactUrlTtlSeconds);
        artifactUrlExpiresAt = new Date(
          dependencies.now() + input.artifactUrlTtlSeconds * 1000,
        ).toISOString();
      } catch (error) {
        throw new SessionUseCaseError("sign_artifact", error);
      }
    }

    return {
      boot: mapBoot(session, { artifactUrlExpiresAt, romUrl }),
      session,
      status: "verified",
    } as const;
  };
}
