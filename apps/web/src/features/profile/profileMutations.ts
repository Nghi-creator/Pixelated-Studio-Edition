export const MAX_AVATAR_FILE_BYTES = 5 * 1024 * 1024;

export type ProfileSaveResult = {
  avatarUrl: string;
  warnings: string[];
};

type SaveProfileOptions = {
  avatarFile: File | null;
  currentAvatarUrl: string;
  removeAvatar: (path: string) => Promise<void>;
  updateAuthMetadata: (avatarUrl: string, username: string) => Promise<void>;
  updateProfile: (avatarUrl: string, username: string) => Promise<void>;
  uploadAvatar: (file: File, path: string) => Promise<string>;
  userId: string;
  username: string;
};

export function validateAvatarFile(file: Pick<File, "size" | "type">) {
  if (!file.type.startsWith("image/")) {
    return "Choose an image file for your avatar.";
  }
  if (file.size > MAX_AVATAR_FILE_BYTES) {
    return "Avatar images must be 5 MB or smaller.";
  }
  return null;
}

export function createAvatarPath(userId: string, now = Date.now()) {
  return `${userId}/avatar-${now}.jpg`;
}

export function getOwnedAvatarPath(avatarUrl: string, userId: string) {
  if (!avatarUrl) return null;

  try {
    const marker = "/storage/v1/object/public/avatars/";
    const pathname = new URL(avatarUrl).pathname;
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex === -1) return null;

    const path = decodeURIComponent(pathname.slice(markerIndex + marker.length));
    return path.startsWith(`${userId}/`) ? path : null;
  } catch {
    return null;
  }
}

export async function saveProfile({
  avatarFile,
  currentAvatarUrl,
  removeAvatar,
  updateAuthMetadata,
  updateProfile,
  uploadAvatar,
  userId,
  username,
}: SaveProfileOptions): Promise<ProfileSaveResult> {
  const normalizedUsername = username.trim();
  let avatarUrl = currentAvatarUrl;
  let uploadedPath: string | null = null;

  if (avatarFile) {
    uploadedPath = createAvatarPath(userId);
    try {
      avatarUrl = await uploadAvatar(avatarFile, uploadedPath);
    } catch (error) {
      await removeAvatar(uploadedPath).catch(() => undefined);
      throw error;
    }
  }

  try {
    await updateProfile(avatarUrl, normalizedUsername);
  } catch (error) {
    if (uploadedPath) {
      await removeAvatar(uploadedPath).catch(() => undefined);
    }
    throw error;
  }

  const warnings: string[] = [];
  try {
    await updateAuthMetadata(avatarUrl, normalizedUsername);
  } catch {
    warnings.push(
      "Profile saved, but session metadata could not be synchronized. It will refresh after your next sign-in.",
    );
  }

  const previousAvatarPath = getOwnedAvatarPath(currentAvatarUrl, userId);
  if (uploadedPath && previousAvatarPath && previousAvatarPath !== uploadedPath) {
    try {
      await removeAvatar(previousAvatarPath);
    } catch {
      warnings.push(
        "Profile saved, but the previous avatar could not be cleaned up.",
      );
    }
  }

  return { avatarUrl, warnings };
}
