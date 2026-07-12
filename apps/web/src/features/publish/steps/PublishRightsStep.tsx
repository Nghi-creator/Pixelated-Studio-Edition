import { ChoiceGroup } from "../PublishFormUi";
import type { usePublishSubmissionForm } from "../usePublishSubmissionForm";

type PublishFormState = ReturnType<typeof usePublishSubmissionForm>;

export function PublishRightsStep({ form }: { form: PublishFormState }) {
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-extrabold text-white">Rights Questions</h2>
      <ChoiceGroup disabled={form.isSubmitting} label="Who owns or controls this game?" onChange={form.setOwnershipStatus} options={[
        { description: "You or your team made the game and can submit it.", label: "I created it", value: "creator" },
        { description: "You have permission from the creator or rights holder.", label: "I have permission", value: "permission" },
        { description: "It comes from a public project or public release.", label: "Public project", value: "public_project" },
        { description: "The situation needs extra explanation.", label: "Other", value: "other" },
      ]} value={form.ownershipStatus} />
      <ChoiceGroup disabled={form.isSubmitting} label="How can Pixelated host the playable build?" onChange={form.setHostingPermission} options={[
        { description: "You explicitly allow Pixelated to host it for review and the non-commercial library.", label: "I give permission", value: "creator_permission" },
        { description: "A public license allows Pixelated to host it.", label: "The license allows it", value: "license_allows" },
        { description: "You are not sure yet. This cannot be submitted until clarified.", label: "Not sure", value: "not_sure" },
      ]} value={form.hostingPermission} />
      <ChoiceGroup disabled={form.isSubmitting} label="Does it use third-party code, art, music, sound, or ROM content?" onChange={form.setThirdPartyContent} options={[
        { description: "Everything in the submitted build is yours or your team's.", label: "No", value: "no" },
        { description: "Some content came from another creator, library, pack, or project.", label: "Yes", value: "yes" },
        { description: "You are unsure whether every included piece is yours.", label: "Not sure", value: "not_sure" },
      ]} value={form.thirdPartyContent} />
      <ChoiceGroup disabled={form.isSubmitting} label="Is there a public license?" onChange={form.setPublicLicenseScope} options={[
        { description: "No formal public license; you own it and grant Pixelated hosting permission.", label: "No formal license", value: "none_owned" },
        { description: "A public license applies to the source/code.", label: "Code license", value: "code" },
        { description: "A public license applies to the art/audio/assets.", label: "Asset license", value: "assets" },
        { description: "One public license applies to the whole game.", label: "Whole game license", value: "everything" },
        { description: "You do not know the exact license yet.", label: "Not sure", value: "not_sure" },
      ]} value={form.publicLicenseScope} />
    </section>
  );
}
