import type { PostgrestError } from "@supabase/supabase-js";
import { supabaseService } from "./supabaseClients.js";

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type ProfileRole = {
  role: string | null;
};

type RoleLookupResult = {
  error: PostgrestError | null;
  role: string | null;
};

/**
 * Privileged authorization must be read from shared database state for every
 * request. A process-local cache allows a demoted administrator to retain
 * access until every API instance expires or invalidates its own entry.
 */
export async function getAuthoritativeUserRole(
  service: SupabaseServiceLike,
  userId: string,
): Promise<RoleLookupResult> {
  const { data, error } = await service
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<ProfileRole>();

  if (error) {
    return { error, role: null };
  }

  return { error: null, role: data?.role || null };
}
