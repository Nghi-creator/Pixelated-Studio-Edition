import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { env } from "../../../config/env.js";
import { requireSupabaseUser } from "../../auth/supabaseAuth.js";

type IceServer = {
  credential?: string;
  urls: string | string[];
  username?: string;
};

type WebRTCRouteOptions = {
  now?: () => Date;
  requireUser?: typeof requireSupabaseUser;
};

function splitUrls(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

function createTurnCredential(username: string, secret: string) {
  return crypto.createHmac("sha1", secret).update(username).digest("base64");
}

function buildIceServers(userId: string, now: Date): {
  expiresAt: string | null;
  iceServers: IceServer[];
} {
  const iceServers: IceServer[] = [];
  const stunUrls = splitUrls(env.STUN_URLS);
  const turnUrls = splitUrls(env.TURN_URLS);

  if (stunUrls.length > 0) {
    const urls = stunUrls.length === 1 ? stunUrls[0] : stunUrls;
    if (urls) iceServers.push({ urls });
  }

  if (turnUrls.length === 0) {
    return { expiresAt: null, iceServers };
  }

  if (env.TURN_SHARED_SECRET) {
    const expiresAtSeconds =
      Math.floor(now.getTime() / 1000) + env.TURN_CREDENTIAL_TTL_SECONDS;
    const username = `${expiresAtSeconds}:${userId}`;
    const urls = turnUrls.length === 1 ? turnUrls[0] : turnUrls;
    if (!urls) return { expiresAt: null, iceServers };
    iceServers.push({
      credential: createTurnCredential(username, env.TURN_SHARED_SECRET),
      urls,
      username,
    });
    return {
      expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
      iceServers,
    };
  }

  if (env.TURN_STATIC_USERNAME && env.TURN_STATIC_CREDENTIAL) {
    const urls = turnUrls.length === 1 ? turnUrls[0] : turnUrls;
    if (!urls) return { expiresAt: null, iceServers };
    iceServers.push({
      credential: env.TURN_STATIC_CREDENTIAL,
      urls,
      username: env.TURN_STATIC_USERNAME,
    });
  }

  return { expiresAt: null, iceServers };
}

export async function registerWebRTCRoutes(
  app: FastifyInstance,
  options: WebRTCRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const now = options.now || (() => new Date());

  app.get(
    "/webrtc/ice-servers",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }

      return {
        ...buildIceServers(user.id, now()),
        ttlSeconds: env.TURN_CREDENTIAL_TTL_SECONDS,
      };
    },
  );
}

export const testExports = {
  buildIceServers,
  createTurnCredential,
};
