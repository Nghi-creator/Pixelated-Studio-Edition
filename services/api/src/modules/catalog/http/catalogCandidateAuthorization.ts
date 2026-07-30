import { getAuthoritativeUserRole } from "../../auth/roleAuthorization.js";
import type { SupabaseServiceLike } from "../ingestion/catalogCandidatePromotion.js";

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
