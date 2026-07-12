import type { usePublishSubmissionForm } from "../usePublishSubmissionForm";
import { CheckboxField, FieldLabel } from "../PublishFormUi";
import { inputClassName } from "../PublishFormConstants";

type PublishFormState = ReturnType<typeof usePublishSubmissionForm>;

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
