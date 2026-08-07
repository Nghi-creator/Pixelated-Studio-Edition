import type { SupabaseService } from "../../auth/infrastructure/supabaseClients.js";

const ADMIN_USER_COLUMNS = "id,username,avatar_url,created_at,role,is_banned";

export type AdminUserRow = {
  avatar_url: string | null;
  created_at: string;
  id: string;
  is_banned: boolean;
  role: string;
  username: string | null;
};

export async function findAdminUsers(
  service: SupabaseService,
  input: { end: number; search?: string; start: number },
) {
  let query = service
    .from("profiles")
    .select(ADMIN_USER_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false });
  if (input.search) query = query.ilike("username", `%${input.search}%`);

  const { data, count, error } = await query.range(input.start, input.end);
  if (error) throw error;
  return { total: count || 0, users: (data || []) as AdminUserRow[] };
}

export async function findUserRole(service: SupabaseService, userId: string) {
  const { data, error } = await service
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<{ role: string | null }>();
  if (error) throw error;
  return data?.role || null;
}

export async function updateAdminUser(
  service: SupabaseService,
  userId: string,
  update: { is_banned?: boolean; role?: "admin" | "user" },
) {
  const { data, error } = await service
    .from("profiles")
    .update(update)
    .eq("id", userId)
    .select(ADMIN_USER_COLUMNS)
    .single<AdminUserRow>();
  if (error || !data) throw error || new Error("Supabase returned no user");
  return data;
}
