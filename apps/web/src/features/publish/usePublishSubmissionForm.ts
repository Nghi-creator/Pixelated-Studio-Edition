import { useState } from "react";
import type { ChangeEvent, Dispatch, FormEvent, SetStateAction } from "react";
import { api, getAuthSession } from "../../lib/api/apiClient";
import { supabase } from "../../lib/auth/supabaseClient";
import {
  getPublishErrorMessage,
  submitGameForReview,
  validateRomFile,
  validateSubmissionImageFile,
} from "./publishSubmission";

export type PublishFileErrorKey = "banner" | "cover" | "rom";

export function usePublishSubmissionForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<
    Partial<Record<PublishFileErrorKey, string>>
  >({});
  const [authorName, setAuthorName] = useState("");
  const [email, setEmail] = useState("");
  const [gameTitle, setGameTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assetLicenseSpdx, setAssetLicenseSpdx] = useState("");
  const [attributionText, setAttributionText] = useState("");
  const [codeLicenseSpdx, setCodeLicenseSpdx] = useState("");
  const [hostingConfirmed, setHostingConfirmed] = useState(false);
  const [hostingPermission, setHostingPermission] = useState("");
  const [licenseUrl, setLicenseUrl] = useState("");
  const [noReleaseUrlExplanation, setNoReleaseUrlExplanation] = useState("");
  const [originalReleaseUrl, setOriginalReleaseUrl] = useState("");
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [ownershipStatus, setOwnershipStatus] = useState("");
  const [permissionEvidenceUrl, setPermissionEvidenceUrl] = useState("");
  const [publicLicenseScope, setPublicLicenseScope] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [rightsNotes, setRightsNotes] = useState("");
  const [sourceRepoUrl, setSourceRepoUrl] = useState("");
  const [thirdPartyContent, setThirdPartyContent] = useState("");
  const [romFile, setRomFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  const handleRomChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const error = validateRomFile(file);
      if (error) {
        setRomFile(null);
        setFileErrors((current) => ({ ...current, rom: error }));
        e.target.value = "";
        return;
      }
      setFileErrors((current) => ({ ...current, rom: undefined }));
      setFormError(null);
      setRomFile(file);
    }
  };

  const handleImageChange = (
    e: ChangeEvent<HTMLInputElement>,
    errorKey: Exclude<PublishFileErrorKey, "rom">,
    setter: Dispatch<SetStateAction<File | null>>,
  ) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const error = validateSubmissionImageFile(file);
      if (error) {
        setter(null);
        setFileErrors((current) => ({ ...current, [errorKey]: error }));
        e.target.value = "";
        return;
      }
      setFileErrors((current) => ({ ...current, [errorKey]: undefined }));
      setFormError(null);
      setter(file);
    }
  };

  const uploadToSupabase = async (file: File, path: string) => {
    const { error } = await supabase.storage
      .from("submissions")
      .upload(path, file);
    if (error) throw error;

    const { data } = supabase.storage.from("submissions").getPublicUrl(path);
    return data.publicUrl;
  };

  const removeSubmissionFiles = async (paths: string[]) => {
    const { error } = await supabase.storage.from("submissions").remove(paths);
    if (error) throw error;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    const romError = validateRomFile(romFile);
    if (romError) {
      setFileErrors((current) => ({ ...current, rom: romError }));
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const session = await getAuthSession();

      if (!session) {
        setFormError("Please sign in before submitting a game.");
        return;
      }

      await submitGameForReview({
        createSubmission: api.submitGame,
        fields: {
          authorName,
          assetLicenseSpdx,
          attributionText,
          codeLicenseSpdx,
          description,
          email,
          gameTitle,
          hostingConfirmed,
          hostingPermission,
          licenseUrl,
          noReleaseUrlExplanation,
          originalReleaseUrl,
          ownershipConfirmed,
          ownershipStatus,
          permissionEvidenceUrl,
          publicLicenseScope,
          rightsConfirmed,
          rightsNotes,
          sourceRepoUrl,
          thirdPartyContent,
        },
        files: {
          bannerFile,
          coverFile,
          romFile,
        },
        removeFiles: removeSubmissionFiles,
        uploadFile: uploadToSupabase,
        userId: session.user.id,
      });

      setIsSuccess(true);
    } catch (error: unknown) {
      console.error("Submission error:", error);
      setFormError(
        getPublishErrorMessage(
          error,
          "Failed to submit game. Check the highlighted files and try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    authorName,
    assetLicenseSpdx,
    attributionText,
    bannerFile,
    codeLicenseSpdx,
    coverFile,
    description,
    email,
    fileErrors,
    formError,
    gameTitle,
    handleImageChange,
    handleRomChange,
    handleSubmit,
    hostingConfirmed,
    hostingPermission,
    isSubmitting,
    isSuccess,
    licenseUrl,
    noReleaseUrlExplanation,
    originalReleaseUrl,
    ownershipConfirmed,
    ownershipStatus,
    permissionEvidenceUrl,
    publicLicenseScope,
    rightsConfirmed,
    rightsNotes,
    romFile,
    setAssetLicenseSpdx,
    setAttributionText,
    setAuthorName,
    setBannerFile,
    setCodeLicenseSpdx,
    setCoverFile,
    setDescription,
    setEmail,
    setGameTitle,
    setHostingConfirmed,
    setHostingPermission,
    setLicenseUrl,
    setNoReleaseUrlExplanation,
    setOriginalReleaseUrl,
    setOwnershipConfirmed,
    setOwnershipStatus,
    setPermissionEvidenceUrl,
    setPublicLicenseScope,
    setRightsConfirmed,
    setRightsNotes,
    setSourceRepoUrl,
    setThirdPartyContent,
    sourceRepoUrl,
    thirdPartyContent,
  };
}
