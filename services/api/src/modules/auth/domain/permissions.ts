export type ProfilePermissions = {
  avatar_url: string | null;
  email: string | null;
  is_banned: boolean;
  is_developer: boolean;
  role: string;
  username: string | null;
};

export const DEFAULT_PROFILE_PERMISSIONS: ProfilePermissions = {
  avatar_url: null,
  email: null,
  is_banned: false,
  is_developer: false,
  role: "user",
  username: null,
};

export function buildAbilities(profile: ProfilePermissions) {
  const isAdmin = profile.role === "admin" || profile.role === "super_admin";
  return {
    canAccessAdmin: isAdmin,
    canManageReports: isAdmin,
    canManageUsers: profile.role === "super_admin",
    canPublishGames: profile.is_developer || isAdmin,
    isBanned: profile.is_banned,
  };
}
