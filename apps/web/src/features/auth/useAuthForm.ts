import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/auth/supabaseClient";
import { getPublicAppUrl } from "../../lib/navigation/appUrl";
import { getPasswordPolicyError } from "../../lib/auth/passwordPolicy";

const getAuthErrorMessage = (error: Error) => {
  if (error.message.toLowerCase().includes("email rate limit exceeded")) {
    return "Supabase's email limit has been reached. Wait before requesting another verification email.";
  }

  return error.message;
};

export function useAuthForm() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [verificationPendingEmail, setVerificationPendingEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timeout = window.setTimeout(
      () => setResendCooldown((seconds) => Math.max(0, seconds - 1)),
      1_000,
    );
    return () => window.clearTimeout(timeout);
  }, [resendCooldown]);

  const clearFeedback = () => {
    setError(null);
    setMessage(null);
  };

  const showForgotPassword = () => {
    setIsForgotPassword(true);
    clearFeedback();
  };

  const showSignIn = () => {
    setIsForgotPassword(false);
    clearFeedback();
  };

  const toggleAuthMode = () => {
    setIsLogin((current) => !current);
    setConfirmPassword("");
    setShowConfirmPassword(false);
    clearFeedback();
  };

  const handleEmailAuth = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    clearFeedback();

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate("/");
      } else {
        const passwordPolicyError = getPasswordPolicyError(password);
        if (passwordPolicyError) {
          throw new Error(passwordPolicyError);
        }

        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getPublicAppUrl(),
          },
        });
        if (error) throw error;
        setVerificationPendingEmail(email);
        setResendCooldown(60);
        setMessage(
          "Check your email for the next step. Existing accounts were not changed.",
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(getAuthErrorMessage(err));
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!verificationPendingEmail || resendCooldown > 0) return;

    setResendLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: verificationPendingEmail,
        options: {
          emailRedirectTo: getPublicAppUrl(),
        },
      });
      if (error) throw error;

      setResendCooldown(60);
      setMessage("A fresh verification email was sent. It expires in 5 minutes.");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? getAuthErrorMessage(err)
          : "Failed to resend the verification email.",
      );
    } finally {
      setResendLoading(false);
    }
  };

  const handleResetPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    clearFeedback();

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${getPublicAppUrl()}/reset-password`,
      });
      if (error) throw error;
      setMessage(
        "If this account supports password reset, a link will arrive shortly.",
      );
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(getAuthErrorMessage(err));
      } else {
        setError("Failed to send reset email.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "github") => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: getPublicAppUrl() },
    });
    if (error) setError(error.message);
    setLoading(false);
  };

  return {
    confirmPassword,
    email,
    error,
    handleEmailAuth,
    handleOAuth,
    handleResendConfirmation,
    handleResetPassword,
    isForgotPassword,
    isLogin,
    loading,
    message,
    navigate,
    password,
    resendCooldown,
    resendLoading,
    setConfirmPassword,
    setEmail,
    setPassword,
    setShowConfirmPassword,
    setShowPassword,
    showConfirmPassword,
    showForgotPassword,
    showPassword,
    showSignIn,
    toggleAuthMode,
    verificationPendingEmail,
  };
}
