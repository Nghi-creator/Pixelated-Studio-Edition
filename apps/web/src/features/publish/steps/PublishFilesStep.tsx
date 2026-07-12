import { CheckCircle, Image as ImageIcon } from "lucide-react";
import { PixelIcon } from "../../../components/ui/PixelIcon";
import { PublishFileField } from "../PublishFileField";
import { SUPPORTED_SUBMISSION_ROM_LABEL } from "../publishSubmission";
import type { usePublishSubmissionForm } from "../usePublishSubmissionForm";

type PublishFormState = ReturnType<typeof usePublishSubmissionForm>;

export function PublishFilesStep({ form }: { form: PublishFormState }) {
  const imageIcon = (selected: boolean) =>
    selected ? (
      <CheckCircle className="h-4 w-4" />
    ) : (
      <ImageIcon className="h-4 w-4" />
    );
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
        icon={form.romFile ? <CheckCircle className="h-5 w-5" /> : <PixelIcon className="h-5 w-5" name="upload" />}
        id="publish-rom"
        label={<>ROM File <span className="ml-1 text-synth-secondary">*</span></>}
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
          icon={imageIcon(Boolean(form.coverFile))}
          id="publish-cover"
          label={<>Cover Art <span className="font-normal lowercase text-gray-500">optional</span></>}
          onChange={(event) => form.handleImageChange(event, "cover", form.setCoverFile)}
          placeholder="Upload cover image"
          selectedBorderClass="border-synth-secondary"
        />
        <PublishFileField
          accept="image/*"
          describedBy={form.fileErrors.banner ? "publish-banner-error" : undefined}
          disabled={form.isSubmitting}
          error={form.fileErrors.banner}
          file={form.bannerFile}
          icon={imageIcon(Boolean(form.bannerFile))}
          id="publish-banner"
          label={<>Banner Art <span className="font-normal lowercase text-gray-500">optional</span></>}
          onChange={(event) => form.handleImageChange(event, "banner", form.setBannerFile)}
          placeholder="Upload banner image"
          selectedBorderClass="border-synth-secondary"
        />
      </div>
    </section>
  );
}
