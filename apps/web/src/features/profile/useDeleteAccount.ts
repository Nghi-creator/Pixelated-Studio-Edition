import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { ApiError, api } from "../../lib/api/apiClient";
import { supabase } from "../../lib/auth/supabaseClient";
import { isAuthCaptchaEnabled } from "../auth/captchaConfig";
import { buildPasswordReauthPayload } from "./profileAuthCaptcha";

export function useDeleteAccount({
  captchaToken,
  hasPassword,
  onCaptchaChallengeReset,
  user,
}: {
  captchaToken?: string;
  hasPassword: boolean | undefined;
  onCaptchaChallengeReset?: () => void;
  user: SupabaseUser | null;
}) {
  const navigate = useNavigate();
  const deleteMutationRef = useRef(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteError(null);
    setDeleteInput("");
  };

  const handleDeleteAccount = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || deleteMutationRef.current) return;
    deleteMutationRef.current = true;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      if (hasPassword) {
        const { error: verifyError } = await supabase.auth.signInWithPassword(
          buildPasswordReauthPayload({
            captchaToken,
            email: user.email!,
            isCaptchaEnabled: isAuthCaptchaEnabled,
            password: deleteInput,
          }),
        );
        if (verifyError) throw new Error("Incorrect password.");
      } else if (deleteInput !== "DELETE") {
        throw new Error("You must type exactly 'DELETE' to confirm.");
      }

      await api.deleteAccount();

      try {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) console.warn("Failed to clear deleted account session");
      } catch {
        console.warn("Failed to clear deleted account session");
      }
      navigate("/home", { replace: true });
    } catch (error: unknown) {
      if (
        error instanceof ApiError &&
        typeof error.payload === "object" &&
        error.payload &&
        "error" in error.payload &&
        typeof error.payload.error === "string"
      ) {
        setDeleteError(error.payload.error);
      } else if (error instanceof Error) {
        setDeleteError(error.message);
      } else {
        setDeleteError(
          "An unexpected error occurred while deleting your account.",
        );
      }
      deleteMutationRef.current = false;
      setIsDeleting(false);
    } finally {
      if (hasPassword) onCaptchaChallengeReset?.();
    }
  };

  return {
    closeDeleteModal,
    deleteError,
    deleteInput,
    handleDeleteAccount,
    isDeleting,
    setDeleteInput,
    setShowDeleteModal,
    showDeleteModal,
  };
}
