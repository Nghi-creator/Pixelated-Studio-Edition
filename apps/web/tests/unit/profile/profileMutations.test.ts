import assert from "node:assert/strict";
import test from "node:test";
import {
  getOwnedAvatarPath,
  saveProfile,
  validateAvatarFile,
} from "../../../src/features/profile/profileMutations.ts";

test("avatar validation rejects non-images and oversized files", () => {
  assert.match(
    validateAvatarFile({ size: 10, type: "text/plain" }) || "",
    /image file/,
  );
  assert.match(
    validateAvatarFile({ size: 6 * 1024 * 1024, type: "image/png" }) || "",
    /5 MB/,
  );
  assert.equal(validateAvatarFile({ size: 100, type: "image/png" }), null);
});

test("owned avatar paths reject external and other-user objects", () => {
  const owned =
    "https://project.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg?t=1";
  assert.equal(getOwnedAvatarPath(owned, "user-1"), "user-1/avatar.jpg");
  assert.equal(getOwnedAvatarPath(owned, "user-2"), null);
  assert.equal(getOwnedAvatarPath("https://example.com/avatar.jpg", "user-1"), null);
});

test("profile save removes a newly uploaded avatar when the API update fails", async () => {
  const removed: string[] = [];

  await assert.rejects(
    saveProfile({
      avatarFile: {} as File,
      currentAvatarUrl: "",
      removeAvatar: async (path) => {
        removed.push(path);
      },
      updateAuthMetadata: async () => undefined,
      updateProfile: async () => {
        throw new Error("profile unavailable");
      },
      uploadAvatar: async (_file, path) =>
        `https://project.supabase.co/storage/v1/object/public/avatars/${path}`,
      userId: "user-1",
      username: "name",
    }),
    /profile unavailable/,
  );

  assert.equal(removed.length, 1);
  assert.match(removed[0], /^user-1\/avatar-\d+\.jpg$/);
});

test("profile save cleans the versioned path after an uncertain upload failure", async () => {
  const removed: string[] = [];

  await assert.rejects(
    saveProfile({
      avatarFile: {} as File,
      currentAvatarUrl: "",
      removeAvatar: async (path) => {
        removed.push(path);
      },
      updateAuthMetadata: async () => undefined,
      updateProfile: async () => undefined,
      uploadAvatar: async () => {
        throw new Error("upload unavailable");
      },
      userId: "user-1",
      username: "name",
    }),
    /upload unavailable/,
  );

  assert.equal(removed.length, 1);
  assert.match(removed[0], /^user-1\/avatar-\d+\.jpg$/);
});

test("profile save reports partial cleanup and metadata failures clearly", async () => {
  const currentAvatar =
    "https://project.supabase.co/storage/v1/object/public/avatars/user-1/old.jpg";

  const result = await saveProfile({
    avatarFile: {} as File,
    currentAvatarUrl: currentAvatar,
    removeAvatar: async () => {
      throw new Error("cleanup failed");
    },
    updateAuthMetadata: async () => {
      throw new Error("metadata failed");
    },
    updateProfile: async () => undefined,
    uploadAvatar: async (_file, path) =>
      `https://project.supabase.co/storage/v1/object/public/avatars/${path}`,
    userId: "user-1",
    username: "  updated-name  ",
  });

  assert.equal(result.warnings.length, 2);
  assert.match(result.avatarUrl, /user-1\/avatar-\d+\.jpg$/);
});
