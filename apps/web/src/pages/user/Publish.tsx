import { useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Send,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PixelIcon } from "../../components/ui/PixelIcon";
import {
  PublishActionButton,
  PublishProgress,
} from "../../features/publish/PublishFormUi";
import { publishSteps } from "../../features/publish/PublishFormConstants";
import { getSubmissionRightsErrors } from "../../features/publish/publishSubmission";
import {
  PublishBasicsStep,
  PublishEvidenceStep,
  PublishFilesStep,
  PublishRightsStep,
} from "../../features/publish/steps";
import { usePublishSubmissionForm } from "../../features/publish/usePublishSubmissionForm";

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
    setStep((current) => Math.min(current + 1, publishSteps.length - 1));
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
          to="/home"
        >
          Return to Library
        </Link>
      </div>
    );
  }

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
          to="/home"
        >
          <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
          Back to Library
        </Link>
      </div>

      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-extrabold text-white">Submit a Game</h1>
          <p className="mt-2 max-w-2xl text-lg text-gray-300">
            Send your homebrew build for cloud library review. We ask rights
            questions up front so admins can verify instead of guessing.
          </p>
        </div>
        <div className="rounded-full border border-synth-secondary/70 bg-synth-secondary/20 px-4 py-2 text-sm font-extrabold text-white">
          Step {step + 1} of {publishSteps.length}
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
            className="danger-panel mb-6 rounded-lg border px-4 py-3 text-sm font-bold"
            role="alert"
          >
            {visibleError}
          </div>
        )}

        {step === 0 && <PublishBasicsStep form={form} />}
        {step === 1 && <PublishFilesStep form={form} />}
        {step === 2 && <PublishRightsStep form={form} />}
        {step === 3 && <PublishEvidenceStep form={form} />}

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
          {step < publishSteps.length - 1 ? (
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
