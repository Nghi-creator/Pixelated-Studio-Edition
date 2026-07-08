import { AlertOctagon } from "lucide-react";
import { Avatar } from "../../components/ui/Avatar";
import { ProfileSkeleton } from "../../components/ui/Skeleton";
import { AuthCaptcha } from "../auth/AuthCaptcha";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HINT,
} from "../../lib/auth/passwordPolicy";
import type { useProfileSettings } from "./useProfileSettings";

export type ProfileSettingsState = ReturnType<typeof useProfileSettings>;

export function ProfileLoadingState() {
  return (
    <div className="flex min-h-screen flex-col">
      <ProfileSkeleton />
    </div>
  );
}

export function ProfileLoadError({
  loadError,
  onRetry,
}: {
  loadError: string;
  onRetry: () => void;
}) {
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
          onClick={onRetry}
          type="button"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

export function PublicProfileSection({ profile }: { profile: ProfileSettingsState }) {
  const {
    displayAvatar,
    fileInputRef,
    handleFileSelect,
    profileMessage,
    savingProfile,
    setUsername,
    updateProfile,
    user,
    username,
  } = profile;

  return (
    <div className="bg-[#2B1720] border border-synth-border rounded-lg p-6 md:p-8 shadow-card">
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        Public Profile
      </h2>

      {profileMessage && (
        <div
          className={`p-4 rounded-lg mb-6 border ${
            profileMessage.type === "success"
              ? "bg-[#9B0048]/15 border-[#C02066]/50 text-[#F38BB4]"
              : profileMessage.type === "warning"
                ? "bg-synth-primary/10 border-synth-primary/50 text-synth-secondary"
                : "danger-panel font-bold"
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

          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
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
            onChange={(event) => setUsername(event.target.value)}
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
          className="bg-synth-primary hover:bg-synth-primary-hover text-white font-bold py-2.5 px-6 rounded-lg transition-all flex items-center gap-2"
        >
          {savingProfile ? "Saving..." : "Save Profile"}
        </button>
      </form>
    </div>
  );
}

export function SecuritySection({ profile }: { profile: ProfileSettingsState }) {
  const {
    currentPassword,
    hasPassword,
    isAuthCaptchaEnabled,
    newPassword,
    passwordCaptchaResetKey,
    passwordCaptchaToken,
    passwordMessage,
    savingPassword,
    setCurrentPassword,
    setNewPassword,
    setPasswordCaptchaToken,
    setShowDeleteModal,
    updatePassword,
    userRole,
  } = profile;

  return (
    <div className="bg-[#2B1720] border border-synth-border rounded-lg p-6 md:p-8 shadow-card">
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        Security
      </h2>

      {passwordMessage && (
        <div
          className={`p-4 rounded-lg mb-6 border ${passwordMessage.type === "success" ? "bg-[#9B0048]/15 border-[#C02066]/50 text-[#F38BB4]" : "danger-panel font-bold"}`}
        >
          {passwordMessage.text}
        </div>
      )}

      {hasPassword ? (
        <form onSubmit={updatePassword} className="space-y-6">
          <PasswordField
            disabled={savingPassword}
            label="Current Password"
            onChange={setCurrentPassword}
            placeholder="Enter current password"
            value={currentPassword}
          />
          <PasswordField
            disabled={savingPassword}
            label="New Password"
            minLength={PASSWORD_MIN_LENGTH}
            onChange={setNewPassword}
            placeholder="Enter new password"
            value={newPassword}
          />
          <p className="text-xs leading-5 text-gray-400">
            {PASSWORD_POLICY_HINT}
          </p>
          <AuthCaptcha
            onTokenChange={setPasswordCaptchaToken}
            resetKey={passwordCaptchaResetKey}
          />
          <button
            type="submit"
            disabled={
              savingPassword ||
              (isAuthCaptchaEnabled && !passwordCaptchaToken)
            }
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

      {userRole !== "admin" && userRole !== "super_admin" && (
        <div className="mt-10 pt-8 border-t border-synth-border">
          <h3 className="text-lg font-bold text-red-300 mb-2 flex items-center gap-2">
            <AlertOctagon className="w-5 h-5" /> Danger Zone
          </h3>
          <p className="text-gray-400 text-sm mb-6">
            Once you delete your account, there is no going back. Please be
            certain.
          </p>
          <button
            onClick={() => setShowDeleteModal(true)}
            type="button"
            className="danger-action rounded-lg border px-6 py-2.5 font-bold transition-colors"
          >
            Delete Account
          </button>
        </div>
      )}
    </div>
  );
}

function PasswordField({
  disabled,
  label,
  minLength,
  onChange,
  placeholder,
  value,
}: {
  disabled: boolean;
  label: string;
  minLength?: number;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        {label}
      </label>
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required
        minLength={minLength}
        disabled={disabled}
        className="w-full bg-synth-bg border border-synth-border text-white rounded-lg px-4 py-3 focus:outline-none focus:border-red-400 transition-all"
      />
    </div>
  );
}
