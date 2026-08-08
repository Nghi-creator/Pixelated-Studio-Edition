import { createClient } from "@supabase/supabase-js";
import { env } from "../../../config/env.js";

export function createSupabaseAnonClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;

  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

export function createSupabaseServiceClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export const supabaseAnon = createSupabaseAnonClient();
export const supabaseService = createSupabaseServiceClient();

export type SupabaseService = NonNullable<typeof supabaseService>;

export type BanLookupService = {
  from(table: "profiles"): {
    select(columns: "is_banned"): {
      eq(column: "id", userId: string): {
        maybeSingle<T>(): PromiseLike<{ data: T | null; error: unknown }>;
      };
    };
  };
};

export async function getAuthoritativeUserBanStatus(
  service: BanLookupService,
  userId: string,
) {
  const { data, error } = await service
    .from("profiles")
    .select("is_banned")
    .eq("id", userId)
    .maybeSingle<{ is_banned: boolean | null }>();

  if (error) throw error;
  return data?.is_banned === true;
}
