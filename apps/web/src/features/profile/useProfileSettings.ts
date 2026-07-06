import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { api } from "../../lib/api/apiClient";
import {
  useAuthSessionQuery,
  useProfileQuery,
} from "../../lib/api/apiQueries";
import { invalidateProfileQueries } from "../../lib/api/queryClient";
import { supabase } from "../../lib/auth/supabaseClient";
import { isAuthCaptchaEnabled } from "../auth/captchaConfig";
import { saveProfile } from "./profileMutations";
import type { ProfileMessage } from "./profileSettingsTypes";
import { useDeleteAccount } from "./useDeleteAccount";
import { useProfileAvatar } from "./useProfileAvatar";
import { useProfilePassword } from "./useProfilePassword";

export function useProfileSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profileMutationRef = useRef(false);

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userRole, setUserRole] = useState<string>("user");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<ProfileMessage | null>(
    null,
  );
  const [username, setUsername] = useState("");
  const [passwordCaptchaToken, setPasswordCaptchaToken] = useState("");
  const [passwordCaptchaResetKey, setPasswordCaptchaResetKey] = useState(0);
  const [deleteCaptchaToken, setDeleteCaptchaToken] = useState("");
  const [deleteCaptchaResetKey, setDeleteCaptchaResetKey] = useState(0);
  const resetPasswordCaptchaChallenge = useCallback(() => {
    setPasswordCaptchaToken("");
    setPasswordCaptchaResetKey((key) => key + 1);
  }, []);
  const resetDeleteCaptchaChallenge = useCallback(() => {
    setDeleteCaptchaToken("");
    setDeleteCaptchaResetKey((key) => key + 1);
  }, []);

  const hasPassword = user?.app_metadata?.providers?.includes("email");
  const avatar = useProfileAvatar({ setProfileMessage });
  const { setAvatarUrl } = avatar;
  const password = useProfilePassword({
    captchaToken: passwordCaptchaToken,
    onCaptchaChallengeReset: resetPasswordCaptchaChallenge,
    user,
  });
  const deleteAccount = useDeleteAccount({
    captchaToken: deleteCaptchaToken,
    hasPassword,
    onCaptchaChallengeReset: resetDeleteCaptchaChallenge,
    user,
  });

  const sessionQuery = useAuthSessionQuery();
  const profileQuery = useProfileQuery({
    enabled: Boolean(sessionQuery.data),
  });

  useEffect(() => {
    if (sessionQuery.isLoading) return;
    if (!sessionQuery.data) {
      navigate("/login");
      return;
    }

    setUser(sessionQuery.data.user);
  }, [navigate, sessionQuery.data, sessionQuery.isLoading]);

  useEffect(() => {
    const profile = profileQuery.data?.profile;
    if (profile) {
      setUsername(profile.username || "");
      setAvatarUrl(profile.avatar_url || "");
      setUserRole(profile.role || "user");
    }
  }, [profileQuery.data, setAvatarUrl]);

  useEffect(() => {
    if (sessionQuery.isError || profileQuery.isError) {
      const error = sessionQuery.error || profileQuery.error;
      console.error("Error loading profile", error);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Failed to load account settings.",
      );
      return;
    }

    setLoadError(null);
  }, [
    profileQuery.error,
    profileQuery.isError,
    sessionQuery.error,
    sessionQuery.isError,
  ]);

  const updateProfile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || profileMutationRef.current) return;
    profileMutationRef.current = true;
    setSavingProfile(true);
    setProfileMessage(null);

    try {
      const result = await saveProfile({
        avatarFile: avatar.avatarFile,
        currentAvatarUrl: avatar.avatarUrl,
        removeAvatar: async (path) => {
          const { error } = await supabase.storage.from("avatars").remove([path]);
          if (error) throw error;
        },
        updateAuthMetadata: async (finalAvatarUrl, finalUsername) => {
          const { error } = await supabase.auth.updateUser({
            data: { avatar_url: finalAvatarUrl, username: finalUsername },
          });
          if (error) throw error;
        },
        updateProfile: async (finalAvatarUrl, finalUsername) => {
          await api.updateProfile({
            avatarUrl: finalAvatarUrl,
            username: finalUsername,
          });
          await invalidateProfileQueries(queryClient);
        },
        uploadAvatar: async (file, path) => {
          const { error } = await supabase.storage
            .from("avatars")
            .upload(path, file, { contentType: "image/jpeg" });
          if (error) throw error;

          const {
            data: { publicUrl },
          } = supabase.storage.from("avatars").getPublicUrl(path);
          return publicUrl;
        },
        userId: user.id,
        username,
      });
      setUsername(username.trim());
      avatar.commitSavedAvatar(result.avatarUrl);
      setProfileMessage({
        type: result.warnings.length ? "warning" : "success",
        text: result.warnings.length
          ? result.warnings.join(" ")
          : "Profile updated successfully.",
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        setProfileMessage({ type: "error", text: error.message });
      } else {
        setProfileMessage({ type: "error", text: "Failed to update profile." });
      }
    } finally {
      profileMutationRef.current = false;
      setSavingProfile(false);
    }
  };

  return {
    closeDeleteModal: deleteAccount.closeDeleteModal,
    crop: avatar.crop,
    currentPassword: password.currentPassword,
    deleteCaptchaResetKey,
    deleteCaptchaToken,
    deleteError: deleteAccount.deleteError,
    deleteInput: deleteAccount.deleteInput,
    displayAvatar: avatar.displayAvatar,
    fileInputRef: avatar.fileInputRef,
    handleCropConfirm: avatar.handleCropConfirm,
    handleDeleteAccount: deleteAccount.handleDeleteAccount,
    handleFileSelect: avatar.handleFileSelect,
    hasPassword,
    imageSrc: avatar.imageSrc,
    isAuthCaptchaEnabled,
    isCropping: avatar.isCropping,
    isDeleting: deleteAccount.isDeleting,
    loadError,
    loading: sessionQuery.isLoading || profileQuery.isLoading,
    navigate,
    newPassword: password.newPassword,
    onCropComplete: avatar.onCropComplete,
    passwordMessage: password.passwordMessage,
    passwordCaptchaResetKey,
    passwordCaptchaToken,
    profileMessage,
    savingPassword: password.savingPassword,
    savingProfile,
    setCrop: avatar.setCrop,
    setCurrentPassword: password.setCurrentPassword,
    setDeleteCaptchaToken,
    setDeleteInput: deleteAccount.setDeleteInput,
    setLoadAttempt: () => {
      void sessionQuery.refetch();
      void profileQuery.refetch();
    },
    setNewPassword: password.setNewPassword,
    setPasswordCaptchaToken,
    setShowCropper: avatar.setShowCropper,
    setShowDeleteModal: deleteAccount.setShowDeleteModal,
    setUsername,
    setZoom: avatar.setZoom,
    showCropper: avatar.showCropper,
    showDeleteModal: deleteAccount.showDeleteModal,
    updatePassword: password.updatePassword,
    updateProfile,
    user,
    userRole,
    username,
    zoom: avatar.zoom,
  };
}
