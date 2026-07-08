import {
  AvatarCropModal,
  DeleteAccountModal,
} from "../../features/profile/ProfileModals";
import {
  ProfileLoadingState,
  ProfileLoadError,
  PublicProfileSection,
  SecuritySection,
} from "../../features/profile/ProfileSettingsSections";
import { useProfileSettings } from "../../features/profile/useProfileSettings";

export default function Profile() {
  const profile = useProfileSettings();

  if (profile.loading) {
    return <ProfileLoadingState />;
  }

  if (profile.loadError) {
    return (
      <ProfileLoadError
        loadError={profile.loadError}
        onRetry={() => profile.setLoadAttempt()}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {profile.showCropper && profile.imageSrc && (
        <AvatarCropModal
          crop={profile.crop}
          imageSrc={profile.imageSrc}
          isCropping={profile.isCropping}
          onCancel={() => profile.setShowCropper(false)}
          onConfirm={() => void profile.handleCropConfirm()}
          onCropChange={profile.setCrop}
          onCropComplete={profile.onCropComplete}
          onZoomChange={profile.setZoom}
          zoom={profile.zoom}
        />
      )}

      {profile.showDeleteModal && (
        <DeleteAccountModal
          deleteError={profile.deleteError}
          deleteInput={profile.deleteInput}
          hasPassword={Boolean(profile.hasPassword)}
          isDeleting={profile.isDeleting}
          isAuthCaptchaEnabled={profile.isAuthCaptchaEnabled}
          onCancel={profile.closeDeleteModal}
          onCaptchaTokenChange={profile.setDeleteCaptchaToken}
          onDeleteInputChange={profile.setDeleteInput}
          onSubmit={profile.handleDeleteAccount}
          captchaResetKey={profile.deleteCaptchaResetKey}
          captchaToken={profile.deleteCaptchaToken}
        />
      )}

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full mt-8">
        <button
          onClick={() => profile.navigate("/home")}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 w-fit"
        >
          Back to Home
        </button>

        <h1 className="text-4xl font-extrabold tracking-tight mb-2 text-white">
          Account Settings
        </h1>

        <div className="space-y-8">
          <PublicProfileSection profile={profile} />
          <SecuritySection profile={profile} />
        </div>
      </div>
    </div>
  );
}
