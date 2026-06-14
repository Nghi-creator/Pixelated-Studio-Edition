import type { FastifyReply } from "fastify";

type RateLimitResult = {
  allowed: boolean;
  resetAt: number;
};

export function rejectRateLimitedRequest(
  reply: FastifyReply,
  result: RateLimitResult,
  error: string,
) {
  if (result.allowed) return false;

  reply.header(
    "Retry-After",
    Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)),
  );
  reply.status(429).send({ error });
  return true;
}
