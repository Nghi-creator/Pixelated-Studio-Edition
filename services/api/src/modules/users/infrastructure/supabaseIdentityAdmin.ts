import type { SupabaseService } from "../../auth/infrastructure/supabaseClients.js";

export async function deleteSupabaseIdentity(
  service: SupabaseService,
  userId: string,
) {
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) throw error;
}

export async function beginSupabaseAccountDeletion(service: SupabaseService, userId: string) {
  const { error } = await service.rpc("begin_account_deletion", { p_user_id: userId });
  if (error) throw error;
}
