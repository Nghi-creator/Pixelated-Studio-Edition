import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Send,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PixelIcon } from "../../components/ui/PixelIcon";
import { PublishFileField } from "../../features/publish/PublishFileField";
import {
  getSubmissionRightsErrors,
  SUPPORTED_SUBMISSION_ROM_LABEL,
} from "../../features/publish/publishSubmission";
import { usePublishSubmissionForm } from "../../features/publish/usePublishSubmissionForm";

const steps = ["Basics", "Files", "Rights", "Evidence"];
const inputClassName =
  "w-full rounded-lg border border-synth-border bg-synth-bg px-4 py-3 text-white outline-none transition-colors placeholder:text-gray-500 focus:border-synth-secondary disabled:opacity-60";
const labelClassName =
  "mb-2 block text-sm font-extrabold uppercase tracking-wide text-white";
const publishColor = {
  active: "#BC7490",
  activeBorder: "#E0A3BB",
  disabled: "#6B364A",
  disabledBorder: "#7A4257",
  disabledText: "#D7C3CB",
} as const;

type ChoiceOption = {
  description: string;
  label: string;
  value: string;
};

type PublishActionButtonProps = {
  children: ReactNode;
  disabled: boolean;
  onClick?: () => void;
  type: "button" | "submit";
};

function publishButtonStyle(disabled: boolean) {
  return {
    backgroundColor: disabled ? publishColor.disabled : publishColor.active,
    borderColor: disabled ? publishColor.disabledBorder : publishColor.activeBorder,
    color: disabled ? publishColor.disabledText : "#FFFFFF",
  };
}

function PublishActionButton({
  children,
  disabled,
  onClick,
  type,
}: PublishActionButtonProps) {
  return (
    <button
      className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border px-6 font-bold transition-colors disabled:pointer-events-none disabled:cursor-default"
      disabled={disabled}
      onClick={onClick}
      style={publishButtonStyle(disabled)}
      type={type}
    >
      {children}
    </button>
  );
}

function PublishProgress({ step }: { step: number }) {
  return (
    <div className="mb-6 rounded-lg border border-synth-border bg-synth-surface p-4 shadow-card">
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-synth-bg">
        <div
          aria-hidden
          className="h-full rounded-full transition-all"
          style={{
            backgroundColor: publishColor.active,
            width: `${((step + 1) / steps.length) * 100}%`,
          }}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {steps.map((name, index) => {
          const isReached = index <= step;
          return (
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-extrabold ${
                isReached ? "text-white" : "text-gray-500"
              }`}
              key={name}
              style={
                isReached
                  ? {
                      backgroundColor: publishColor.active,
                    }
                  : undefined
              }
            >
              {index < step && <CheckCircle className="h-4 w-4 flex-shrink-0" />}
              {name}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FieldLabel({
  children,
  optional = false,
}: {
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <label className={labelClassName}>
      {children}
      {optional ? (
        <span className="ml-2 text-xs font-semibold lowercase text-gray-400">
          optional
        </span>
      ) : (
        <span className="ml-1 text-synth-secondary">*</span>
      )}
    </label>
  );
}

function ChoiceGroup({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  options: ChoiceOption[];
  value: string;
}) {
  return (
    <fieldset>
      <legend className={labelClassName}>{label}</legend>
      <div className="grid gap-3 md:grid-cols-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              className={`rounded-lg border p-4 text-left outline-none transition-colors focus:ring-2 focus:ring-[#E0A3BB] ${
                selected
                  ? "text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
                  : "border-synth-border bg-synth-bg/70 text-gray-200 hover:border-synth-secondary/70"
              } disabled:cursor-not-allowed disabled:opacity-60`}
              disabled={disabled}
              key={option.value}
              onClick={() => onChange(option.value)}
              style={
                selected
                  ? {
                      backgroundColor: publishColor.active,
                      borderColor: publishColor.activeBorder,
                    }
                  : undefined
              }
              type="button"
            >
              <span className="flex items-center gap-2 text-sm font-extrabold text-white">
                {selected && <CheckCircle className="h-4 w-4 text-white" />}
                {option.label}
              </span>
              <span className="mt-2 block text-sm font-medium leading-6 text-gray-300">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function CheckboxField({
  checked,
  children,
  disabled,
  onChange,
}: {
  checked: boolean;
  children: ReactNode;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex gap-3 rounded-lg border border-synth-border bg-synth-bg/70 p-4 text-sm font-semibold leading-6 text-white">
      <input
        checked={checked}
        className="mt-1 h-4 w-4 accent-synth-secondary"
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>{children}</span>
    </label>
  );
}

export default function Publish() {
  const form = usePublishSubmissionForm();
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState("");
  const rightsFields = {
    authorName: form.authorName,
    assetLicenseSpdx: form.assetLicenseSpdx,
    attributionText: form.attributionText,
    codeLicenseSpdx: form.codeLicenseSpdx,
    description: form.description,
    email: form.email,
    gameTitle: form.gameTitle,
    hostingConfirmed: form.hostingConfirmed,
    hostingPermission: form.hostingPermission,
    licenseUrl: form.licenseUrl,
    noReleaseUrlExplanation: form.noReleaseUrlExplanation,
    originalReleaseUrl: form.originalReleaseUrl,
    ownershipConfirmed: form.ownershipConfirmed,
    ownershipStatus: form.ownershipStatus,
    permissionEvidenceUrl: form.permissionEvidenceUrl,
    publicLicenseScope: form.publicLicenseScope,
    rightsConfirmed: form.rightsConfirmed,
    rightsNotes: form.rightsNotes,
    sourceRepoUrl: form.sourceRepoUrl,
    thirdPartyContent: form.thirdPartyContent,
  };

  const validateStep = (targetStep = step) => {
    if (targetStep === 0) {
      if (!form.authorName.trim() || !form.email.trim() || !form.gameTitle.trim()) {
        return "Add developer name, contact email, and game title.";
      }
    }
    if (targetStep === 1 && !form.romFile) {
      return "Attach a supported ROM file.";
    }
    if (targetStep === 2) {
      const missingQuestion = [
        form.ownershipStatus,
        form.hostingPermission,
        form.thirdPartyContent,
        form.publicLicenseScope,
      ].some((value) => !value);
      if (missingQuestion) return "Answer each rights question before continuing.";
      if (form.hostingPermission === "not_sure") {
        return "Pixelated needs clear hosting permission before review.";
      }
    }
    if (targetStep === 3) {
      const errors = getSubmissionRightsErrors(rightsFields);
      return errors[0] || "";
    }
    return "";
  };

  const goNext = () => {
    const error = validateStep();
    if (error) {
      setStepError(error);
      return;
    }
    setStepError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const goBack = () => {
    setStepError("");
    setStep((current) => Math.max(current - 1, 0));
  };

  if (form.isSuccess) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center px-4 py-32 text-center sm:px-6 lg:px-8">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-lg border border-synth-border bg-synth-surface">
          <PixelIcon className="h-10 w-10 text-synth-secondary" name="publish" />
        </div>
        <h2 className="mb-4 text-4xl font-extrabold text-white">
          Application Received!
        </h2>
        <p className="mb-8 max-w-lg text-lg text-gray-300">
          Your game and rights answers were submitted for review. Our moderation
          team will verify the details before anything goes public.
        </p>
        <Link
          className="rounded-lg border border-synth-border bg-synth-surface px-8 py-3 font-bold text-white transition-colors hover:bg-synth-elevated"
          to="/"
        >
          Return to Library
        </Link>
      </div>
    );
  }

  const needsCodeLicense = ["code", "everything"].includes(
    form.publicLicenseScope,
  );
  const needsAssetLicense = ["assets", "everything"].includes(
    form.publicLicenseScope,
  );
  const needsPermissionEvidence = form.ownershipStatus === "permission";
  const needsSourceEvidence =
    form.ownershipStatus === "public_project" ||
    form.hostingPermission === "license_allows" ||
    !["", "none_owned", "not_sure"].includes(form.publicLicenseScope);
  const needsThirdPartyNotes = ["yes", "not_sure"].includes(
    form.thirdPartyContent,
  );
  const currentStepError = validateStep(step);
  const canContinue = !currentStepError && !form.isSubmitting;
  const canSubmit = !validateStep(3) && !form.isSubmitting;
  const visibleError = currentStepError ? stepError : form.formError || "";
  const backDisabled = step === 0 || form.isSubmitting;

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link
          className="group inline-flex items-center gap-2 font-medium text-gray-300 transition-colors hover:text-synth-secondary"
          to="/"
        >
          <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
          Back to Library
        </Link>
      </div>

      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-extrabold text-white">
            Submit a Game
          </h1>
          <p className="mt-2 max-w-2xl text-lg text-gray-300">
            Send your homebrew build for cloud library review. We ask rights
            questions up front so admins can verify instead of guessing.
          </p>
        </div>
        <div className="rounded-full border border-synth-secondary/70 bg-synth-secondary/20 px-4 py-2 text-sm font-extrabold text-white">
          Step {step + 1} of {steps.length}
        </div>
      </div>

      <PublishProgress step={step} />

      <form
        className="rounded-lg border border-synth-border bg-synth-surface p-6 shadow-card md:p-8"
        onSubmit={(event) => {
          const error = validateStep(3);
          if (error) {
            event.preventDefault();
            setStep(3);
            setStepError(error);
            return;
          }
          setStepError("");
          void form.handleSubmit(event);
        }}
      >
        {visibleError && (
          <div
            className="mb-6 rounded-lg border border-red-300 bg-red-700/80 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-red-950/30"
            role="alert"
          >
            {visibleError}
          </div>
        )}

        {step === 0 && (
          <section className="space-y-6">
            <h2 className="text-2xl font-extrabold text-white">Creator Basics</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <FieldLabel>Developer Name</FieldLabel>
                <input
                  className={inputClassName}
                  disabled={form.isSubmitting}
                  onChange={(event) => form.setAuthorName(event.target.value)}
                  placeholder="Studio or creator name"
                  value={form.authorName}
                />
              </div>
              <div>
                <FieldLabel>Contact Email</FieldLabel>
                <input
                  className={inputClassName}
                  disabled={form.isSubmitting}
                  onChange={(event) => form.setEmail(event.target.value)}
                  placeholder="you@domain.com"
                  type="email"
                  value={form.email}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Game Title</FieldLabel>
              <input
                className={inputClassName}
                disabled={form.isSubmitting}
                onChange={(event) => form.setGameTitle(event.target.value)}
                placeholder="Epic Quest 198X"
                value={form.gameTitle}
              />
            </div>
            <div>
              <FieldLabel optional>Game Description</FieldLabel>
              <textarea
                className={`${inputClassName} min-h-32 resize-none`}
                disabled={form.isSubmitting}
                onChange={(event) => form.setDescription(event.target.value)}
                placeholder="Tell us about the game, controls, and what makes it worth featuring."
                value={form.description}
              />
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="space-y-6">
            <h2 className="text-2xl font-extrabold text-white">
              Upload Build and Artwork
            </h2>
            <PublishFileField
              accept=".nes,.gb,.gbc,.gba,.sfc,.smc,.md,.gen,.sms,.gg"
              describedBy={form.fileErrors.rom ? "publish-rom-error" : undefined}
              disabled={form.isSubmitting}
              error={form.fileErrors.rom}
              file={form.romFile}
              icon={
                form.romFile ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <PixelIcon className="h-5 w-5" name="upload" />
                )
              }
              id="publish-rom"
              label={
                <>
                  ROM File <span className="ml-1 text-synth-secondary">*</span>
                </>
              }
              onChange={form.handleRomChange}
              placeholder={`Attach ${SUPPORTED_SUBMISSION_ROM_LABEL}`}
              required
              selectedBorderClass="border-synth-primary"
            />
            <div className="grid gap-6 md:grid-cols-2">
              <PublishFileField
                accept="image/*"
                describedBy={
                  form.fileErrors.cover ? "publish-cover-error" : undefined
                }
                disabled={form.isSubmitting}
                error={form.fileErrors.cover}
                file={form.coverFile}
                icon={
                  form.coverFile ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )
                }
                id="publish-cover"
                label={
                  <>
                    Cover Art{" "}
                    <span className="font-normal lowercase text-gray-500">
                      optional
                    </span>
                  </>
                }
                onChange={(event) =>
                  form.handleImageChange(event, "cover", form.setCoverFile)
                }
                placeholder="Upload cover image"
                selectedBorderClass="border-synth-secondary"
              />
              <PublishFileField
                accept="image/*"
                describedBy={
                  form.fileErrors.banner ? "publish-banner-error" : undefined
                }
                disabled={form.isSubmitting}
                error={form.fileErrors.banner}
                file={form.bannerFile}
                icon={
                  form.bannerFile ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )
                }
                id="publish-banner"
                label={
                  <>
                    Banner Art{" "}
                    <span className="font-normal lowercase text-gray-500">
                      optional
                    </span>
                  </>
                }
                onChange={(event) =>
                  form.handleImageChange(event, "banner", form.setBannerFile)
                }
                placeholder="Upload banner image"
                selectedBorderClass="border-synth-secondary"
              />
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-6">
            <h2 className="text-2xl font-extrabold text-white">
              Rights Questions
            </h2>
            <ChoiceGroup
              disabled={form.isSubmitting}
              label="Who owns or controls this game?"
              onChange={form.setOwnershipStatus}
              options={[
                {
                  description: "You or your team made the game and can submit it.",
                  label: "I created it",
                  value: "creator",
                },
                {
                  description: "You have permission from the creator or rights holder.",
                  label: "I have permission",
                  value: "permission",
                },
                {
                  description: "It comes from a public project or public release.",
                  label: "Public project",
                  value: "public_project",
                },
                {
                  description: "The situation needs extra explanation.",
                  label: "Other",
                  value: "other",
                },
              ]}
              value={form.ownershipStatus}
            />
            <ChoiceGroup
              disabled={form.isSubmitting}
              label="How can Pixelated host the playable build?"
              onChange={form.setHostingPermission}
              options={[
                {
                  description: "You explicitly allow Pixelated to host it for review and the non-commercial library.",
                  label: "I give permission",
                  value: "creator_permission",
                },
                {
                  description: "A public license allows Pixelated to host it.",
                  label: "The license allows it",
                  value: "license_allows",
                },
                {
                  description: "You are not sure yet. This cannot be submitted until clarified.",
                  label: "Not sure",
                  value: "not_sure",
                },
              ]}
              value={form.hostingPermission}
            />
            <ChoiceGroup
              disabled={form.isSubmitting}
              label="Does it use third-party code, art, music, sound, or ROM content?"
              onChange={form.setThirdPartyContent}
              options={[
                {
                  description: "Everything in the submitted build is yours or your team's.",
                  label: "No",
                  value: "no",
                },
                {
                  description: "Some content came from another creator, library, pack, or project.",
                  label: "Yes",
                  value: "yes",
                },
                {
                  description: "You are unsure whether every included piece is yours.",
                  label: "Not sure",
                  value: "not_sure",
                },
              ]}
              value={form.thirdPartyContent}
            />
            <ChoiceGroup
              disabled={form.isSubmitting}
              label="Is there a public license?"
              onChange={form.setPublicLicenseScope}
              options={[
                {
                  description: "No formal public license; you own it and grant Pixelated hosting permission.",
                  label: "No formal license",
                  value: "none_owned",
                },
                {
                  description: "A public license applies to the source/code.",
                  label: "Code license",
                  value: "code",
                },
                {
                  description: "A public license applies to the art/audio/assets.",
                  label: "Asset license",
                  value: "assets",
                },
                {
                  description: "One public license applies to the whole game.",
                  label: "Whole game license",
                  value: "everything",
                },
                {
                  description: "You do not know the exact license yet.",
                  label: "Not sure",
                  value: "not_sure",
                },
              ]}
              value={form.publicLicenseScope}
            />
          </section>
        )}

        {step === 3 && (
          <section className="space-y-6">
            <h2 className="text-2xl font-extrabold text-white">
              Evidence and Confirmation
            </h2>
            <div>
              <FieldLabel>Attribution Text</FieldLabel>
              <textarea
                className={`${inputClassName} min-h-24 resize-none`}
                disabled={form.isSubmitting}
                onChange={(event) => form.setAttributionText(event.target.value)}
                placeholder="How should Pixelated credit the game?"
                value={form.attributionText}
              />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <FieldLabel>Original Release URL</FieldLabel>
                <input
                  className={inputClassName}
                  disabled={form.isSubmitting}
                  onChange={(event) =>
                    form.setOriginalReleaseUrl(event.target.value)
                  }
                  placeholder="https://creator.example/game"
                  value={form.originalReleaseUrl}
                />
              </div>
              <div>
                <FieldLabel optional>If There Is No Release URL</FieldLabel>
                <input
                  className={inputClassName}
                  disabled={form.isSubmitting}
                  onChange={(event) =>
                    form.setNoReleaseUrlExplanation(event.target.value)
                  }
                  placeholder="Private build, unreleased jam game, etc."
                  value={form.noReleaseUrlExplanation}
                />
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <FieldLabel optional={!needsSourceEvidence}>
                  Source or Evidence URL
                </FieldLabel>
                <input
                  className={inputClassName}
                  disabled={form.isSubmitting}
                  onChange={(event) => form.setSourceRepoUrl(event.target.value)}
                  placeholder="Source repo, project page, or license evidence"
                  value={form.sourceRepoUrl}
                />
              </div>
              <div>
                <FieldLabel optional>License URL</FieldLabel>
                <input
                  className={inputClassName}
                  disabled={form.isSubmitting}
                  onChange={(event) => form.setLicenseUrl(event.target.value)}
                  placeholder="https://example.com/license"
                  value={form.licenseUrl}
                />
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <FieldLabel optional={!needsCodeLicense}>
                  Code License SPDX
                </FieldLabel>
                <input
                  className={inputClassName}
                  disabled={form.isSubmitting}
                  onChange={(event) =>
                    form.setCodeLicenseSpdx(event.target.value)
                  }
                  placeholder="MIT, GPL-3.0-only, MPL-2.0"
                  value={form.codeLicenseSpdx}
                />
              </div>
              <div>
                <FieldLabel optional={!needsAssetLicense}>
                  Asset License SPDX
                </FieldLabel>
                <input
                  className={inputClassName}
                  disabled={form.isSubmitting}
                  onChange={(event) =>
                    form.setAssetLicenseSpdx(event.target.value)
                  }
                  placeholder="CC-BY-4.0, CC0-1.0"
                  value={form.assetLicenseSpdx}
                />
              </div>
            </div>
            <div>
              <FieldLabel optional={!needsPermissionEvidence}>
                Permission Evidence URL
              </FieldLabel>
              <input
                className={inputClassName}
                disabled={form.isSubmitting}
                onChange={(event) =>
                  form.setPermissionEvidenceUrl(event.target.value)
                }
                placeholder="Email screenshot link, creator permission page, issue comment, etc."
                value={form.permissionEvidenceUrl}
              />
            </div>
            <div>
              <FieldLabel optional={!needsThirdPartyNotes}>
                Rights Notes
              </FieldLabel>
              <textarea
                className={`${inputClassName} min-h-28 resize-none`}
                disabled={form.isSubmitting}
                onChange={(event) => form.setRightsNotes(event.target.value)}
                placeholder="Explain third-party assets, unknown license details, or anything admins should verify."
                value={form.rightsNotes}
              />
            </div>
            <div className="space-y-3">
              <CheckboxField
                checked={form.ownershipConfirmed}
                disabled={form.isSubmitting}
                onChange={form.setOwnershipConfirmed}
              >
                I created this game or have permission from the rights holder to
                submit it.
              </CheckboxField>
              <CheckboxField
                checked={form.hostingConfirmed}
                disabled={form.isSubmitting}
                onChange={form.setHostingConfirmed}
              >
                Pixelated may host this submitted build for moderation review and
                non-commercial cloud library use if approved.
              </CheckboxField>
              <CheckboxField
                checked={form.rightsConfirmed}
                disabled={form.isSubmitting}
                onChange={form.setRightsConfirmed}
              >
                The submitted ROM/build, code, art, audio, and included assets can
                be hosted under the rights information I provided.
              </CheckboxField>
            </div>
          </section>
        )}

        <div
          className="mt-10 flex flex-col gap-3 border-t pt-8 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderTopColor: "#C02066" }}
        >
          <PublishActionButton
            disabled={backDisabled}
            onClick={goBack}
            type="button"
          >
            <ChevronLeft className="h-5 w-5" />
            Back
          </PublishActionButton>
          {step < steps.length - 1 ? (
            <PublishActionButton
              disabled={!canContinue}
              onClick={goNext}
              type="button"
            >
              {!canContinue && <XCircle className="h-5 w-5" />}
              Continue
              <ChevronRight className="h-5 w-5" />
            </PublishActionButton>
          ) : (
            <PublishActionButton disabled={!canSubmit} type="submit">
              {form.isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Uploading...
                </>
              ) : !canSubmit ? (
                <>
                  <XCircle className="h-5 w-5" />
                  Submit for Review
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  Submit for Review
                </>
              )}
            </PublishActionButton>
          )}
        </div>
      </form>
    </div>
  );
}
