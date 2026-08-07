import { buildAbilities, type ProfilePermissions } from "../domain/permissions.js";

export function createGetPermissions(dependencies: {
  findProfile(userId: string): Promise<ProfilePermissions>;
}) {
  return async function getPermissions(user: { email?: string; id: string }) {
    const profile = await dependencies.findProfile(user.id);
    return {
      abilities: buildAbilities(profile),
      profile: {
        avatar_url: profile.avatar_url,
        email: profile.email,
        is_banned: profile.is_banned,
        is_developer: profile.is_developer,
        role: profile.role,
        username: profile.username,
      },
      user: { id: user.id, email: user.email ?? null },
    };
  };
}
