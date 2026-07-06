import { AlertOctagon, Loader2, X } from "lucide-react";
import Cropper from "react-easy-crop";
import { AuthCaptcha } from "../auth/AuthCaptcha";
import type { CropArea } from "./avatarCrop";

export function AvatarCropModal({
  crop,
  imageSrc,
  isCropping,
  onCancel,
  onConfirm,
  onCropChange,
  onCropComplete,
  onZoomChange,
  zoom,
}: {
  crop: { x: number; y: number };
  imageSrc: string;
  isCropping: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onCropChange: (crop: { x: number; y: number }) => void;
  onCropComplete: (croppedArea: CropArea, croppedAreaPixels: CropArea) => void;
  onZoomChange: (zoom: number) => void;
  zoom: number;
}) {
  return (
    <div
      aria-labelledby="avatar-crop-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
      role="dialog"
    >
      <div className="bg-synth-surface border border-synth-border rounded-lg w-full max-w-lg overflow-hidden shadow-card flex flex-col">
        <div className="p-4 border-b border-synth-border flex justify-between items-center">
          <h3 id="avatar-crop-title" className="text-white font-bold">
            Crop your image
          </h3>
          <button
            aria-label="Close avatar crop dialog"
            disabled={isCropping}
            onClick={onCancel}
            type="button"
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative w-full h-80 bg-black">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={onCropChange}
            onCropComplete={onCropComplete}
            onZoomChange={onZoomChange}
          />
        </div>

        <div className="p-6 bg-synth-surface">
          <label className="text-sm text-gray-400 mb-2 block">Zoom</label>
          <input
            type="range"
            value={zoom}
            min={1}
            max={3}
            step={0.1}
            aria-labelledby="Zoom"
            onChange={(event) => onZoomChange(Number(event.target.value))}
            className="w-full h-2 bg-synth-elevated rounded-lg appearance-none cursor-pointer accent-synth-primary mb-6"
          />
          <div className="flex justify-end gap-3">
            <button
              disabled={isCropping}
              onClick={onCancel}
              type="button"
              className="px-5 py-2.5 rounded-lg text-gray-300 hover:bg-synth-elevated transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              disabled={isCropping}
              onClick={onConfirm}
              type="button"
              className="px-5 py-2.5 bg-synth-primary hover:bg-synth-primary-hover text-white rounded-lg transition-colors font-bold "
            >
              {isCropping ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Confirm Crop"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DeleteAccountModal({
  captchaResetKey,
  captchaToken,
  deleteError,
  deleteInput,
  hasPassword,
  isAuthCaptchaEnabled,
  isDeleting,
  onCancel,
  onCaptchaTokenChange,
  onDeleteInputChange,
  onSubmit,
}: {
  captchaResetKey: number;
  captchaToken: string;
  deleteError: string | null;
  deleteInput: string;
  hasPassword: boolean;
  isAuthCaptchaEnabled: boolean;
  isDeleting: boolean;
  onCancel: () => void;
  onCaptchaTokenChange: (token: string) => void;
  onDeleteInputChange: (value: string) => void;
  onSubmit: React.SubmitEventHandler<HTMLFormElement>;
}) {
  return (
    <div
      aria-labelledby="delete-account-title"
      aria-modal="true"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
    >
      <div className="bg-synth-surface border border-red-500/30 rounded-lg w-full max-w-md overflow-hidden shadow-card flex flex-col">
        <div className="p-6 border-b border-synth-border flex justify-between items-center bg-red-500/10">
          <h3
            id="delete-account-title"
            className="text-red-400 font-bold flex items-center gap-2"
          >
            <AlertOctagon className="w-5 h-5" /> Delete Account
          </h3>
          <button
            aria-label="Close delete account dialog"
            disabled={isDeleting}
            onClick={onCancel}
            type="button"
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-gray-300 text-sm mb-6 leading-relaxed">
            This action is{" "}
            <span className="text-red-400 font-bold">
              permanent and irreversible
            </span>
            . Your profile, social activity, active sessions, and uploaded
            account files will be removed. Sign in again first if your session
            is older than 10 minutes.
          </p>

          {deleteError && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
              {deleteError}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                {hasPassword
                  ? "Enter Password to confirm"
                  : "Type 'DELETE' to confirm"}
              </label>
              <input
                type={hasPassword ? "password" : "text"}
                value={deleteInput}
                onChange={(event) => onDeleteInputChange(event.target.value)}
                placeholder={hasPassword ? "Your password" : "DELETE"}
                required
                disabled={isDeleting}
                className="w-full bg-synth-bg border border-synth-border text-white rounded-lg px-4 py-3 focus:outline-none focus:border-red-500 transition-all"
              />
            </div>

            {hasPassword && (
              <AuthCaptcha
                onTokenChange={onCaptchaTokenChange}
                resetKey={captchaResetKey}
              />
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                disabled={isDeleting}
                onClick={onCancel}
                className="px-5 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-synth-elevated transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isDeleting ||
                  !deleteInput ||
                  (hasPassword && isAuthCaptchaEnabled && !captchaToken)
                }
                className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition-colors font-bold flex items-center gap-2"
              >
                {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete Forever
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
