import {
  Send,
  ArrowLeft,
  Loader2,
  CheckCircle,
  Image as ImageIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PixelIcon } from "../../components/ui/PixelIcon";
import { PublishFileField } from "../../features/publish/PublishFileField";
import { usePublishSubmissionForm } from "../../features/publish/usePublishSubmissionForm";

export default function Publish() {
  const {
    authorName,
    bannerFile,
    coverFile,
    description,
    email,
    fileErrors,
    formError,
    gameTitle,
    handleImageChange,
    handleRomChange,
    handleSubmit,
    isSubmitting,
    isSuccess,
    romFile,
    setAuthorName,
    setBannerFile,
    setCoverFile,
    setDescription,
    setEmail,
    setGameTitle,
  } = usePublishSubmissionForm();

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

          <PublishFileField
            accept=".nes"
            describedBy={fileErrors.rom ? "publish-rom-error" : undefined}
            disabled={isSubmitting}
            error={fileErrors.rom}
            file={romFile}
            icon={
              romFile ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <PixelIcon className="h-5 w-5" name="upload" />
              )
            }
            id="publish-rom"
            label={
              <>
                ROM File (.nes){" "}
                <span className="text-synth-secondary ml-1">*</span>
              </>
            }
            onChange={handleRomChange}
            placeholder="Click to attach .nes file"
            required
            selectedBorderClass="border-synth-primary"
          />

          {/* OPTIONAL ART UPLOADS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <PublishFileField
              accept="image/*"
              describedBy={
                fileErrors.cover ? "publish-cover-error" : undefined
              }
              disabled={isSubmitting}
              error={fileErrors.cover}
              file={coverFile}
              icon={
                coverFile ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <ImageIcon className="w-4 h-4" />
                )
              }
              id="publish-cover"
              label={
                <>
                  Cover Art{" "}
                  <span className="text-gray-500 font-normal lowercase">
                    (optional)
                  </span>
                </>
              }
              onChange={(e) => handleImageChange(e, "cover", setCoverFile)}
              placeholder="Upload Cover Image"
              selectedBorderClass="border-synth-secondary"
            />

            <PublishFileField
              accept="image/*"
              describedBy={
                fileErrors.banner ? "publish-banner-error" : undefined
              }
              disabled={isSubmitting}
              error={fileErrors.banner}
              file={bannerFile}
              icon={
                bannerFile ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <ImageIcon className="w-4 h-4" />
                )
              }
              id="publish-banner"
              label={
                <>
                  Banner Art{" "}
                  <span className="text-gray-500 font-normal lowercase">
                    (optional)
                  </span>
                </>
              }
              onChange={(e) => handleImageChange(e, "banner", setBannerFile)}
              placeholder="Upload Banner Image"
              selectedBorderClass="border-synth-secondary"
            />
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
