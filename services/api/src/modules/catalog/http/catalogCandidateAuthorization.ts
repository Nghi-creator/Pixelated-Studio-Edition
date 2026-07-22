import { getCachedUserRole } from "../../auth/roleCache.js";
import type { SupabaseServiceLike } from "../ingestion/catalogCandidatePromotion.js";

export async function requireCatalogAdminRole(
  service: SupabaseServiceLike,
  userId: string,
) {
  const roleLookup = await getCachedUserRole(service, userId);
  if (roleLookup.error) throw roleLookup.error;
  return {
    cache: roleLookup.cache,
    ok: ["admin", "super_admin"].includes(roleLookup.role || ""),
  };
}
