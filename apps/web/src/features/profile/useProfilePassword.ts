import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "../../lib/auth/supabaseClient";
import { getPasswordPolicyError } from "../../lib/auth/passwordPolicy";
import { isAuthCaptchaEnabled } from "../auth/captchaConfig";
import { buildPasswordReauthPayload } from "./profileAuthCaptcha";
import type { PasswordMessage } from "./profileSettingsTypes";

export function useProfilePassword({
  captchaToken,
  onCaptchaChallengeReset,
  user,
}: {
  captchaToken?: string;
  onCaptchaChallengeReset?: () => void;
  user: SupabaseUser | null;
}) {
  const passwordMutationRef = useRef(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] =
    useState<PasswordMessage | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const updatePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.email || passwordMutationRef.current) return;
    passwordMutationRef.current = true;
    setSavingPassword(true);
    setPasswordMessage(null);

    try {
      const policyError = getPasswordPolicyError(newPassword);
      if (policyError) throw new Error(policyError);

      const { error: verifyError } = await supabase.auth.signInWithPassword(
        buildPasswordReauthPayload({
          captchaToken,
          email: user.email,
          isCaptchaEnabled: isAuthCaptchaEnabled,
          password: currentPassword,
        }),
      );
      if (verifyError) throw new Error("Current password is incorrect.");

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      setPasswordMessage({
        type: "success",
        text: "Password updated successfully.",
      });
      setCurrentPassword("");
      setNewPassword("");
    } catch (error: unknown) {
      if (error instanceof Error) {
        setPasswordMessage({ type: "error", text: error.message });
      } else {
        setPasswordMessage({
          type: "error",
          text: "Failed to update password.",
        });
      }
    } finally {
      onCaptchaChallengeReset?.();
      passwordMutationRef.current = false;
      setSavingPassword(false);
    }
  };

  return {
    currentPassword,
    newPassword,
    passwordMessage,
    savingPassword,
    setCurrentPassword,
    setNewPassword,
    updatePassword,
  };
}
