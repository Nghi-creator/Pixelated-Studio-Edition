import type { User } from "@supabase/supabase-js";

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
  }
}
