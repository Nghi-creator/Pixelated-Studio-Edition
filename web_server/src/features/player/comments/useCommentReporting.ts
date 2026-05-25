import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";

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
      const { error } = await supabase.from("reported_comments").insert({
        comment_id: reportingCommentId,
        reporter_id: currentUser.id,
        reason: reportReason.trim(),
      });

      if (error) {
        if (error.code === "23505") {
          alert(
            "You have already reported this comment. Our moderators are reviewing it.",
          );
        } else {
          throw error;
        }
      } else {
        alert(
          "Report submitted successfully. Thank you for keeping the community safe!",
        );
      }
    } catch (err) {
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
