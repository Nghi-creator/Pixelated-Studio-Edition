import React, { useState } from "react";
import {
  Send,
  ArrowLeft,
  Loader2,
  CheckCircle,
  Image as ImageIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/auth/supabaseClient";
import { api, getAuthSession } from "../../lib/api/apiClient";
import {
  getPublishErrorMessage,
  submitGameForReview,
  validateRomFile,
  validateSubmissionImageFile,
} from "../../features/publish/publishSubmission";
import { PixelIcon } from "../../components/ui/PixelIcon";

type FileErrorKey = "banner" | "cover" | "rom";

export default function Publish() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<
    Partial<Record<FileErrorKey, string>>
  >({});

  // Form State
  const [authorName, setAuthorName] = useState("");
  const [email, setEmail] = useState("");
  const [gameTitle, setGameTitle] = useState("");
  const [description, setDescription] = useState("");

  // File State
  const [romFile, setRomFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  const handleRomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    e: React.ChangeEvent<HTMLInputElement>,
    errorKey: Exclude<FileErrorKey, "rom">,
    setter: React.Dispatch<React.SetStateAction<File | null>>,
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

  const uploadToSupabase = async (
    file: File,
    path: string,
  ) => {
    const { error } = await supabase.storage
      .from("submissions")
      .upload(path, file);
    if (error) throw error;

    const { data } = supabase.storage
      .from("submissions")
      .getPublicUrl(path);
    return data.publicUrl;
  };

  const removeSubmissionFiles = async (paths: string[]) => {
    const { error } = await supabase.storage.from("submissions").remove(paths);
    if (error) throw error;
  };

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
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
          description,
          email,
          gameTitle,
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

  if (isSuccess) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-32 w-full min-h-screen flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-synth-surface rounded-lg flex items-center justify-center mb-6 border border-synth-border">
          <PixelIcon className="h-10 w-10 text-synth-secondary" name="publish" />
        </div>
        <h2 className="text-4xl font-extrabold text-white mb-4">
          Application Received!
        </h2>
        <p className="text-gray-400 text-lg mb-8 max-w-lg">
          Your game has been securely uploaded to our vault. Our moderation team
          will review it, and if approved, you will receive your Developer Badge
          and your game will go live.
        </p>
        <Link
          to="/"
          className="bg-synth-surface border border-synth-border hover:bg-synth-elevated text-white font-bold py-3 px-8 rounded-lg transition-colors"
        >
          Return to Library
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 w-full min-h-screen">
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-synth-secondary transition-colors font-medium group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          Back to Library
        </Link>
      </div>

      <div className="mb-10">
        <h2 className="text-3xl font-extrabold text-white">
          Developer Program
        </h2>
        <p className="text-gray-400 mt-2 flex items-center gap-2 text-lg">
          Publish your homebrew creations to our global cloud.
        </p>
      </div>

      <div className="bg-synth-surface border border-synth-border rounded-lg p-8 shadow-card">
        <p className="text-gray-300 mb-8 leading-relaxed">
          Are you a retro developer? Test your{" "}
          <code className="text-synth-secondary bg-synth-bg px-2 py-1 rounded">
            .nes
          </code>{" "}
          games in our Local Vault for free, or apply below to have them
          published to the official PIXELATED Cloud Library. Approved developers
          will receive a Verified Dev badge. We're happy to feature your work!
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {formError && (
            <div
              className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
              role="alert"
            >
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide"
                htmlFor="publish-author"
              >
                Developer Name{" "}
                <span className="text-synth-secondary ml-1">*</span>
              </label>
              <input
                id="publish-author"
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                required
                disabled={isSubmitting}
                className="w-full bg-synth-bg border border-synth-border text-white rounded-xl px-4 py-3 focus:outline-none focus:border-synth-secondary transition-colors"
                placeholder="Studio or Creator Name"
              />
            </div>
            <div>
              <label
                className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide"
                htmlFor="publish-email"
              >
                Contact Email <span className="text-synth-secondary ml-1">*</span>
              </label>
              <input
                id="publish-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
                className="w-full bg-synth-bg border border-synth-border text-white rounded-xl px-4 py-3 focus:outline-none focus:border-synth-secondary transition-colors"
                placeholder="you@domain.com"
              />
            </div>
          </div>

          <div>
            <label
              className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide"
              htmlFor="publish-title"
            >
              Game Title <span className="text-synth-secondary ml-1">*</span>
            </label>
            <input
              id="publish-title"
              type="text"
              value={gameTitle}
              onChange={(e) => setGameTitle(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full bg-synth-bg border border-synth-border text-white rounded-xl px-4 py-3 focus:outline-none focus:border-synth-secondary transition-colors"
              placeholder="Epic Quest 198X"
            />
          </div>

          <div>
            <label
              className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide"
              htmlFor="publish-rom"
            >
              ROM File (.nes) <span className="text-synth-secondary ml-1">*</span>
            </label>
            <div
              className={`relative w-full h-14 bg-synth-bg border-2 border-dashed rounded-xl flex items-center justify-center transition-colors group cursor-pointer overflow-hidden ${
                fileErrors.rom
                  ? "border-red-400"
                  : romFile
                    ? "border-synth-primary"
                    : "border-synth-border hover:border-synth-secondary"
              }`}
            >
              <input
                id="publish-rom"
                type="file"
                accept=".nes"
                onChange={handleRomChange}
                required
                disabled={isSubmitting}
                aria-describedby={fileErrors.rom ? "publish-rom-error" : undefined}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div
                className={`flex items-center gap-2 transition-colors ${romFile ? "text-synth-secondary" : "text-gray-400 group-hover:text-synth-secondary"}`}
              >
                {romFile ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <PixelIcon className="h-5 w-5" name="upload" />
                )}
                <span className="font-medium text-sm">
                  {romFile ? romFile.name : "Click to attach .nes file"}
                </span>
              </div>
            </div>
            {fileErrors.rom && (
              <p id="publish-rom-error" className="mt-2 text-sm text-red-300">
                {fileErrors.rom}
              </p>
            )}
          </div>

          {/* OPTIONAL ART UPLOADS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide"
                htmlFor="publish-cover"
              >
                Cover Art{" "}
                <span className="text-gray-500 font-normal lowercase">
                  (optional)
                </span>
              </label>
              <div
                className={`relative w-full h-14 bg-synth-bg border-2 border-dashed rounded-xl flex items-center justify-center transition-colors group cursor-pointer overflow-hidden ${
                  fileErrors.cover
                    ? "border-red-400"
                    : coverFile
                      ? "border-synth-secondary"
                      : "border-synth-border hover:border-synth-secondary"
                }`}
              >
                <input
                  id="publish-cover"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageChange(e, "cover", setCoverFile)}
                  disabled={isSubmitting}
                  aria-describedby={
                    fileErrors.cover ? "publish-cover-error" : undefined
                  }
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div
                  className={`flex items-center gap-2 transition-colors ${coverFile ? "text-synth-secondary" : "text-gray-500 group-hover:text-synth-secondary"}`}
                >
                  {coverFile ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <ImageIcon className="w-4 h-4" />
                  )}
                  <span className="font-medium text-sm truncate px-2">
                    {coverFile ? coverFile.name : "Upload Cover Image"}
                  </span>
                </div>
              </div>
              {fileErrors.cover && (
                <p id="publish-cover-error" className="mt-2 text-sm text-red-300">
                  {fileErrors.cover}
                </p>
              )}
            </div>

            <div>
              <label
                className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide"
                htmlFor="publish-banner"
              >
                Banner Art{" "}
                <span className="text-gray-500 font-normal lowercase">
                  (optional)
                </span>
              </label>
              <div
                className={`relative w-full h-14 bg-synth-bg border-2 border-dashed rounded-xl flex items-center justify-center transition-colors group cursor-pointer overflow-hidden ${
                  fileErrors.banner
                    ? "border-red-400"
                    : bannerFile
                      ? "border-synth-secondary"
                      : "border-synth-border hover:border-synth-secondary"
                }`}
              >
                <input
                  id="publish-banner"
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    handleImageChange(e, "banner", setBannerFile)
                  }
                  disabled={isSubmitting}
                  aria-describedby={
                    fileErrors.banner ? "publish-banner-error" : undefined
                  }
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div
                  className={`flex items-center gap-2 transition-colors ${bannerFile ? "text-synth-secondary" : "text-gray-500 group-hover:text-synth-secondary"}`}
                >
                  {bannerFile ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <ImageIcon className="w-4 h-4" />
                  )}
                  <span className="font-medium text-sm truncate px-2">
                    {bannerFile ? bannerFile.name : "Upload Banner Image"}
                  </span>
                </div>
              </div>
              {fileErrors.banner && (
                <p
                  id="publish-banner-error"
                  className="mt-2 text-sm text-red-300"
                >
                  {fileErrors.banner}
                </p>
              )}
            </div>
          </div>

          <div>
            <label
              className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide"
              htmlFor="publish-description"
            >
              Game Description{" "}
              <span className="text-gray-500 font-normal lowercase">
                (optional)
              </span>
            </label>
            <textarea
              id="publish-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              disabled={isSubmitting}
              className="w-full bg-synth-bg border border-synth-border text-white rounded-xl px-4 py-3 focus:outline-none focus:border-synth-secondary transition-colors resize-none"
              placeholder="Tell us about your game and controls..."
            ></textarea>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-synth-primary hover:bg-synth-primary-hover text-white font-bold text-lg py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Uploading to
                Vault...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" /> Submit for Review
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
