import type { SupabaseService } from "./supabaseClients.js";
import {
  DEFAULT_PROFILE_PERMISSIONS,
  type ProfilePermissions,
} from "../domain/permissions.js";

export async function findProfilePermissions(
  service: SupabaseService | null,
  userId: string,
): Promise<ProfilePermissions> {
  if (!service) return DEFAULT_PROFILE_PERMISSIONS;
  const { data, error } = await service
    .from("profiles")
    .select("username, email, avatar_url, role, is_banned, is_developer")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return { ...DEFAULT_PROFILE_PERMISSIONS, ...data };
}
