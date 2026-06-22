import { useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { ApiError, api } from "../../../../lib/api/apiClient";
import { getSocialErrorMessage } from "../../socialFeedback";

export function useCommentReporting(currentUser: User | null) {
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(
    null,
  );
  const [reportReason, setReportReason] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const reportPendingRef = useRef(false);

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
    if (reportPendingRef.current) return;

    reportPendingRef.current = true;
    setIsSubmittingReport(true);
    setReportError("");
    try {
      await api.reportComment(reportingCommentId, reportReason.trim());
      setReportMessage(
        "Report submitted successfully. Thank you for keeping the community safe!",
      );
      closeReportModal();
    } catch (err) {
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
    } finally {
      reportPendingRef.current = false;
      setIsSubmittingReport(false);
    }
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
