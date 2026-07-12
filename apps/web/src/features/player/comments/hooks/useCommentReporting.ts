import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { ApiError } from "../../../../lib/api/apiClient";
import { useReportCommentMutation } from "./commentMutations";
import { getSocialErrorMessage } from "../../socialFeedback";

export function useCommentReporting(currentUser: User | null) {
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(
    null,
  );
  const [reportReason, setReportReason] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportMessage, setReportMessage] = useState("");

  const reportMutation = useReportCommentMutation({
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setReportError(
          "You have already reported this comment. Our moderators are reviewing it.",
        );
        return;
      }

      console.error("Failed to submit report:", err);
      setReportError(
        getSocialErrorMessage(err, "Failed to submit report. Please try again."),
      );
    },
    onSuccess: () => {
      setReportMessage(
        "Report submitted successfully. Thank you for keeping the community safe!",
      );
      closeReportModal();
    },
  });
  const isSubmittingReport = reportMutation.isPending;

  const closeReportModal = () => {
    setReportingCommentId(null);
    setReportReason("");
    setReportError("");
  };

  const openReportModal = (commentId: string) => {
    if (isSubmittingReport) return;
    setReportingCommentId(commentId);
    setReportReason("");
    setReportError("");
    setReportMessage("");
  };

  const handleSubmitReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser || !reportingCommentId || !reportReason.trim()) return;
    if (isSubmittingReport) return;

    setReportError("");
    await reportMutation
      .mutateAsync({
        commentId: reportingCommentId,
        reason: reportReason.trim(),
      })
      .catch(() => undefined);
  };

  return {
    closeReportModal,
    handleSubmitReport,
    isSubmittingReport,
    openReportModal,
    reportError,
    reportMessage,
    reportReason,
    reportingCommentId,
    setReportingCommentId,
    setReportReason,
  };
}
