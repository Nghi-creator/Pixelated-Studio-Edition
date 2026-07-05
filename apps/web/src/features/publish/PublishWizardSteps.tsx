import { CheckCircle, Image as ImageIcon } from "lucide-react";
import { PixelIcon } from "../../components/ui/PixelIcon";
import { PublishFileField } from "./PublishFileField";
import {
  SUPPORTED_SUBMISSION_ROM_LABEL,
} from "./publishSubmission";
import type { usePublishSubmissionForm } from "./usePublishSubmissionForm";
import {
  CheckboxField,
  ChoiceGroup,
  FieldLabel,
  inputClassName,
} from "./PublishFormUi";

type PublishFormState = ReturnType<typeof usePublishSubmissionForm>;

export function PublishBasicsStep({ form }: { form: PublishFormState }) {
  return (
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
  );
}

export function PublishFilesStep({ form }: { form: PublishFormState }) {
  return (
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
          describedBy={form.fileErrors.cover ? "publish-cover-error" : undefined}
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
          describedBy={form.fileErrors.banner ? "publish-banner-error" : undefined}
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
  );
}

export function PublishRightsStep({ form }: { form: PublishFormState }) {
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-extrabold text-white">Rights Questions</h2>
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
            description:
              "You explicitly allow Pixelated to host it for review and the non-commercial library.",
            label: "I give permission",
            value: "creator_permission",
          },
          {
            description: "A public license allows Pixelated to host it.",
            label: "The license allows it",
            value: "license_allows",
          },
          {
            description:
              "You are not sure yet. This cannot be submitted until clarified.",
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
            description:
              "Some content came from another creator, library, pack, or project.",
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
            description:
              "No formal public license; you own it and grant Pixelated hosting permission.",
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
  );
}

export function PublishEvidenceStep({ form }: { form: PublishFormState }) {
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

  return (
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
            onChange={(event) => form.setOriginalReleaseUrl(event.target.value)}
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
          <FieldLabel optional={!needsCodeLicense}>Code License SPDX</FieldLabel>
          <input
            className={inputClassName}
            disabled={form.isSubmitting}
            onChange={(event) => form.setCodeLicenseSpdx(event.target.value)}
            placeholder="MIT, GPL-3.0-only, MPL-2.0"
            value={form.codeLicenseSpdx}
          />
        </div>
        <div>
          <FieldLabel optional={!needsAssetLicense}>Asset License SPDX</FieldLabel>
          <input
            className={inputClassName}
            disabled={form.isSubmitting}
            onChange={(event) => form.setAssetLicenseSpdx(event.target.value)}
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
          onChange={(event) => form.setPermissionEvidenceUrl(event.target.value)}
          placeholder="Email screenshot link, creator permission page, issue comment, etc."
          value={form.permissionEvidenceUrl}
        />
      </div>
      <div>
        <FieldLabel optional={!needsThirdPartyNotes}>Rights Notes</FieldLabel>
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
          I created this game or have permission from the rights holder to submit it.
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
          The submitted ROM/build, code, art, audio, and included assets can be
          hosted under the rights information I provided.
        </CheckboxField>
      </div>
    </section>
  );
}
