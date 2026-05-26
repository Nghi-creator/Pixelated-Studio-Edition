import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { ApiError, api } from "../../../lib/apiClient";

export function useCommentReporting(currentUser: User | null) {
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(
    null,
  );
  const [reportReason, setReportReason] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const closeReportModal = () => {
    setReportingCommentId(null);
    setReportReason("");
  };

  const handleSubmitReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser || !reportingCommentId || !reportReason.trim()) return;

    setIsSubmittingReport(true);
    try {
      await api.reportComment(reportingCommentId, reportReason.trim());
      alert(
        "Report submitted successfully. Thank you for keeping the community safe!",
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        alert(
          "You have already reported this comment. Our moderators are reviewing it.",
        );
        return;
      }

      console.error("Failed to submit report:", err);
      alert("Failed to submit report. Please try again.");
    } finally {
      setIsSubmittingReport(false);
      closeReportModal();
    }
  };

  return {
    closeReportModal,
    handleSubmitReport,
    isSubmittingReport,
    reportReason,
    reportingCommentId,
    setReportingCommentId,
    setReportReason,
  };
}
