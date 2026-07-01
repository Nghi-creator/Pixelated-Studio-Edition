import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { createCroppedAvatar, type CropArea } from "./avatarCrop";
import type { ProfileMessage } from "./profileSettingsTypes";
import { validateAvatarFile } from "./profileMutations";

export function useProfileAvatar({
  setProfileMessage,
}: {
  setProfileMessage: (message: ProfileMessage | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] =
    useState<CropArea | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

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
  };

  const onCropComplete = useCallback(
    (_croppedArea: CropArea, nextCroppedAreaPixels: CropArea) => {
      setCroppedAreaPixels(nextCroppedAreaPixels);
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

  const commitSavedAvatar = (nextAvatarUrl: string) => {
    setAvatarUrl(nextAvatarUrl);
    setAvatarFile(null);
    setPreviewUrl(null);
  };

  return {
    avatarFile,
    avatarUrl,
    commitSavedAvatar,
    crop,
    displayAvatar: previewUrl || avatarUrl,
    fileInputRef,
    handleCropConfirm,
    handleFileSelect,
    imageSrc,
    isCropping,
    onCropComplete,
    setAvatarUrl,
    setCrop,
    setShowCropper,
    setZoom,
    showCropper,
    zoom,
  };
}
