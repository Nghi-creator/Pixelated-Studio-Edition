import {
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import { useCallback, useState } from "react";
import { FaGithub, FaGoogle } from "react-icons/fa";
import { PASSWORD_MIN_LENGTH, PASSWORD_POLICY_HINT } from "../../lib/auth/passwordPolicy";
import { getPublicAppUrl } from "../../lib/navigation/appUrl";
import { PixelIcon } from "../../components/ui/PixelIcon";
import { AuthCaptcha } from "../../features/auth/AuthCaptcha";
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
  const {
    confirmPassword,
    email,
    error,
    handleEmailAuth,
    handleOAuth,
    handleResendConfirmation,
    handleResetPassword,
    isAuthCaptchaEnabled,
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
  } = useAuthForm(hostedAuthOptions);

  return (
    <div className="auth-backdrop min-h-[85vh] flex items-center justify-center p-4">
      <div className="relative z-10 w-full max-w-[26rem] bg-synth-surface border border-synth-border rounded-lg shadow-card p-6 sm:p-7">
        <div className="text-center mb-7">
          <PixelIcon
            className="mx-auto mb-4 h-12 w-12 text-synth-secondary"
            name="brand"
          />
          <h2 className="text-3xl font-bold text-white mb-2">
            {isForgotPassword
              ? "Reset Password"
              : isLogin
                ? "Welcome Back"
                : "Create Account"}
          </h2>
          <p className="text-white/80">
            {isForgotPassword
              ? "Enter your email and we'll send you a link."
              : isLogin
                ? "Enter your details to access your library."
                : "Sign up to favorite games and track progress."}
          </p>
        </div>

        {error && (
          <div className="danger-panel mb-6 rounded-lg border px-4 py-3 text-center text-sm font-bold">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-lg border border-[#C02066]/50 bg-[#9B0048]/15 px-4 py-3 text-center text-sm text-[#F38BB4]">
            <p>{message}</p>
            {verificationPendingEmail && (
              <button
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-md border border-[#C02066]/50 bg-[#9B0048]/20 px-3 py-2 font-semibold text-[#F38BB4] transition-colors hover:bg-[#9B0048]/30 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  resendLoading ||
                  resendCooldown > 0 ||
                  (isAuthCaptchaEnabled && !captchaToken)
                }
                onClick={() => void handleResendConfirmation()}
                type="button"
              >
                {resendLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {resendCooldown > 0
                  ? `Resend available in ${resendCooldown}s`
                  : "Resend verification email"}
              </button>
            )}
          </div>
        )}

        {/* FORGOT PASSWORD VIEW */}
        {isForgotPassword ? (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/70 w-5 h-5" />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-synth-bg border border-synth-border text-white placeholder:text-white/70 rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-synth-secondary transition-all"
                required
              />
            </div>

            <AuthCaptcha
              onTokenChange={setCaptchaToken}
              resetKey={captchaResetKey}
            />

            <button
              type="submit"
              disabled={loading || (isAuthCaptchaEnabled && !captchaToken)}
              className="w-full bg-synth-primary hover:bg-synth-primary-hover text-white font-bold py-3 rounded-lg transition-all flex justify-center items-center active:scale-[0.99]"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Send Reset Link"
              )}
            </button>

            <button
              type="button"
              onClick={showSignIn}
              className="w-full text-white/80 hover:text-white text-sm transition-colors flex items-center justify-center gap-2 mt-4"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Sign In
            </button>
          </form>
        ) : (
          /* STANDARD LOGIN / SIGNUP VIEW */
          <>
            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/70 w-5 h-5" />
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-synth-bg border border-synth-border text-white placeholder:text-white/70 rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-synth-secondary transition-all"
                  required
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/70 w-5 h-5" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={isLogin ? undefined : PASSWORD_MIN_LENGTH}
                  className="w-full bg-synth-bg border border-synth-border text-white placeholder:text-white/70 rounded-lg pl-10 pr-11 py-3 focus:outline-none focus:border-synth-secondary transition-all"
                  required
                />
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-white/70 transition-colors hover:text-white"
                  onClick={() => setShowPassword((visible) => !visible)}
                  title={showPassword ? "Hide password" : "Show password"}
                  type="button"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Forgot Password Link (Only shows on Login) */}
              {isLogin && (
                <div className="-mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={showForgotPassword}
                    className="text-synth-secondary hover:text-white text-sm transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              {!isLogin && (
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/70 w-5 h-5" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={PASSWORD_MIN_LENGTH}
                    onCopy={(e) => e.preventDefault()}
                    onCut={(e) => e.preventDefault()}
                    onPaste={(e) => e.preventDefault()}
                    className="w-full bg-synth-bg border border-synth-border text-white placeholder:text-white/70 rounded-lg pl-10 pr-11 py-3 focus:outline-none focus:border-synth-secondary transition-all"
                    required
                  />
                  <button
                    aria-label={
                      showConfirmPassword
                        ? "Hide confirmed password"
                        : "Show confirmed password"
                    }
                    className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-white/70 transition-colors hover:text-white"
                    onClick={() =>
                      setShowConfirmPassword((visible) => !visible)
                    }
                    title={
                      showConfirmPassword
                        ? "Hide confirmed password"
                        : "Show confirmed password"
                    }
                    type="button"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              )}

              {!isLogin && (
                <p className="-mt-2 text-xs leading-5 text-white/80">
                  {PASSWORD_POLICY_HINT}
                </p>
              )}

              <AuthCaptcha
                onTokenChange={setCaptchaToken}
                resetKey={captchaResetKey}
              />

              <button
                type="submit"
                disabled={loading || (isAuthCaptchaEnabled && !captchaToken)}
                className="w-full bg-synth-primary hover:bg-synth-primary-hover text-white font-bold py-3 rounded-lg transition-all flex justify-center items-center active:scale-[0.99]"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isLogin ? (
                  "Sign In"
                ) : (
                  "Sign Up"
                )}
              </button>
            </form>

            <div className="my-6 flex items-center">
              <div className="flex-grow border-t border-synth-border"></div>
              <span className="px-3 text-sm uppercase tracking-wider text-white">
                Or continue with
              </span>
              <div className="flex-grow border-t border-synth-border"></div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                onClick={() => handleOAuth("github")}
                className="flex min-w-0 items-center justify-center gap-2 whitespace-nowrap bg-synth-bg hover:bg-synth-elevated border border-synth-border text-white px-3 py-2.5 rounded-lg transition-all"
              >
                <FaGithub className="w-5 h-5" />
                GitHub
              </button>

              <button
                onClick={() => handleOAuth("google")}
                className="flex min-w-0 items-center justify-center gap-2 whitespace-nowrap bg-synth-bg hover:bg-synth-elevated border border-synth-border text-white px-3 py-2.5 rounded-lg transition-all"
              >
                <FaGoogle className="w-5 h-5" />
                Google
              </button>
            </div>

            <div className="text-center space-y-4">
              <button
                type="button"
                onClick={toggleAuthMode}
                className="text-white/80 hover:text-white text-sm transition-colors"
              >
                {isLogin
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Sign in"}
              </button>

              <div className="block">
                <button
                  type="button"
                  onClick={() => navigate("/home")}
                  className="text-synth-secondary hover:text-white text-sm font-medium transition-colors"
                >
                  Continue as Guest &rarr;
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
