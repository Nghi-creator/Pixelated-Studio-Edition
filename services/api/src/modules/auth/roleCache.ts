import type { PostgrestError } from "@supabase/supabase-js";
import { TtlCache } from "../cache/ttlCache.js";
import { supabaseService } from "./supabaseAuth.js";

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type ProfileRole = {
  role: string | null;
};

type RoleLookupResult = {
  cache: "hit" | "miss";
  error: PostgrestError | null;
  role: string | null;
};

const roleCache = new TtlCache<string | null>(45_000);

export async function getCachedUserRole(
  service: SupabaseServiceLike,
  userId: string,
): Promise<RoleLookupResult> {
  if (roleCache.has(userId)) {
    return { cache: "hit", error: null, role: roleCache.get(userId) };
  }

  const { data, error } = await service
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<ProfileRole>();

  if (error) {
    return { cache: "miss", error, role: null };
  }

  const role = data?.role || null;
  roleCache.set(userId, role);
  return { cache: "miss", error: null, role };
}

export function clearCachedUserRole(userId: string) {
  roleCache.delete(userId);
}
