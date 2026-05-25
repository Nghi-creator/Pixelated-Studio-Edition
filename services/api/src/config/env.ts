import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(4000),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
});

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
      ...defaultAllowedOrigins,
      ...parsedEnv.data.WEB_ORIGIN.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ]),
  ),
};
