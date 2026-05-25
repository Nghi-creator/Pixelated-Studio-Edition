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
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(4000),
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
  allowedOrigins: Array.from(
    new Set([
      ...defaultAllowedOrigins.map(normalizeOrigin),
      ...parsedEnv.data.WEB_ORIGIN.split(",")
        .map(normalizeOrigin)
        .filter(Boolean),
    ]),
  ),
};
