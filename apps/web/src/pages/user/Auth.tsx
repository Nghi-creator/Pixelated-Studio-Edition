import { useCallback, useState } from "react";
import { getPublicAppUrl } from "../../lib/navigation/appUrl";
import { PixelIcon } from "../../components/ui/PixelIcon";
import {
  AuthMessagePanel,
  EmailAuthForm,
  ForgotPasswordForm,
} from "../../features/auth/AuthPanels";
import { useAuthForm } from "../../features/auth/useAuthForm";

export default function Auth() {
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const resetCaptchaChallenge = useCallback(() => {
    setCaptchaResetKey((key) => key + 1);
  }, []);
  const signupPendingMessage =
    "Check your email for the next step. Existing accounts were not changed.";
  const hostedAuthOptions = {
    captchaToken,
    onCaptchaChallengeReset: resetCaptchaChallenge,
    oauthRedirectTo: getPublicAppUrl(),
    resetPasswordRedirectTo: `${getPublicAppUrl()}/reset-password`,
    resetPasswordRequest: {
      redirectTo: `${getPublicAppUrl()}/reset-password`,
    },
    signUp: {
      emailRedirectTo: getPublicAppUrl(),
    },
    signUpEmailRedirectTo: getPublicAppUrl(),
    signupPendingMessage,
  };
  const form = useAuthForm(hostedAuthOptions);

  return (
    <div className="pixel-animated-backdrop min-h-[85vh] flex items-center justify-center p-4">
      <div className="relative z-10 w-full max-w-[26rem] bg-synth-surface border border-synth-border rounded-lg shadow-card p-6 sm:p-7">
        <div className="text-center mb-7">
          <PixelIcon
            className="mx-auto mb-4 h-12 w-12 text-synth-secondary"
            name="brand"
          />
          <h2 className="text-3xl font-bold text-white mb-2">
            {form.isForgotPassword
              ? "Reset Password"
              : form.isLogin
                ? "Welcome Back"
                : "Create Account"}
          </h2>
          <p className="text-white/80">
            {form.isForgotPassword
              ? "Enter your email and we'll send you a link."
              : form.isLogin
                ? "Enter your details to access your library."
                : "Sign up to favorite games and track progress."}
          </p>
        </div>

        <AuthMessagePanel
          captchaToken={captchaToken}
          error={form.error}
          isAuthCaptchaEnabled={form.isAuthCaptchaEnabled}
          message={form.message}
          onResendConfirmation={() => void form.handleResendConfirmation()}
          resendCooldown={form.resendCooldown}
          resendLoading={form.resendLoading}
          verificationPendingEmail={form.verificationPendingEmail}
        />

        {form.isForgotPassword ? (
          <ForgotPasswordForm
            captchaResetKey={captchaResetKey}
            captchaToken={captchaToken}
            email={form.email}
            isAuthCaptchaEnabled={form.isAuthCaptchaEnabled}
            loading={form.loading}
            onEmailChange={form.setEmail}
            onSubmit={form.handleResetPassword}
            onTokenChange={setCaptchaToken}
            showSignIn={form.showSignIn}
          />
        ) : (
          <EmailAuthForm
            captchaResetKey={captchaResetKey}
            captchaToken={captchaToken}
            confirmPassword={form.confirmPassword}
            email={form.email}
            isAuthCaptchaEnabled={form.isAuthCaptchaEnabled}
            isLogin={form.isLogin}
            loading={form.loading}
            onConfirmPasswordChange={form.setConfirmPassword}
            onEmailChange={form.setEmail}
            onGithubAuth={() => form.handleOAuth("github")}
            onGoogleAuth={() => form.handleOAuth("google")}
            onGuestContinue={() => form.navigate("/home")}
            onPasswordChange={form.setPassword}
            onSubmit={form.handleEmailAuth}
            onTokenChange={setCaptchaToken}
            onToggleAuthMode={form.toggleAuthMode}
            password={form.password}
            setShowConfirmPassword={form.setShowConfirmPassword}
            setShowPassword={form.setShowPassword}
            showConfirmPassword={form.showConfirmPassword}
            showForgotPassword={form.showForgotPassword}
            showPassword={form.showPassword}
          />
        )}
      </div>
    </div>
  );
}
