import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { ApiError, api, getAuthSession } from "../../lib/api/apiClient";
import { queryKeys } from "../../lib/api/queryClient";
import { supabase } from "../../lib/auth/supabaseClient";
import { getPasswordPolicyError } from "../../lib/auth/passwordPolicy";
import { createCroppedAvatar, type CropArea } from "./avatarCrop";
import { saveProfile, validateAvatarFile } from "./profileMutations";

type ProfileMessage = {
  type: "success" | "warning" | "error";
  text: string;
};

type PasswordMessage = {
  type: "success" | "error";
  text: string;
};

export function useProfileSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileMutationRef = useRef(false);
  const passwordMutationRef = useRef(false);
  const deleteMutationRef = useRef(false);

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userRole, setUserRole] = useState<string>("user");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState<ProfileMessage | null>(
    null,
  );
  const [passwordMessage, setPasswordMessage] =
    useState<PasswordMessage | null>(null);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] =
    useState<CropArea | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const hasPassword = user?.app_metadata?.providers?.includes("email");
  const displayAvatar = previewUrl || avatarUrl;

  const sessionQuery = useQuery({
    queryKey: ["authSession"],
    queryFn: getAuthSession,
  });
  const profileQuery = useQuery({
    enabled: Boolean(sessionQuery.data),
    queryKey: queryKeys.profile(),
    queryFn: api.profile,
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
  }, [profileQuery.data]);

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

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const validationError = validateAvatarFile(file);
      if (validationError) {
        setProfileMessage({ type: "error", text: validationError });
        e.target.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setImageSrc(reader.result as string);
        setCroppedAreaPixels(null);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setShowCropper(true);
      };
      reader.onerror = () => {
        setProfileMessage({
          type: "error",
          text: "The selected image could not be read.",
        });
      };
      reader.readAsDataURL(file);

      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onCropComplete = useCallback(
    (_croppedArea: CropArea, croppedAreaPixels: CropArea) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    [],
  );

  const handleCropConfirm = async () => {
    if (isCropping) return;
    setIsCropping(true);
    try {
      if (!imageSrc || !croppedAreaPixels) return;
      const croppedFile = await createCroppedAvatar(imageSrc, croppedAreaPixels);

      setAvatarFile(croppedFile);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(croppedFile);
      });
      setShowCropper(false);
    } catch (error) {
      console.error(error);
      setProfileMessage({
        type: "error",
        text: "Failed to crop the selected image.",
      });
    } finally {
      setIsCropping(false);
    }
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteError(null);
    setDeleteInput("");
  };

  const updateProfile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || profileMutationRef.current) return;
    profileMutationRef.current = true;
    setSavingProfile(true);
    setProfileMessage(null);

    try {
      const result = await saveProfile({
        avatarFile,
        currentAvatarUrl: avatarUrl,
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
          await queryClient.invalidateQueries({ queryKey: queryKeys.profile() });
          await queryClient.invalidateQueries({
            queryKey: queryKeys.permissions(),
          });
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
      setAvatarUrl(result.avatarUrl);
      setAvatarFile(null);
      setPreviewUrl(null);
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

  const updatePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.email || passwordMutationRef.current) return;
    passwordMutationRef.current = true;
    setSavingPassword(true);
    setPasswordMessage(null);

    try {
      const policyError = getPasswordPolicyError(newPassword);
      if (policyError) throw new Error(policyError);

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyError) throw new Error("Current password is incorrect.");

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      setPasswordMessage({
        type: "success",
        text: "Password updated successfully.",
      });
      setCurrentPassword("");
      setNewPassword("");
    } catch (error: unknown) {
      if (error instanceof Error) {
        setPasswordMessage({ type: "error", text: error.message });
      } else {
        setPasswordMessage({
          type: "error",
          text: "Failed to update password.",
        });
      }
    } finally {
      passwordMutationRef.current = false;
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || deleteMutationRef.current) return;
    deleteMutationRef.current = true;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      if (hasPassword) {
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: user.email!,
          password: deleteInput,
        });
        if (verifyError) throw new Error("Incorrect password.");
      } else if (deleteInput !== "DELETE") {
        throw new Error("You must type exactly 'DELETE' to confirm.");
      }

      await api.deleteAccount();

      try {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) console.warn("Failed to clear deleted account session");
      } catch {
        console.warn("Failed to clear deleted account session");
      }
      navigate("/", { replace: true });
    } catch (error: unknown) {
      if (
        error instanceof ApiError &&
        typeof error.payload === "object" &&
        error.payload &&
        "error" in error.payload &&
        typeof error.payload.error === "string"
      ) {
        setDeleteError(error.payload.error);
      } else if (error instanceof Error) {
        setDeleteError(error.message);
      } else {
        setDeleteError(
          "An unexpected error occurred while deleting your account.",
        );
      }
      deleteMutationRef.current = false;
      setIsDeleting(false);
    }
  };

  return {
    closeDeleteModal,
    crop,
    currentPassword,
    deleteError,
    deleteInput,
    displayAvatar,
    fileInputRef,
    handleCropConfirm,
    handleDeleteAccount,
    handleFileSelect,
    hasPassword,
    imageSrc,
    isCropping,
    isDeleting,
    loadError,
    loading: sessionQuery.isLoading || profileQuery.isLoading,
    navigate,
    newPassword,
    onCropComplete,
    passwordMessage,
    profileMessage,
    savingPassword,
    savingProfile,
    setCrop,
    setCurrentPassword,
    setDeleteInput,
    setLoadAttempt: (_?: unknown) => {
      void sessionQuery.refetch();
      void profileQuery.refetch();
    },
    setNewPassword,
    setShowCropper,
    setShowDeleteModal,
    setUsername,
    setZoom,
    showCropper,
    showDeleteModal,
    updatePassword,
    updateProfile,
    user,
    userRole,
    username,
    zoom,
  };
}
