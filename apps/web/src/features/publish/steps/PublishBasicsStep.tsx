import { inputClassName } from "../PublishFormConstants";
import { FieldLabel } from "../PublishFormUi";
import type { usePublishSubmissionForm } from "../usePublishSubmissionForm";

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
