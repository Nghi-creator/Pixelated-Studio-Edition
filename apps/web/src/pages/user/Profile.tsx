import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AlertOctagon } from "lucide-react";
import { supabase } from "../../lib/auth/supabaseClient";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { api, ApiError, getAuthSession } from "../../lib/apiClient";
import { Avatar } from "../../components/ui/Avatar";
import { ProfileSkeleton } from "../../components/ui/Skeleton";
import {
  createCroppedAvatar,
  type CropArea,
} from "../../features/profile/avatarCrop";
import {
  AvatarCropModal,
  DeleteAccountModal,
} from "../../features/profile/ProfileModals";
import {
  saveProfile,
  validateAvatarFile,
} from "../../features/profile/profileMutations";
import {
  getPasswordPolicyError,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HINT,
} from "../../lib/auth/passwordPolicy";
export default function Profile() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileMutationRef = useRef(false);
  const passwordMutationRef = useRef(false);
  const deleteMutationRef = useRef(false);

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userRole, setUserRole] = useState<string>("user");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Split messages
  const [profileMessage, setProfileMessage] = useState<{
    type: "success" | "warning" | "error";
    text: string;
  } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Profile Form State
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Cropper Modal State
  const [showCropper, setShowCropper] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] =
    useState<CropArea | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Account Deletion State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const hasPassword = user?.app_metadata?.providers?.includes("email");

  useEffect(() => {
    let isMounted = true;
    const fetchProfile = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const session = await getAuthSession();
        if (!isMounted) return;
        if (!session) {
          navigate("/login");
          return;
        }
        setUser(session.user);

        const { profile } = await api.profile();
        if (!isMounted) return;

        if (profile) {
          setUsername(profile.username || "");
          setAvatarUrl(profile.avatar_url || "");
          setUserRole(profile.role || "user");
        }
      } catch (error) {
        console.error("Error loading profile", error);
        if (isMounted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load account settings.",
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void fetchProfile();
    return () => {
      isMounted = false;
    };
  }, [loadAttempt, navigate]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const updateProfile = async (e: React.SubmitEvent<HTMLFormElement>) => {
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

  const updatePassword = async (e: React.SubmitEvent<HTMLFormElement>) => {
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

  const handleDeleteAccount = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || deleteMutationRef.current) return;
    deleteMutationRef.current = true;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      if (hasPassword) {
        // 1A. Email Users: Verify Password
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: user.email!,
          password: deleteInput,
        });
        if (verifyError) throw new Error("Incorrect password.");
      } else {
        // OAuth users confirm intent here; the API also requires a recent sign-in.
        if (deleteInput !== "DELETE") {
          throw new Error("You must type exactly 'DELETE' to confirm.");
        }
      }

      await api.deleteAccount();

      // The account is already gone at this point; local sign-out is best effort.
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

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <ProfileSkeleton />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="max-w-md rounded-lg border border-red-500/30 bg-synth-surface p-8 text-center shadow-card">
          <AlertOctagon className="mx-auto mb-4 h-10 w-10 text-red-400" />
          <h1 className="mb-2 text-xl font-bold text-white">
            Account settings unavailable
          </h1>
          <p className="mb-6 text-sm text-gray-400">{loadError}</p>
          <button
            className="mx-auto flex items-center gap-2 rounded-lg bg-synth-primary px-5 py-2.5 font-bold text-white"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            type="button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const displayAvatar = previewUrl || avatarUrl;

  return (
    <div className="flex flex-col min-h-screen">
      {showCropper && imageSrc && (
        <AvatarCropModal
          crop={crop}
          imageSrc={imageSrc}
          isCropping={isCropping}
          onCancel={() => setShowCropper(false)}
          onConfirm={() => void handleCropConfirm()}
          onCropChange={setCrop}
          onCropComplete={onCropComplete}
          onZoomChange={setZoom}
          zoom={zoom}
        />
      )}

      {showDeleteModal && (
        <DeleteAccountModal
          deleteError={deleteError}
          deleteInput={deleteInput}
          hasPassword={Boolean(hasPassword)}
          isDeleting={isDeleting}
          onCancel={() => {
            setShowDeleteModal(false);
            setDeleteError(null);
            setDeleteInput("");
          }}
          onDeleteInputChange={setDeleteInput}
          onSubmit={handleDeleteAccount}
        />
      )}

      {/* MAIN PROFILE PAGE */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full mt-8">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 w-fit"
        >
          Back to Home
        </button>

        <h1 className="text-4xl font-extrabold tracking-tight mb-2 text-white">
          Account Settings
        </h1>

        <div className="space-y-8">
          {/* PROFILE SECTION */}
          <div className="bg-[#2B1720] border border-synth-border rounded-lg p-6 md:p-8 shadow-card">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              Public Profile
            </h2>

            {/* Profile Message Block */}
            {profileMessage && (
              <div
                className={`p-4 rounded-lg mb-6 border ${
                  profileMessage.type === "success"
                    ? "bg-[#9B0048]/15 border-[#C02066]/50 text-[#F38BB4]"
                    : profileMessage.type === "warning"
                      ? "bg-synth-primary/10 border-synth-primary/50 text-synth-secondary"
                      : "bg-red-500/10 border-red-500/50 text-red-400"
                }`}
                role={profileMessage.type === "error" ? "alert" : "status"}
              >
                {profileMessage.text}
              </div>
            )}

            <form onSubmit={updateProfile} className="space-y-8">
              <div className="flex flex-col items-center gap-6">
                <button
                  aria-label="Choose a new avatar"
                  disabled={savingProfile}
                  onClick={() => fileInputRef.current?.click()}
                  className="relative w-24 h-24 rounded-full overflow-hidden group cursor-pointer border-2 border-transparent hover:border-synth-border transition-colors shadow-card"
                  type="button"
                >
                  <Avatar
                    alt="Avatar"
                    className="h-full w-full border-0"
                    loading="eager"
                    name={username || user?.email}
                    size="lg"
                    src={displayAvatar}
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
                    <span className="text-[10px] text-white font-bold uppercase tracking-wider">
                      Change
                    </span>
                  </div>
                </button>

                <div className="text-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  disabled
                  value={user?.email || ""}
                  className="w-full bg-synth-bg/50 border border-synth-border text-gray-500 rounded-lg px-4 py-3 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter a cool username"
                  disabled={savingProfile}
                  maxLength={80}
                  required
                  className="w-full bg-synth-bg border border-synth-border text-white rounded-lg px-4 py-3 focus:outline-none focus:border-synth-secondary transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={savingProfile || !username.trim()}
                className="bg-synth-primary hover:bg-synth-primary-hover text-white font-bold py-2.5 px-6 rounded-lg transition-all flex items-center gap-2 "
              >
                {savingProfile ? "Saving..." : "Save Profile"}
              </button>
            </form>
          </div>

          {/* SECURITY SECTION */}
          <div className="bg-[#2B1720] border border-synth-border rounded-lg p-6 md:p-8 shadow-card">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              Security
            </h2>

            {/* Password Message Block */}
            {passwordMessage && (
              <div
                className={`p-4 rounded-lg mb-6 border ${passwordMessage.type === "success" ? "bg-[#9B0048]/15 border-[#C02066]/50 text-[#F38BB4]" : "bg-red-500/10 border-red-500/50 text-red-400"}`}
              >
                {passwordMessage.text}
              </div>
            )}

            {hasPassword ? (
              <form onSubmit={updatePassword} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                    disabled={savingPassword}
                    className="w-full bg-synth-bg border border-synth-border text-white rounded-lg px-4 py-3 focus:outline-none focus:border-red-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                    minLength={PASSWORD_MIN_LENGTH}
                    disabled={savingPassword}
                    className="w-full bg-synth-bg border border-synth-border text-white rounded-lg px-4 py-3 focus:outline-none focus:border-red-400 transition-all"
                  />
                </div>
                <p className="text-xs leading-5 text-gray-400">
                  {PASSWORD_POLICY_HINT}
                </p>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="bg-synth-primary hover:bg-synth-primary-hover text-white font-bold py-2.5 px-6 rounded-lg transition-all flex items-center gap-2"
                >
                  {savingPassword ? "Updating..." : "Update Password"}
                </button>
              </form>
            ) : (
              <p className="rounded-lg border border-synth-border bg-synth-bg/40 p-4 text-sm text-gray-400">
                This account signs in through an external provider. Manage its
                password with that provider.
              </p>
            )}

            {/* MERGED DANGER ZONE (HIDDEN FROM ADMINS/SUPER_ADMINS) */}
            {userRole !== "admin" && userRole !== "super_admin" && (
              <div className="mt-10 pt-8 border-t border-synth-border">
                <h3 className="text-lg font-bold text-red-500 mb-2 flex items-center gap-2">
                  <AlertOctagon className="w-5 h-5" /> Danger Zone
                </h3>
                <p className="text-gray-400 text-sm mb-6">
                  Once you delete your account, there is no going back. Please
                  be certain.
                </p>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  type="button"
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 font-bold py-2.5 px-6 rounded-lg transition-all"
                >
                  Delete Account
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
