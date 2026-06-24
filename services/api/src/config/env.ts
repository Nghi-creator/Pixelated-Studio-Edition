import "dotenv/config";
import { z } from "zod";

const blankToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
};

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.preprocess(blankToUndefined, z.string().optional()),
  PORT: z.coerce.number().int().positive().default(4000),
  CONTROL_PLANE_CLEANUP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1000),
  STREAM_METRIC_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  STUN_URLS: z.string().default("stun:stun.l.google.com:19302"),
  TURN_CREDENTIAL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  TURN_SHARED_SECRET: z.preprocess(blankToUndefined, z.string().optional()),
  TURN_STATIC_CREDENTIAL: z.preprocess(blankToUndefined, z.string().optional()),
  TURN_STATIC_USERNAME: z.preprocess(blankToUndefined, z.string().optional()),
  TURN_URLS: z.preprocess(blankToUndefined, z.string().optional()),
  FORMSPREE_SUBMISSION_URL: z.preprocess(
    blankToUndefined,
    z.string().url().optional(),
  ),
  GLOBAL_RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(600),
  HEALTH_RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(120),
  PUBLIC_READ_RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(180),
  RATE_LIMIT_REDIS_REST_TOKEN: z.preprocess(blankToUndefined, z.string().optional()),
  RATE_LIMIT_REDIS_REST_URL: z.preprocess(
    blankToUndefined,
    z.string().url().optional(),
  ),
  RATE_LIMIT_REDIS_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(10_000)
    .default(1_000),
  SUPABASE_ANON_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  SUPABASE_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
});

function normalizeOrigin(origin: string) {
  const trimmed = origin.trim();
  if (!trimmed) return "";

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid API environment:", parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://pixelated-studio-edition.vercel.app",
];

export const env = {
  ...parsedEnv.data,
  HOST:
    parsedEnv.data.HOST ||
    (parsedEnv.data.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  allowedOrigins: Array.from(
    new Set([
      ...defaultAllowedOrigins.map(normalizeOrigin),
      ...parsedEnv.data.WEB_ORIGIN.split(",")
        .map(normalizeOrigin)
        .filter(Boolean),
    ]),
  ),
  trustProxy: parsedEnv.data.NODE_ENV === "production",
};

export const sharedRateLimitStoreConfigured = Boolean(
  env.RATE_LIMIT_REDIS_REST_URL && env.RATE_LIMIT_REDIS_REST_TOKEN,
);
