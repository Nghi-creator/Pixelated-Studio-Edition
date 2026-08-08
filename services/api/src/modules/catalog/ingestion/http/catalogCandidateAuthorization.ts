import { getAuthoritativeUserRole } from "../../../auth/infrastructure/roleAuthorization.js";
import type { SupabaseServiceLike } from "../infrastructure/supabaseCandidatePromotion.js";

export async function requireCatalogAdminRole(
  service: SupabaseServiceLike,
  userId: string,
) {
  const roleLookup = await getAuthoritativeUserRole(service, userId);
  if (roleLookup.error) throw roleLookup.error;
  return {
    ok: ["admin", "super_admin"].includes(roleLookup.role || ""),
  };
}
