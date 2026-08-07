import type { SupabaseService } from "../../auth/infrastructure/supabaseClients.js";

export async function deleteSupabaseIdentity(
  service: SupabaseService,
  userId: string,
) {
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) throw error;
}
